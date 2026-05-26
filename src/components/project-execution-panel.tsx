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
  SubAcknowledgment,
} from "@/types/builder";
import {
  listMilestones,
  saveMilestone,
  saveMilestones,
  deleteMilestone,
  listQuoteLines,
  saveDeal,
  listDeals,
  listDistributors,
  listChangeOrders,
  getSettings,
  refreshSubScheduleLink,
  listSubAcknowledgmentsByDeal,
  listAllMilestonesForOrg,
  effectiveContractValue,
} from "@/lib/store";
import {
  buildConflictLookup,
  findSubConflicts,
  fmtRange,
  type ConflictLookup,
  type SubConflict,
} from "@/lib/conflicts";
import { toE164, sendSms, composeAssignmentSms, composeRescheduleSms } from "@/lib/sms";
import {
  sendEmail,
  composeAssignmentEmail,
  composeRescheduleEmail,
  isLikelyEmail,
} from "@/lib/email-compose";
import { pushNotifySub } from "@/lib/push-client";
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
  const [acks, setAcks] = useState<SubAcknowledgment[]>([]);
  const [orgMilestones, setOrgMilestones] = useState<ProjectMilestone[]>([]);
  const [orgDeals, setOrgDeals] = useState<Deal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    let active = true;
    // allSettled, not all — if any one of these 8 reads rejects
    // (e.g. a missing-index error, a brand-new org with no ack
    // collection, an offline cache miss) we still want the page to
    // load with whatever data we got.
    Promise.allSettled([
      listMilestones(deal.id),
      listQuoteLines(deal.id),
      listDistributors(deal.org_ref),
      listChangeOrders(deal.id),
      getSettings(deal.org_ref),
      listSubAcknowledgmentsByDeal(deal.id),
      listAllMilestonesForOrg(deal.org_ref),
      listDeals(deal.org_ref),
    ]).then((results) => {
      if (!active) return;
      const pick = <T,>(r: PromiseSettledResult<T>, fallback: T): T => {
        if (r.status === "fulfilled") return r.value;
        console.warn("[schedule] load rejected", r.reason);
        return fallback;
      };
      const m = pick(results[0] as PromiseSettledResult<ProjectMilestone[]>, []);
      const lines = pick(results[1] as PromiseSettledResult<QuoteLine[]>, []);
      const subList = pick(results[2] as PromiseSettledResult<Distributor[]>, []);
      const cos = pick(
        results[3] as PromiseSettledResult<ProjectChangeOrder[]>,
        [],
      );
      const settings = pick(
        results[4] as PromiseSettledResult<Awaited<ReturnType<typeof getSettings>>>,
        null,
      );
      const ackList = pick(
        results[5] as PromiseSettledResult<SubAcknowledgment[]>,
        [],
      );
      const orgMs = pick(
        results[6] as PromiseSettledResult<ProjectMilestone[]>,
        [],
      );
      const orgDls = pick(results[7] as PromiseSettledResult<Deal[]>, []);
      setMilestones(m);
      setSubs(subList);
      setChangeOrders(cos);
      setQuoteLines(lines);
      setAcks(ackList);
      setOrgMilestones(orgMs);
      setOrgDeals(orgDls);
      setCompanyName(settings?.company_name || "");
      const live = lines.reduce((s, l) => s + (l.customer_extended || 0), 0);
      setLiveEstimateTotal(live);
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
    });
    return () => { active = false; };
  }, [deal]);

  // Latest ack per (milestone, sub) pair. Audit trail may contain
  // multiple rows (confirmed → later flagged); the GC cares about the
  // most recent one.
  const ackIndex = useMemo(() => {
    const out = new Map<string, Map<string, SubAcknowledgment>>();
    for (const a of acks) {
      let inner = out.get(a.milestone_ref);
      if (!inner) {
        inner = new Map();
        out.set(a.milestone_ref, inner);
      }
      const prior = inner.get(a.sub_ref);
      if (!prior || a.created_at > prior.created_at) {
        inner.set(a.sub_ref, a);
      }
    }
    return out;
  }, [acks]);

  // Cross-project conflict lookup. Merges the org-wide milestones
  // snapshot with the current deal's live state so edits made in this
  // panel show in conflict warnings immediately (no reload required).
  const conflictLookup: ConflictLookup = useMemo(() => {
    const localIds = new Set(milestones.map((m) => m.id));
    const merged = [
      ...orgMilestones.filter((m) => !localIds.has(m.id)),
      ...milestones,
    ];
    const dealNames = new Map<string, string>();
    for (const d of orgDeals) dealNames.set(d.id, d.name);
    dealNames.set(deal.id, deal.name); // safety in case orgDeals load lagged
    return buildConflictLookup(merged, dealNames);
  }, [orgMilestones, milestones, orgDeals, deal.id, deal.name]);

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
    // Did dates actually move? Don't text subs on a no-op save.
    const datesChanged =
      (patch.planned_start_date !== undefined &&
        patch.planned_start_date !== m.planned_start_date) ||
      (patch.planned_end_date !== undefined &&
        patch.planned_end_date !== m.planned_end_date);
    const updated: ProjectMilestone = {
      ...m,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    await saveMilestone(updated);
    // Auto-text every consenting sub on this phase that the dates moved.
    // Silent no-op if nobody has SMS consent or if Twilio is unconfigured.
    if (datesChanged && (updated.assigned_subs?.length ?? 0) > 0) {
      void notifyRescheduledSubs(updated);
    }
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

  // Fire-and-forget multi-channel notification to subs newly assigned
  // to a phase. SMS fires when sub has consent + valid phone; email
  // fires when sub has an email on file. Both channels are independent
  // — sub gets whichever they're set up for (or both). Never blocks
  // the assignment save.
  async function notifyAssignedSubs(m: ProjectMilestone, subIds: string[]) {
    for (const subId of subIds) {
      const sub = subs.find((s) => s.id === subId);
      if (!sub) continue;
      const scheduleLink = await subScheduleLink(sub.id);
      const params = {
        builderName: companyName,
        projectName: deal.name,
        phaseName: m.name,
        address: deal.ship_to_address,
        startDate: m.planned_start_date,
        endDate: m.planned_end_date,
        scheduleLink,
      };
      const to = toE164(sub.phone ?? "");
      if (to && sub.sms_consent) {
        void sendSms(to, composeAssignmentSms(params));
      }
      if (isLikelyEmail(sub.email)) {
        void sendEmail(sub.email!, composeAssignmentEmail(params));
      }
      // Web push fires for every device the sub has registered via the
      // portal's PushOptIn banner. No-op if sub has no subscriptions.
      void pushNotifySub(sub.id, {
        title: `${companyName || "KeystonePro"}: scheduled for ${m.name}`,
        body: `${deal.name}${m.planned_start_date ? ` (${m.planned_start_date})` : ""}`,
        ...(scheduleLink ? { url: scheduleLink } : {}),
        tag: `assignment-${m.id}`,
      });
    }
  }

  // Fire-and-forget multi-channel notification to every sub on a phase
  // whose dates just changed. Same channel logic as notifyAssignedSubs.
  async function notifyRescheduledSubs(m: ProjectMilestone) {
    for (const subId of m.assigned_subs || []) {
      const sub = subs.find((s) => s.id === subId);
      if (!sub) continue;
      const scheduleLink = await subScheduleLink(sub.id);
      const params = {
        builderName: companyName,
        projectName: deal.name,
        phaseName: m.name,
        startDate: m.planned_start_date,
        endDate: m.planned_end_date,
        scheduleLink,
      };
      const to = toE164(sub.phone ?? "");
      if (to && sub.sms_consent) {
        void sendSms(to, composeRescheduleSms(params));
      }
      if (isLikelyEmail(sub.email)) {
        void sendEmail(sub.email!, composeRescheduleEmail(params));
      }
      void pushNotifySub(sub.id, {
        title: `${companyName || "KeystonePro"}: schedule change`,
        body: `${m.name} on ${deal.name} → ${m.planned_start_date ?? "TBD"} – ${m.planned_end_date ?? "TBD"}`,
        ...(scheduleLink ? { url: scheduleLink } : {}),
        tag: `reschedule-${m.id}`,
      });
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
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">
            <span className="md:hidden">Schedule</span>
            <span className="hidden md:inline">Project Schedule + Draws</span>
          </h2>
          {/* Subtext: hidden on mobile (companion mode); the stats footer
           *  at the bottom carries the same info more prominently. */}
          <p className="mt-0.5 hidden text-xs text-slate-500 md:block">
            {totals.completedCount} of {milestones.length} milestones complete · {fmtMoney(totals.released)} of {fmtMoney(totals.totalAmount)} paid
          </p>
        </div>
        {/* Regenerate + Reset — desktop-only admin actions. */}
        <div className="hidden items-center gap-3 md:flex">
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

      {/* Gantt: percentage-bar timeline. Desktop-only — phone widths
       *  can't render a useful Gantt. The Weekly view below covers
       *  both screen sizes. */}
      <div className="hidden md:block">
        <GanttChart
          milestones={milestones}
          onChangeDates={updateMilestoneDates}
          onReschedule={notifyRescheduledSubs}
        />
      </div>

      <WeeklyScheduleView milestones={milestones} subs={subs} />


      <ul className="divide-y divide-slate-100">
        {milestones.map((m) => (
          <MilestoneRow
            key={m.id}
            milestone={m}
            dealId={deal.id}
            subs={subs}
            subAcks={ackIndex.get(m.id)}
            conflictLookup={conflictLookup}
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
    <div className="border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
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
  subAcks,
  conflictLookup,
  onTransition,
  onAssignSubs,
  onRemove,
}: {
  milestone: ProjectMilestone;
  dealId: string;
  subs: Distributor[];
  subAcks?: Map<string, SubAcknowledgment>;
  conflictLookup: ConflictLookup;
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
    <li className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 sm:px-6 sm:py-4">
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
            assignedSubs.map((s) => {
              const ack = subAcks?.get(s.id);
              const isAckConflict = ack?.status === "conflict";
              const isConfirmed = ack?.status === "confirmed";
              // Cross-project schedule conflict — sub is already booked
              // on overlapping dates on another deal in this org.
              const scheduleConflicts = findSubConflicts(
                conflictLookup,
                m,
                s.id,
              );
              const hasScheduleConflict = scheduleConflicts.length > 0;
              // Visual precedence: schedule-conflict overrides ack
              // states because it's the more actionable signal (the GC
              // can't fix it from the portal; they have to reschedule).
              const chipClass = hasScheduleConflict
                ? "bg-rose-100 text-rose-800 ring-1 ring-rose-300"
                : isAckConflict
                  ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                  : isConfirmed
                    ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                    : "bg-sky-100 text-sky-800";
              const ackTooltip = ack
                ? `${ack.status === "confirmed" ? "Confirmed" : "Conflict flagged"} ${new Date(ack.created_at).toLocaleString()}${ack.reason ? ` — "${ack.reason}"` : ""}${
                    ack.for_start_date && ack.for_start_date !== m.planned_start_date
                      ? ` (for original ${ack.for_start_date}; date has since changed)`
                      : ""
                  }`
                : s.account_number;
              const scheduleTooltip = hasScheduleConflict
                ? `⛔ Double-booked: ${scheduleConflicts
                    .map(
                      (c) =>
                        `${c.deal_name} / ${c.milestone.name} (${fmtRange(c.milestone.planned_start_date, c.milestone.planned_end_date)})`,
                    )
                    .join("; ")}`
                : "";
              const tooltip = [scheduleTooltip, ackTooltip]
                .filter(Boolean)
                .join(" · ");
              return (
                <span
                  key={s.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${chipClass}`}
                  title={tooltip}
                >
                  {hasScheduleConflict && <span aria-hidden>⛔</span>}
                  {isConfirmed && !hasScheduleConflict && (
                    <span aria-hidden>✓</span>
                  )}
                  {isAckConflict && !hasScheduleConflict && (
                    <span aria-hidden>⚠</span>
                  )}
                  {s.name}
                </span>
              );
            })
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
              milestone={m}
              conflictLookup={conflictLookup}
              onChange={onAssignSubs}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>

        {/* Cross-project schedule conflicts — sub is already booked on
         *  overlapping dates somewhere else in the org. Different color
         *  + actionable copy from the ack-conflict callout below. */}
        {assignedSubs
          .map((s) => ({
            sub: s,
            conflicts: findSubConflicts(conflictLookup, m, s.id),
          }))
          .filter((x) => x.conflicts.length > 0)
          .map(({ sub, conflicts }) => (
            <div
              key={`schedule-conflict-${sub.id}`}
              className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-900 ring-1 ring-rose-200"
            >
              <div className="font-semibold">
                ⛔ {sub.name} is double-booked
              </div>
              <ul className="mt-1 space-y-0.5">
                {conflicts.map((c) => (
                  <li key={c.milestone.id} className="text-slate-800">
                    {c.deal_name} — {c.milestone.name}{" "}
                    <span className="text-rose-700">
                      ({fmtRange(c.milestone.planned_start_date, c.milestone.planned_end_date)})
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-1 text-[11px] italic text-rose-700">
                Reschedule this phase, or unassign{" "}
                {sub.name} from one of the overlapping phases.
              </div>
            </div>
          ))}

        {/* Sub-reported conflicts (from the portal "Flag conflict"
         *  button). Quiet for confirmed (the green chip is enough). */}
        {assignedSubs
          .map((s) => ({ sub: s, ack: subAcks?.get(s.id) }))
          .filter((x) => x.ack?.status === "conflict")
          .map(({ sub, ack }) => (
            <div
              key={`conflict-${sub.id}`}
              className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200"
            >
              <div className="font-semibold">
                ⚠ {sub.name} flagged a conflict
                <span className="ml-2 font-normal text-amber-700">
                  {new Date(ack!.created_at).toLocaleDateString()}
                </span>
              </div>
              {ack!.reason && (
                <div className="mt-0.5 text-slate-800">
                  &ldquo;{ack!.reason}&rdquo;
                </div>
              )}
              {ack!.for_start_date &&
                ack!.for_start_date !== m.planned_start_date && (
                  <div className="mt-0.5 text-[11px] italic text-amber-700">
                    Flagged when start was {ack!.for_start_date} — date has since
                    changed.
                  </div>
                )}
            </div>
          ))}

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
  milestone,
  conflictLookup,
  onChange,
  onClose,
}: {
  subs: Distributor[];
  selected: string[];
  /** Milestone the picker is assigning to — used to detect conflicts
   *  per candidate sub when the picker opens. */
  milestone: ProjectMilestone;
  conflictLookup: ConflictLookup;
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
    <div className="absolute z-30 mt-7 max-h-60 w-72 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg">
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
        const conflicts = findSubConflicts(conflictLookup, milestone, s.id);
        const hasConflict = conflicts.length > 0;
        return (
          <label
            key={s.id}
            className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50 ${
              checked ? "bg-sky-50" : ""
            } ${hasConflict ? "ring-1 ring-rose-200" : ""}`}
            title={
              hasConflict
                ? `Double-booked: ${conflicts.map((c) => `${c.deal_name} / ${c.milestone.name} (${fmtRange(c.milestone.planned_start_date, c.milestone.planned_end_date)})`).join("; ")}`
                : ""
            }
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(s.id)}
              className="mt-0.5 rounded text-sky-600 focus:ring-sky-500"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-900">
                {s.name}
                {hasConflict && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider text-rose-700">
                    ⛔ booked
                  </span>
                )}
              </p>
              {s.account_number && (
                <p className="truncate text-[10px] text-slate-500">{s.account_number}</p>
              )}
              {hasConflict && (
                <p className="mt-0.5 truncate text-[10px] text-rose-700">
                  {conflicts[0].deal_name} —{" "}
                  {fmtRange(conflicts[0].milestone.planned_start_date, conflicts[0].milestone.planned_end_date)}
                  {conflicts.length > 1 && ` (+${conflicts.length - 1} more)`}
                </p>
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

// ── Weekly view ──────────────────────────────────────────────────
// Groups milestones into Mon–Sun weeks and shows what's active that
// week. Works on phone widths (Gantt does not) and gives desktop a
// readable "this week" lens that doesn't require scanning a bar
// chart. Past weeks collapse by default; current + future weeks are
// expanded.

function WeeklyScheduleView({
  milestones,
  subs,
}: {
  milestones: ProjectMilestone[];
  subs: Distributor[];
}) {
  const [todayMs, setTodayMs] = useState<number | null>(null);
  useEffect(() => {
    setTodayMs(Date.now());
  }, []);
  const [showPast, setShowPast] = useState(false);

  const subById = useMemo(() => {
    const m = new Map<string, Distributor>();
    for (const s of subs) m.set(s.id, s);
    return m;
  }, [subs]);

  const dated = useMemo(
    () =>
      milestones.filter(
        (m) => m.planned_start_date && m.planned_end_date,
      ),
    [milestones],
  );

  const weeks = useMemo(() => {
    if (dated.length === 0) return [];
    const starts = dated.map((m) => Date.parse(m.planned_start_date!));
    const ends = dated.map((m) => Date.parse(m.planned_end_date!));
    const startMs = Math.min(...starts);
    const endMs = Math.max(...ends);
    const firstMon = mondayOfMs(startMs);
    const lastMon = mondayOfMs(endMs);
    const out: Array<{
      mondayMs: number;
      sundayMs: number;
      active: ProjectMilestone[];
    }> = [];
    for (let cur = firstMon; cur <= lastMon; cur += 7 * 86400000) {
      const sundayMs = cur + 6 * 86400000 + (86400000 - 1); // end of Sunday
      const active = dated.filter((m) => {
        const ms = Date.parse(m.planned_start_date!);
        const me = Date.parse(m.planned_end_date!);
        return me >= cur && ms <= sundayMs;
      });
      out.push({ mondayMs: cur, sundayMs, active });
    }
    return out;
  }, [dated]);

  if (dated.length === 0) {
    return (
      <div className="border-b border-slate-200 px-4 py-4 text-xs text-slate-500 sm:px-6">
        Phase dates not set yet — regenerate the schedule or edit dates
        on a milestone below to populate the weekly view.
      </div>
    );
  }

  const currentWeekIdx = todayMs
    ? weeks.findIndex(
        (w) => todayMs >= w.mondayMs && todayMs <= w.sundayMs,
      )
    : -1;
  // Cut-point: hide past weeks (those that ended before today) unless
  // user clicks "Show past". If we're before the project starts, show
  // everything.
  const firstVisibleIdx =
    showPast || currentWeekIdx < 0 ? 0 : currentWeekIdx;
  const hiddenPastCount = firstVisibleIdx;
  const visibleWeeks = weeks.slice(firstVisibleIdx);

  return (
    <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-3 sm:px-6 sm:py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Weekly view
        </h3>
        {hiddenPastCount > 0 && !showPast ? (
          <button
            type="button"
            onClick={() => setShowPast(true)}
            className="text-[11px] font-medium text-sky-700 hover:text-sky-900"
          >
            Show {hiddenPastCount} past week{hiddenPastCount === 1 ? "" : "s"}
          </button>
        ) : null}
        {showPast && hiddenPastCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowPast(false)}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
          >
            Hide past
          </button>
        ) : null}
      </div>
      <ul className="space-y-2">
        {visibleWeeks.map((w) => (
          <WeekCard
            key={w.mondayMs}
            mondayMs={w.mondayMs}
            sundayMs={w.sundayMs}
            active={w.active}
            isCurrent={
              todayMs !== null &&
              todayMs >= w.mondayMs &&
              todayMs <= w.sundayMs
            }
            subById={subById}
          />
        ))}
      </ul>
    </div>
  );
}

function WeekCard({
  mondayMs,
  sundayMs,
  active,
  isCurrent,
  subById,
}: {
  mondayMs: number;
  sundayMs: number;
  active: ProjectMilestone[];
  isCurrent: boolean;
  subById: Map<string, Distributor>;
}) {
  const mondayLabel = new Date(mondayMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const sundayLabel = new Date(sundayMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return (
    <li
      className={
        "rounded-lg border bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3 " +
        (isCurrent
          ? "border-sky-300 ring-1 ring-sky-200"
          : "border-slate-200")
      }
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          Week of {mondayLabel}
          <span className="ml-1 text-xs font-normal text-slate-500">
            – {sundayLabel}
          </span>
        </p>
        {isCurrent ? (
          <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            This week
          </span>
        ) : null}
      </div>
      {active.length === 0 ? (
        <p className="text-xs italic text-slate-400">Nothing scheduled.</p>
      ) : (
        <ul className="space-y-1">
          {active.map((m) => (
            <li
              key={m.id}
              className="flex items-start gap-2 text-sm text-slate-700"
            >
              <span
                className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${timelineSegmentColor(
                  m.status,
                )}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">
                  {m.name}
                </p>
                <p className="text-[11px] text-slate-500">
                  {weekStatusLabel(m, mondayMs, sundayMs)}
                  {(m.assigned_subs?.length ?? 0) > 0 && (
                    <>
                      {" · "}
                      {(m.assigned_subs ?? [])
                        .map((id) => subById.get(id)?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </>
                  )}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${MILESTONE_STATUS_STYLES[m.status]}`}
              >
                {MILESTONE_STATUS_LABELS[m.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function mondayOfMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (dow + 6) % 7; // 0 if Mon, 1 if Tue, .. 6 if Sun
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

function weekStatusLabel(
  m: ProjectMilestone,
  mondayMs: number,
  sundayMs: number,
): string {
  const ms = Date.parse(m.planned_start_date!);
  const me = Date.parse(m.planned_end_date!);
  const startsThisWeek = ms >= mondayMs && ms <= sundayMs;
  const endsThisWeek = me >= mondayMs && me <= sundayMs;
  if (startsThisWeek && endsThisWeek) {
    return `${new Date(ms).toLocaleDateString(undefined, { weekday: "short" })} – ${new Date(me).toLocaleDateString(undefined, { weekday: "short" })}`;
  }
  if (startsThisWeek) {
    return `Starts ${new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
  }
  if (endsThisWeek) {
    return `Ends ${new Date(me).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
  }
  return "Active all week";
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
