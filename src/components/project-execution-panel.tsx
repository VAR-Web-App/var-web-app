"use client";

import { useEffect, useState, useMemo } from "react";
import {
  CheckCircleIcon,
  PlayCircleIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ExclamationCircleIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  Deal,
  newId,
} from "@/types";
import {
  ProjectMilestone,
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
} from "@/lib/store";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function ProjectExecutionPanel({ deal }: { deal: Deal }) {
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    let active = true;
    listMilestones(deal.id).then((m) => {
      if (active) {
        setMilestones(m);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, [deal.id]);

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

  // Contract value = award_total when signed, else estimate. Drives the $
  // amounts on milestone generation.
  const contractValue =
    deal.award_total > 0 ? deal.award_total : deal.total_quote_value;

  async function generateDefaults() {
    if (milestones.length > 0) {
      if (!confirm("Replace existing milestones with the default builder draw schedule?")) return;
      // Clear existing milestones first.
      for (const m of milestones) await deleteMilestone(m.id);
    }
    setSeeding(true);
    try {
      const now = new Date().toISOString();
      const generated: ProjectMilestone[] = DEFAULT_BUILDER_MILESTONES.map((t, i) => ({
        id: newId("ms"),
        deal_ref: deal.id,
        org_ref: deal.org_ref,
        name: t.label,
        description: t.description,
        order: i,
        percentage: t.default_percent,
        amount: Math.round((contractValue * t.default_percent) / 100),
        status: "pending" as MilestoneStatus,
        notes: "",
        created_at: now,
        updated_at: now,
      }));
      await saveMilestones(generated);
      setMilestones(generated);
    } finally {
      setSeeding(false);
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
    return (
      <section className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Project schedule + draw plan</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Generate the default 9-phase builder draw schedule. Each phase becomes a billable
          milestone — the client approves completion to release the next draw.
        </p>
        <button
          onClick={generateDefaults}
          disabled={seeding || contractValue === 0}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
        >
          <PlusIcon className="h-4 w-4" />
          {seeding ? "Generating…" : "Generate default schedule"}
        </button>
        {contractValue === 0 && (
          <p className="mt-3 text-xs text-amber-700">
            Add an estimate first — milestone $ amounts roll up from the contract value.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Project Schedule + Draws</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {totals.completedCount} of {milestones.length} milestones complete · {fmtMoney(totals.released)} of {fmtMoney(totals.totalAmount)} paid
          </p>
        </div>
        <button
          onClick={generateDefaults}
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
          title="Reset to default 9-phase schedule"
        >
          Reset to defaults
        </button>
      </div>

      <ScheduleTimeline milestones={milestones} />

      <ul className="divide-y divide-slate-100">
        {milestones.map((m) => (
          <MilestoneRow
            key={m.id}
            milestone={m}
            onTransition={(next) => transition(m, next)}
            onRemove={() => removeMilestone(m)}
          />
        ))}
      </ul>

      <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-200 bg-slate-50">
        <Stat label="Contract" value={fmtMoney(contractValue)} />
        <Stat label="Approved" value={fmtMoney(totals.approved)} accent="emerald" />
        <Stat label="Paid" value={fmtMoney(totals.released)} accent="emerald" />
      </div>
    </section>
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
        <Legend color="bg-amber-500" label="In progress" />
        <Legend color="bg-blue-500" label="Awaiting approval" />
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
      return "bg-amber-500";
    case "awaiting_approval":
      return "bg-blue-500";
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
  onTransition,
  onRemove,
}: {
  milestone: ProjectMilestone;
  onTransition: (next: MilestoneStatus) => void;
  onRemove: () => void;
}) {
  const statusStyle = MILESTONE_STATUS_STYLES[m.status];

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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {nextActions(m.status).map((a) => (
            <button
              key={a.next}
              onClick={() => onTransition(a.next)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${a.style}`}
            >
              {a.label}
            </button>
          ))}
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

function StatusIcon({ status }: { status: MilestoneStatus }) {
  const cls = "h-5 w-5 mt-0.5 flex-shrink-0";
  switch (status) {
    case "pending":
      return <ClockIcon className={`${cls} text-slate-400`} />;
    case "in_progress":
      return <PlayCircleIcon className={`${cls} text-amber-600`} />;
    case "awaiting_approval":
      return <ClockIcon className={`${cls} text-blue-600`} />;
    case "approved":
      return <CheckCircleIcon className={`${cls} text-emerald-600`} />;
    case "released":
      return <CurrencyDollarIcon className={`${cls} text-emerald-700`} />;
    case "disputed":
      return <ExclamationCircleIcon className={`${cls} text-red-600`} />;
  }
}

function nextActions(status: MilestoneStatus): { next: MilestoneStatus; label: string; style: string }[] {
  const primary = "bg-amber-600 text-white hover:bg-amber-700";
  const secondary = "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  const success = "bg-emerald-600 text-white hover:bg-emerald-700";

  switch (status) {
    case "pending":
      return [{ next: "in_progress", label: "Start phase", style: primary }];
    case "in_progress":
      return [{ next: "awaiting_approval", label: "Mark complete (request draw)", style: primary }];
    case "awaiting_approval":
      return [
        { next: "approved", label: "Client approved", style: success },
        { next: "in_progress", label: "Re-open", style: secondary },
        { next: "disputed", label: "Mark disputed", style: secondary },
      ];
    case "approved":
      return [{ next: "released", label: "Mark paid", style: success }];
    case "released":
      return [];
    case "disputed":
      return [
        { next: "in_progress", label: "Resolve & resume", style: primary },
      ];
  }
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "emerald" }) {
  const color = accent === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="px-6 py-4 text-center">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
