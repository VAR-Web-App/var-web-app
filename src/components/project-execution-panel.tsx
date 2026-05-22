"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import {
  CheckCircleIcon,
  PlayCircleIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ExclamationCircleIcon,
  PlusIcon,
  TrashIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import {
  Deal,
  Distributor,
  QuoteLine,
  newId,
} from "@/types";
import {
  ProjectMilestone,
  ProjectChangeOrder,
  MilestoneStatus,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_STYLES,
  DEFAULT_BUILDER_MILESTONES,
} from "@/types/builder";
import {
  listMilestones,
  saveMilestone,
  saveMilestones,
  deleteMilestone,
  listQuoteLines,
  saveDeal,
  listDistributors,
  listChangeOrders,
  getSettings,
  refreshSubScheduleLink,
  effectiveContractValue,
} from "@/lib/store";
import { toE164, sendSms, composeAssignmentSms, composeRescheduleSms } from "@/lib/sms";
import Tooltip from "@/components/tooltip";
import WeatherBanner from "@/components/weather-banner";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function ProjectExecutionPanel({ deal }: { deal: Deal }) {
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [subs, setSubs] = useState<Distributor[]>([]);
  const [changeOrders, setChangeOrders] = useState<ProjectChangeOrder[]>([]);
  const [liveEstimateTotal, setLiveEstimateTotal] = useState(0);
  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      listMilestones(deal.id),
      listQuoteLines(deal.id),
      listDistributors(deal.org_ref),
      listChangeOrders(deal.id),
      getSettings(deal.org_ref),
    ]).then(
      ([m, lines, subList, cos, settings]) => {
        if (!active) return;
        setMilestones(m);
        setSubs(subList);
        setChangeOrders(cos);
        setQuoteLines(lines);
        setCompanyName(settings?.company_name || "");
        // Compute estimate total live from saved lines so we don't depend
        // on deal.total_quote_value being kept in sync (some flows like
        // floor-plan apply-to-estimate save lines but not the deal record).
        const live = lines.reduce((s, l) => s + (l.customer_extended || 0), 0);
        setLiveEstimateTotal(live);

        // Self-heal: if the cached deal.total_quote_value drifted from the
        // line total, persist the correction so other surfaces (pipeline
        // cards, etc.) read the right number.
        if (live > 0 && Math.abs(deal.total_quote_value - live) > 0.01) {
          const cost = lines.reduce((s, l) => s + (l.cost_extended || 0), 0);
          const margin = live > 0 ? ((live - cost) / live) * 100 : 0;
          void saveDeal({
            ...deal,
            total_quote_value: live,
            total_cost: cost,
            margin_percent: margin,
            updated_at: new Date().toISOString(),
          });
        }
        setLoaded(true);
      }
    );
    return () => { active = false; };
  }, [deal]);

  const totals = useMemo(() => {
    const totalAmount = milestones.reduce((s, m) => s + (m.amount || 0), 0);
    const released = milestones
      .filter((m) => m.status === "released")
      .reduce((s, m) => s + (m.released_amount || m.amount), 0);
    const approved = milestones
      .filter((m) => m.status === "approved" || m.status === "released")
      .reduce((s, m) => s + (m.amount || 0), 0);
    const completedCount = milestones.filter(
      (m) => m.status === "approved" || m.status === "released"
    ).length;
    return { totalAmount, released, approved, completedCount };
  }, [milestones]);

  // Contract value = award_total when signed, else live estimate from
  // saved quote lines (not deal.total_quote_value, which can lag).
  // Adjusted by approved change orders.
  const baseContract = deal.award_total > 0 ? deal.award_total : liveEstimateTotal;
  const contractValue = effectiveContractValue(baseContract, changeOrders);
  const approvedCoTotal = changeOrders
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + c.amount_delta, 0);

  /** Distinct phases parsed from the estimate's Phase column
   *  (QuoteLine.product_code, repurposed). Case-insensitive grouping,
   *  empty values bucketed as 'Other'. Order preserved by first
   *  appearance in the estimate. */
  const estimatePhases = useMemo(() => {
    const byKey = new Map<
      string,
      { label: string; amount: number; order: number }
    >();
    let next = 0;
    for (const l of quoteLines) {
      const raw = (l.product_code || "").trim();
      const key = raw.toLowerCase() || "other";
      const label = raw || "Other";
      const existing = byKey.get(key);
      if (existing) {
        existing.amount += l.customer_extended || 0;
      } else {
        byKey.set(key, { label, amount: l.customer_extended || 0, order: next++ });
      }
    }
    return Array.from(byKey.values())
      .filter((p) => p.amount > 0)
      .sort((a, b) => a.order - b.order);
  }, [quoteLines]);

  async function generateFromEstimate() {
    if (estimatePhases.length === 0) return;
    if (milestones.length > 0) {
      if (
        !confirm(
          `Replace existing milestones with ${estimatePhases.length} milestone${
            estimatePhases.length === 1 ? "" : "s"
          } derived from estimate phases?`
        )
      )
        return;
      for (const m of milestones) await deleteMilestone(m.id);
    }
    setSeeding(true);
    try {
      const total = estimatePhases.reduce((s, p) => s + p.amount, 0);
      const now = new Date().toISOString();
      const startSeed = deal.due_date ? new Date(deal.due_date) : new Date();
      let cursor = new Date(startSeed);
      // Reserve a default 14-day window per phase. The GC tunes durations
      // in the Gantt afterward — this is just a starting point.
      const PHASE_DAYS = 14;
      const generated: ProjectMilestone[] = estimatePhases.map((p, i) => {
        const phaseStart = new Date(cursor);
        const phaseEnd = new Date(cursor);
        phaseEnd.setDate(phaseEnd.getDate() + PHASE_DAYS);
        cursor = new Date(phaseEnd);
        const pct = total > 0 ? (p.amount / total) * 100 : 0;
        return {
          id: newId("ms"),
          deal_ref: deal.id,
          org_ref: deal.org_ref,
          name: p.label,
          description: "",
          order: i,
          percentage: Math.round(pct * 10) / 10,
          amount: Math.round(p.amount),
          status: "pending" as MilestoneStatus,
          planned_start_date: toIsoDate(phaseStart),
          planned_end_date: toIsoDate(phaseEnd),
          notes: "",
          created_at: now,
          updated_at: now,
        };
      });
      await saveMilestones(generated);
      setMilestones(generated);
    } finally {
      setSeeding(false);
    }
  }

  async function generateDefaults() {
    if (milestones.length > 0) {
      if (!confirm("Replace existing milestones with the default builder draw schedule?")) return;
      // Clear existing milestones first.
      for (const m of milestones) await deleteMilestone(m.id);
    }
    setSeeding(true);
    try {
      const now = new Date().toISOString();
      // Date generation: start from deal.due_date (target start) if set,
      // else today. Each phase runs for its default duration immediately
      // after the previous one finishes (no gaps, no overlaps — simple
      // sequential build schedule the GC can later edit).
      const startSeed = deal.due_date ? new Date(deal.due_date) : new Date();
      let cursor = new Date(startSeed);
      const generated: ProjectMilestone[] = DEFAULT_BUILDER_MILESTONES.map((t, i) => {
        const phaseStart = new Date(cursor);
        const phaseEnd = new Date(cursor);
        phaseEnd.setDate(phaseEnd.getDate() + t.default_duration_days);
        cursor = new Date(phaseEnd); // next phase begins where this ends
        return {
          id: newId("ms"),
          deal_ref: deal.id,
          org_ref: deal.org_ref,
          name: t.label,
          description: t.description,
          order: i,
          percentage: t.default_percent,
          amount: Math.round((contractValue * t.default_percent) / 100),
          status: "pending" as MilestoneStatus,
          planned_start_date: toIsoDate(phaseStart),
          planned_end_date: toIsoDate(phaseEnd),
          notes: "",
          created_at: now,
          updated_at: now,
        };
      });
      await saveMilestones(generated);
      setMilestones(generated);
    } finally {
      setSeeding(false);
    }
  }

  async function updateMilestoneDates(
    m: ProjectMilestone,
    patch: { planned_start_date?: string; planned_end_date?: string }
  ) {
    const updated: ProjectMilestone = {
      ...m,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    await saveMilestone(updated);
  }

  async function updateAssignedSubs(m: ProjectMilestone, subRefs: string[]) {
    const updated: ProjectMilestone = {
      ...m,
      assigned_subs: subRefs,
      updated_at: new Date().toISOString(),
    };
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    await saveMilestone(updated);
    // Text any sub newly added to this phase (removals don't notify).
    const added = subRefs.filter((id) => !(m.assigned_subs || []).includes(id));
    void notifyAssignedSubs(updated, added);
  }

  // Fire-and-forget SMS to subs newly assigned to a phase. Silent if the
  // sub has no mobile on file, the number is unparseable, or Twilio
  // isn't configured server-side — never blocks the assignment save.
  async function notifyAssignedSubs(m: ProjectMilestone, subIds: string[]) {
    for (const subId of subIds) {
      const sub = subs.find((s) => s.id === subId);
      if (!sub?.phone || !sub.sms_consent) continue;
      const to = toE164(sub.phone);
      if (!to) continue;
      void sendSms(
        to,
        composeAssignmentSms({
          builderName: companyName,
          projectName: deal.name,
          phaseName: m.name,
          address: deal.ship_to_address,
          startDate: m.planned_start_date,
          endDate: m.planned_end_date,
          scheduleLink: await subScheduleLink(sub.id),
        })
      );
    }
  }

  // Fire-and-forget SMS to every sub on a phase whose dates just changed.
  async function notifyRescheduledSubs(m: ProjectMilestone) {
    for (const subId of m.assigned_subs || []) {
      const sub = subs.find((s) => s.id === subId);
      if (!sub?.phone || !sub.sms_consent) continue;
      const to = toE164(sub.phone);
      if (!to) continue;
      void sendSms(
        to,
        composeRescheduleSms({
          builderName: companyName,
          projectName: deal.name,
          phaseName: m.name,
          startDate: m.planned_start_date,
          endDate: m.planned_end_date,
          scheduleLink: await subScheduleLink(sub.id),
        })
      );
    }
  }

  // Refresh + return the sub's no-login schedule URL, or undefined if the
  // snapshot write fails (e.g. Firestore rules not yet deployed).
  async function subScheduleLink(subId: string): Promise<string | undefined> {
    try {
      const token = await refreshSubScheduleLink(subId, companyName);
      return `${location.origin}/s/${token}`;
    } catch {
      return undefined;
    }
  }

  async function transition(m: ProjectMilestone, next: MilestoneStatus) {
    const now = new Date().toISOString();
    const patch: Partial<ProjectMilestone> = { status: next, updated_at: now };
    if (next === "in_progress") patch.started_at = m.started_at || now;
    if (next === "awaiting_approval") patch.marked_complete_at = now;
    if (next === "approved") patch.approved_at = now;
    if (next === "released") {
      patch.released_at = now;
      patch.released_amount = m.amount;
    }
    const updated: ProjectMilestone = { ...m, ...patch };
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    await saveMilestone(updated);
  }

  async function removeMilestone(m: ProjectMilestone) {
    if (!confirm(`Remove milestone "${m.name}"?`)) return;
    await deleteMilestone(m.id);
    setMilestones((prev) => prev.filter((x) => x.id !== m.id));
  }

  if (!loaded) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
        <p className="text-sm text-slate-500">Loading project schedule…</p>
      </section>
    );
  }

  if (milestones.length === 0) {
    const hasEstimatePhases = estimatePhases.length > 0;
    return (
      <section className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Project schedule + draw plan</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          {hasEstimatePhases
            ? `Generate ${estimatePhases.length} milestone${
                estimatePhases.length === 1 ? "" : "s"
              } from your estimate phases — each phase becomes a billable draw the client approves. Or start from the default 9-phase template.`
            : "Generate the default 9-phase builder draw schedule. Each phase becomes a billable milestone — the client approves completion to release the next draw."}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {hasEstimatePhases && (
            <Tooltip
              variant="directive"
              label={`Turn each phase in your estimate into a billable milestone. The client approves completion of each phase to release that phase's payment (a "draw").`}
            >
              <button
                onClick={generateFromEstimate}
                disabled={seeding}
                className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
              >
                <PlusIcon className="h-4 w-4" />
                {seeding ? "Generating…" : "Generate from estimate"}
              </button>
            </Tooltip>
          )}
          <Tooltip
            variant={hasEstimatePhases ? "info" : "directive"}
            label="Use the standard 9-phase residential build schedule (Demo → Foundation → Framing → … → Punch list). Each phase is a draw the client approves. You can edit phases + dates afterward."
          >
            <button
              onClick={generateDefaults}
              disabled={seeding || contractValue === 0}
              className={
                hasEstimatePhases
                  ? "inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  : "inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
              }
            >
              <PlusIcon className="h-4 w-4" />
              {seeding
                ? "Generating…"
                : hasEstimatePhases
                  ? "Use default template"
                  : "Generate default schedule"}
            </button>
          </Tooltip>
        </div>
        {contractValue === 0 && !hasEstimatePhases && (
          <p className="mt-3 text-xs text-sky-700">
            Add an estimate first — milestone $ amounts roll up from the contract value.
          </p>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <WeatherBanner deal={deal} milestones={milestones} />
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Project Schedule + Draws</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {totals.completedCount} of {milestones.length} milestones complete · {fmtMoney(totals.released)} of {fmtMoney(totals.totalAmount)} paid
          </p>
        </div>
        <div className="flex items-center gap-3">
          {estimatePhases.length > 0 && (
            <button
              onClick={generateFromEstimate}
              className="text-xs font-medium text-sky-700 hover:text-sky-900"
              title={`Regenerate from ${estimatePhases.length} estimate phase${
                estimatePhases.length === 1 ? "" : "s"
              }`}
            >
              Regenerate from estimate
            </button>
          )}
          <button
            onClick={generateDefaults}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
            title="Reset to default 9-phase schedule"
          >
            Reset to defaults
          </button>
        </div>
      </div>

      <ScheduleTimeline milestones={milestones} />

      <GanttChart
        milestones={milestones}
        onChangeDates={updateMilestoneDates}
        onReschedule={notifyRescheduledSubs}
      />

      <ul className="divide-y divide-slate-100">
        {milestones.map((m) => (
          <MilestoneRow
            key={m.id}
            milestone={m}
            dealId={deal.id}
            subs={subs}
            onTransition={(next) => transition(m, next)}
            onAssignSubs={(refs) => updateAssignedSubs(m, refs)}
            onRemove={() => removeMilestone(m)}
          />
        ))}
      </ul>

      <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-200 bg-slate-50">
        <Stat
          label="Contract"
          value={fmtMoney(contractValue)}
          footnote={approvedCoTotal !== 0
            ? `Base ${fmtMoney(baseContract)} ${approvedCoTotal >= 0 ? "+" : "−"} ${fmtMoney(Math.abs(approvedCoTotal))} COs`
            : undefined}
        />
        <Stat label="Approved" value={fmtMoney(totals.approved)} accent="emerald" />
        <Stat label="Paid" value={fmtMoney(totals.released)} accent="emerald" />
      </div>
    </section>
    </div>
  );
}

function ScheduleTimeline({ milestones }: { milestones: ProjectMilestone[] }) {
  // Visual horizontal timeline: each milestone gets a flex-1 segment whose
  // width is proportional to its percentage. Color reflects status.
  return (
    <div className="border-b border-slate-200 px-6 py-4">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
        {milestones.map((m, i) => (
          <div
            key={m.id}
            className={timelineSegmentColor(m.status)}
            style={{ flex: m.percentage }}
            title={`${m.name} · ${m.percentage}% · ${MILESTONE_STATUS_LABELS[m.status]}`}
            aria-label={`${m.name}: ${MILESTONE_STATUS_LABELS[m.status]}`}
          >
            {/* segment */}
            {i < milestones.length - 1 && (
              <div className="h-full w-px bg-white/60" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <Legend color="bg-slate-300" label="Pending" />
        <Legend color="bg-sky-500" label="In progress" />
        <Legend color="bg-amber-500" label="Awaiting approval" />
        <Legend color="bg-emerald-500" label="Approved" />
        <Legend color="bg-emerald-700" label="Paid" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2 w-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function timelineSegmentColor(status: MilestoneStatus): string {
  switch (status) {
    case "pending":
      return "bg-slate-300";
    case "in_progress":
      return "bg-sky-500";
    case "awaiting_approval":
      return "bg-amber-500";
    case "approved":
      return "bg-emerald-500";
    case "released":
      return "bg-emerald-700";
    case "disputed":
      return "bg-red-500";
  }
}

function MilestoneRow({
  milestone: m,
  dealId,
  subs,
  onTransition,
  onAssignSubs,
  onRemove,
}: {
  milestone: ProjectMilestone;
  dealId: string;
  subs: Distributor[];
  onTransition: (next: MilestoneStatus) => void;
  onAssignSubs: (refs: string[]) => void;
  onRemove: () => void;
}) {
  const statusStyle = MILESTONE_STATUS_STYLES[m.status];
  // Show the draw-request link once the GC marks the phase complete
  // (awaiting_approval onward) — that's the point a draw can be billed.
  // Pending + in-progress phases get no link.
  const hasDrawRequest = m.status !== "pending" && m.status !== "in_progress";
  const [pickerOpen, setPickerOpen] = useState(false);

  const assignedRefs = m.assigned_subs || [];
  const assignedSubs = subs.filter((s) => assignedRefs.includes(s.id));

  return (
    <li className="flex items-start gap-3 px-6 py-4 hover:bg-slate-50">
      <StatusIcon status={m.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-sm font-medium text-slate-900">{m.name}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${statusStyle}`}>
            {MILESTONE_STATUS_LABELS[m.status]}
          </span>
          <span className="ml-auto text-xs tabular-nums text-slate-500">
            {m.percentage}% · {fmtMoney(m.amount)}
          </span>
        </div>
        {m.description && (
          <p className="mt-0.5 text-xs text-slate-500">{m.description}</p>
        )}

        {/* Assigned subs */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Subs:
          </span>
          {assignedSubs.length > 0 ? (
            assignedSubs.map((s) => (
              <span
                key={s.id}
                className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800"
                title={s.account_number}
              >
                {s.name}
              </span>
            ))
          ) : (
            <span className="text-[11px] italic text-slate-400">none assigned</span>
          )}
          <Tooltip label="Tag the subs working this phase. Used for accountability + populates sub bid requests on the RFQ panel.">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="rounded-full border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-sky-400 hover:text-sky-700"
            >
              + assign
            </button>
          </Tooltip>
          {pickerOpen && (
            <SubPicker
              subs={subs}
              selected={assignedRefs}
              onChange={onAssignSubs}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {nextActions(m.status).map((a) => (
            <Tooltip
              key={a.next}
              label={a.hint}
              variant={a.style.includes("bg-sky-700") || a.style.includes("bg-emerald-600") ? "directive" : "info"}
            >
              <button
                onClick={() => onTransition(a.next)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${a.style}`}
              >
                {a.label}
              </button>
            </Tooltip>
          ))}
          {hasDrawRequest && (
            <Tooltip label="Open the draw request page — generate a branded invoice PDF for the client, optionally push to QuickBooks.">
              <Link
                href={`/deals/${dealId}/draw/${m.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <DocumentTextIcon className="h-3.5 w-3.5" />
                Draw / Invoice
              </Link>
            </Tooltip>
          )}
          {m.qb_invoice_number && (
            <Tooltip
              label={`Synced to QuickBooks${m.qb_synced_at ? ` on ${new Date(m.qb_synced_at).toLocaleDateString()}` : ""}. Invoice ${m.qb_invoice_number} is in your QuickBooks Online.`}
            >
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                QB · {m.qb_invoice_number}
              </span>
            </Tooltip>
          )}
          <button
            onClick={onRemove}
            className="ml-auto rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
            title="Remove milestone"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

function SubPicker({
  subs,
  selected,
  onChange,
  onClose,
}: {
  subs: Distributor[];
  selected: string[];
  onChange: (refs: string[]) => void;
  onClose: () => void;
}) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  if (subs.length === 0) {
    return (
      <div className="absolute z-30 mt-7 max-w-xs rounded-md border border-slate-200 bg-white p-3 text-xs shadow-lg">
        <p className="text-slate-600">
          No subs in your directory yet. Add them on the Subs &amp; Suppliers page.
        </p>
        <button
          onClick={onClose}
          className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="absolute z-30 mt-7 max-h-60 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg">
      <div className="mb-1 flex items-center justify-between border-b border-slate-100 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Assign subs
        </span>
        <button
          onClick={onClose}
          className="text-[11px] text-slate-500 hover:text-slate-700"
        >
          Done
        </button>
      </div>
      {subs.map((s) => {
        const checked = selected.includes(s.id);
        return (
          <label
            key={s.id}
            className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50 ${
              checked ? "bg-sky-50" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(s.id)}
              className="mt-0.5 rounded text-sky-600 focus:ring-sky-500"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-900">{s.name}</p>
              {s.account_number && (
                <p className="truncate text-[10px] text-slate-500">{s.account_number}</p>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}

function StatusIcon({ status }: { status: MilestoneStatus }) {
  const cls = "h-5 w-5 mt-0.5 flex-shrink-0";
  switch (status) {
    case "pending":
      return <ClockIcon className={`${cls} text-slate-400`} />;
    case "in_progress":
      return <PlayCircleIcon className={`${cls} text-sky-600`} />;
    case "awaiting_approval":
      return <ClockIcon className={`${cls} text-amber-600`} />;
    case "approved":
      return <CheckCircleIcon className={`${cls} text-emerald-600`} />;
    case "released":
      return <CurrencyDollarIcon className={`${cls} text-emerald-700`} />;
    case "disputed":
      return <ExclamationCircleIcon className={`${cls} text-red-600`} />;
  }
}

function nextActions(status: MilestoneStatus): { next: MilestoneStatus; label: string; style: string; hint: string }[] {
  const primary = "bg-sky-700 text-white hover:bg-sky-800";
  const secondary = "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  const success = "bg-emerald-600 text-white hover:bg-emerald-700";

  switch (status) {
    case "pending":
      return [{
        next: "in_progress",
        label: "Start phase",
        style: primary,
        hint: "Mark this phase as actively under construction. The client portal shows it as in-progress.",
      }];
    case "in_progress":
      return [{
        next: "awaiting_approval",
        label: "Mark complete (request draw)",
        style: primary,
        hint: "Tell the client this phase is done. This unlocks the draw / invoice for this phase, and the client sees an approval-and-pay button on their portal.",
      }];
    case "awaiting_approval":
      return [
        {
          next: "approved",
          label: "Client approved",
          style: success,
          hint: "Manually log client approval (use if the client confirmed by phone/email instead of clicking the portal button).",
        },
        {
          next: "in_progress",
          label: "Re-open",
          style: secondary,
          hint: "Pull the phase back to in-progress — use if you need to fix something the client flagged.",
        },
        {
          next: "disputed",
          label: "Mark disputed",
          style: secondary,
          hint: "Flag a payment dispute. Pauses the workflow until you reach resolution.",
        },
      ];
    case "approved":
      return [{
        next: "released",
        label: "Mark paid",
        style: success,
        hint: "Record that you received the draw payment from the client. Counts toward the project's paid total.",
      }];
    case "released":
      return [];
    case "disputed":
      return [
        {
          next: "in_progress",
          label: "Resolve & resume",
          style: primary,
          hint: "Mark the dispute settled and put the phase back into active work.",
        },
      ];
  }
}

function Stat({
  label,
  value,
  accent,
  footnote,
}: {
  label: string;
  value: string;
  accent?: "emerald";
  footnote?: string;
}) {
  const color = accent === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="px-6 py-4 text-center">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      {footnote && <div className="mt-0.5 text-[10px] text-slate-500">{footnote}</div>}
    </div>
  );
}

// ── Gantt chart ──────────────────────────────────────────────────
// Time-based horizontal bars. Each row = one phase, position + width
// computed from planned_start/end dates relative to the project window
// (earliest start → latest end). A vertical "today" line is drawn if
// today falls inside the window. Click a bar to edit its date range.

function GanttChart({
  milestones,
  onChangeDates,
  onReschedule,
}: {
  milestones: ProjectMilestone[];
  onChangeDates: (m: ProjectMilestone, patch: { planned_start_date?: string; planned_end_date?: string }) => void;
  onReschedule: (m: ProjectMilestone) => void;
}) {
  // Today is captured once on mount via useEffect — calling Date.now()
  // during render violates React's purity rules and triggers a lint
  // error in Next 16. The "Today" line stays put for the session.
  const [todayMs, setTodayMs] = useState<number | null>(null);
  useEffect(() => {
    setTodayMs(Date.now());
  }, []);

  const dated = milestones.filter((m) => m.planned_start_date && m.planned_end_date);
  if (dated.length === 0) {
    return (
      <div className="border-b border-slate-200 px-6 py-4 text-xs text-slate-500">
        Phase dates not set yet — regenerate the schedule to populate, or click a milestone below to edit dates.
      </div>
    );
  }

  // Project window
  const startMs = Math.min(...dated.map((m) => Date.parse(m.planned_start_date!)));
  const endMs = Math.max(...dated.map((m) => Date.parse(m.planned_end_date!)));
  const totalMs = Math.max(1, endMs - startMs);
  const todayInRange = todayMs !== null && todayMs >= startMs && todayMs <= endMs;
  const todayPercent = todayMs !== null ? ((todayMs - startMs) / totalMs) * 100 : 0;

  // Month tick marks for the date axis
  const ticks: { ms: number; label: string }[] = [];
  const cursor = new Date(startMs);
  cursor.setDate(1);
  while (cursor.getTime() <= endMs) {
    ticks.push({
      ms: cursor.getTime(),
      label: cursor.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div className="border-b border-slate-200 bg-slate-50/40">
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Schedule (Gantt)
        </div>
        <div className="text-[10px] text-slate-400">
          {new Date(startMs).toLocaleDateString()} → {new Date(endMs).toLocaleDateString()}
          {" · "}
          {Math.ceil(totalMs / (1000 * 60 * 60 * 24 * 7))} weeks
        </div>
      </div>

      <div className="px-6 pb-4">
        {/* Date axis (month ticks) */}
        <div className="relative mb-1 h-4 border-b border-slate-200">
          {ticks.map((t) => {
            const left = ((t.ms - startMs) / totalMs) * 100;
            if (left < 0 || left > 100) return null;
            return (
              <div
                key={t.ms}
                className="absolute top-0 -translate-x-1/2 text-[9px] uppercase tracking-wider text-slate-400"
                style={{ left: `${left}%` }}
              >
                {t.label}
              </div>
            );
          })}
        </div>

        {/* Bars */}
        <div className="relative space-y-1.5">
          {todayInRange && (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red-400"
              style={{ left: `${todayPercent}%` }}
              aria-hidden
            >
              <div className="absolute -top-3 -translate-x-1/2 whitespace-nowrap rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                Today
              </div>
            </div>
          )}
          {dated.map((m) => {
            const ms = Date.parse(m.planned_start_date!);
            const me = Date.parse(m.planned_end_date!);
            const left = ((ms - startMs) / totalMs) * 100;
            const width = Math.max(0.5, ((me - ms) / totalMs) * 100);
            return (
              <GanttBar
                key={m.id}
                milestone={m}
                left={left}
                width={width}
                onChangeDates={(patch) => onChangeDates(m, patch)}
                onReschedule={() => onReschedule(m)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GanttBar({
  milestone: m,
  left,
  width,
  onChangeDates,
  onReschedule,
}: {
  milestone: ProjectMilestone;
  left: number;
  width: number;
  onChangeDates: (patch: { planned_start_date?: string; planned_end_date?: string }) => void;
  onReschedule: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const color = ganttBarColor(m.status);

  // Snapshot the dates when the editor opens so closing it can tell
  // whether anything actually changed — date <input>s fire onChange per
  // keystroke, so we notify the assigned subs once, on close, not on
  // every edit.
  const datesAtOpen = useRef<{ start?: string; end?: string } | null>(null);
  function openEditor() {
    datesAtOpen.current = {
      start: m.planned_start_date,
      end: m.planned_end_date,
    };
    setEditing(true);
  }
  function closeEditor() {
    const snap = datesAtOpen.current;
    if (
      snap &&
      (snap.start !== m.planned_start_date || snap.end !== m.planned_end_date)
    ) {
      onReschedule();
    }
    datesAtOpen.current = null;
    setEditing(false);
  }

  return (
    <div className="relative h-7">
      <div className="absolute inset-y-0 left-0 right-0 rounded bg-slate-100" />
      <button
        onClick={() => (editing ? closeEditor() : openEditor())}
        className={`absolute inset-y-0 flex items-center overflow-hidden rounded text-[10px] font-medium text-white shadow-sm transition-opacity hover:opacity-90 ${color}`}
        style={{ left: `${left}%`, width: `${width}%` }}
        title={`${m.name} · ${m.planned_start_date} → ${m.planned_end_date}`}
      >
        <span className="truncate px-2">{m.name}</span>
      </button>

      {editing && (
        <div className="absolute right-0 top-8 z-20 rounded-md border border-slate-200 bg-white p-3 text-xs shadow-lg">
          <div className="mb-2 font-semibold text-slate-700">{m.name}</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">Start</span>
              <input
                type="date"
                value={m.planned_start_date || ""}
                onChange={(e) => onChangeDates({ planned_start_date: e.target.value })}
                className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">End</span>
              <input
                type="date"
                value={m.planned_end_date || ""}
                onChange={(e) => onChangeDates({ planned_end_date: e.target.value })}
                className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              onClick={closeEditor}
              className="rounded bg-slate-800 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-900"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ganttBarColor(status: MilestoneStatus): string {
  switch (status) {
    case "pending":
      return "bg-slate-400";
    case "in_progress":
      return "bg-sky-500";
    case "awaiting_approval":
      return "bg-amber-500";
    case "approved":
      return "bg-emerald-500";
    case "released":
      return "bg-emerald-700";
    case "disputed":
      return "bg-red-500";
  }
}

function toIsoDate(d: Date): string {
  // YYYY-MM-DD in local timezone (HTML date inputs expect this format).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
