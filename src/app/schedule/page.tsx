"use client";

// Cross-project sub schedule. One row per sub, weekly columns across,
// colored bars per assignment showing which project + which phase that
// sub is on. Today line marks the current week. Conflict alerts when
// the same sub is double-booked in overlapping windows.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import { Deal, Distributor } from "@/types";
import { ProjectMilestone, MILESTONE_STATUS_STYLES, MILESTONE_STATUS_LABELS } from "@/types/builder";
import {
  listDeals,
  listDistributors,
  listMilestones,
  saveMilestone,
} from "@/lib/store";
import { useAuth } from "@/lib/auth-context";

interface SubAssignment {
  sub_id: string;
  sub_name: string;
  sub_trade?: string;
  deal_id: string;
  deal_name: string;
  milestone_id: string;
  milestone_name: string;
  status: ProjectMilestone["status"];
  start_date: string;
  end_date: string;
  amount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export default function SchedulePage() {
  const { profile } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [subs, setSubs] = useState<Distributor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [todayMs, setTodayMs] = useState<number | null>(null);
  const [assignSubId, setAssignSubId] = useState<string | null>(null);

  useEffect(() => {
    setTodayMs(Date.now());
  }, []);

  async function assignSubToMilestone(subId: string, milestoneId: string) {
    const m = milestones.find((x) => x.id === milestoneId);
    if (!m) return;
    const existing = m.assigned_subs || [];
    if (existing.includes(subId)) return;
    const updated: ProjectMilestone = {
      ...m,
      assigned_subs: [...existing, subId],
      updated_at: new Date().toISOString(),
    };
    setMilestones((prev) => prev.map((x) => (x.id === milestoneId ? updated : x)));
    await saveMilestone(updated);
  }

  async function unassignSubFromMilestone(subId: string, milestoneId: string) {
    const m = milestones.find((x) => x.id === milestoneId);
    if (!m) return;
    const updated: ProjectMilestone = {
      ...m,
      assigned_subs: (m.assigned_subs || []).filter((x) => x !== subId),
      updated_at: new Date().toISOString(),
    };
    setMilestones((prev) => prev.map((x) => (x.id === milestoneId ? updated : x)));
    await saveMilestone(updated);
  }

  useEffect(() => {
    if (!profile) return;
    let active = true;
    async function load() {
      const [d, s] = await Promise.all([
        listDeals(profile!.org_ref),
        listDistributors(profile!.org_ref),
      ]);
      if (!active) return;
      // Pull milestones for every project. With small N this is fine; if
      // the org has hundreds of projects we'd want a top-level milestones
      // collection or a server-side aggregator instead.
      const allMilestones: ProjectMilestone[] = [];
      for (const deal of d) {
        const m = await listMilestones(deal.id);
        allMilestones.push(...m);
      }
      if (!active) return;
      setDeals(d);
      setMilestones(allMilestones);
      setSubs(s);
      setLoaded(true);
    }
    void load();
    return () => { active = false; };
  }, [profile]);

  const assignments = useMemo<SubAssignment[]>(() => {
    const dealById = new Map(deals.map((d) => [d.id, d]));
    const subById = new Map(subs.map((s) => [s.id, s]));
    const out: SubAssignment[] = [];
    for (const m of milestones) {
      if (!m.planned_start_date || !m.planned_end_date) continue;
      if (!m.assigned_subs?.length) continue;
      const deal = dealById.get(m.deal_ref);
      if (!deal) continue;
      for (const subId of m.assigned_subs) {
        const sub = subById.get(subId);
        if (!sub) continue;
        out.push({
          sub_id: subId,
          sub_name: sub.name,
          sub_trade: sub.account_number,
          deal_id: m.deal_ref,
          deal_name: deal.name,
          milestone_id: m.id,
          milestone_name: m.name,
          status: m.status,
          start_date: m.planned_start_date,
          end_date: m.planned_end_date,
          amount: m.amount,
        });
      }
    }
    return out;
  }, [deals, milestones, subs]);

  const conflicts = useMemo(() => {
    // Group assignments by sub; flag any pairs whose date ranges overlap.
    const bySub: Record<string, SubAssignment[]> = {};
    for (const a of assignments) {
      (bySub[a.sub_id] ||= []).push(a);
    }
    const flagged = new Set<string>(); // assignment keys (sub_id|milestone_id)
    for (const subId of Object.keys(bySub)) {
      const list = bySub[subId].sort((a, b) =>
        a.start_date.localeCompare(b.start_date)
      );
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (Date.parse(a.end_date) > Date.parse(b.start_date) &&
              Date.parse(a.start_date) < Date.parse(b.end_date)) {
            flagged.add(`${a.sub_id}|${a.milestone_id}`);
            flagged.add(`${b.sub_id}|${b.milestone_id}`);
          }
        }
      }
    }
    return flagged;
  }, [assignments]);

  // Subs with at least one assignment first; subs without assignments
  // shown in a "no assignments" tail group so the user sees the whole
  // directory.
  const subRows = useMemo(() => {
    const idsWithAssignments = new Set(assignments.map((a) => a.sub_id));
    const active = subs.filter((s) => idsWithAssignments.has(s.id));
    const idle = subs.filter((s) => !idsWithAssignments.has(s.id));
    return { active, idle };
  }, [subs, assignments]);

  // Calendar window: dynamically fits the data so historical and future
  // assignments are visible. Bounded to today-9mo / today+18mo so a
  // single very-old or very-future assignment can't blow the scale up.
  const window = useMemo(() => {
    if (todayMs === null) return null;

    // Start with a default window of today-6w through today+20w, then
    // expand to include any assignment dates that fall outside it.
    const defaultStart = todayMs - 6 * WEEK_MS;
    const defaultEnd = todayMs + 20 * WEEK_MS;
    const minStart = todayMs - 39 * WEEK_MS; // ~9 months ago cap
    const maxEnd = todayMs + 78 * WEEK_MS;   // ~18 months ahead cap

    let earliestMs = defaultStart;
    let latestMs = defaultEnd;
    for (const a of assignments) {
      const aStart = Date.parse(a.start_date);
      const aEnd = Date.parse(a.end_date);
      if (aStart < earliestMs) earliestMs = aStart;
      if (aEnd > latestMs) latestMs = aEnd;
    }
    earliestMs = Math.max(earliestMs, minStart);
    latestMs = Math.min(latestMs, maxEnd);

    // Snap start to a Monday for clean column boundaries
    const start = new Date(earliestMs);
    start.setHours(0, 0, 0, 0);
    const dow = start.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    start.setDate(start.getDate() + offsetToMonday);
    const startMs = start.getTime();

    // Snap end to next Sunday
    const end = new Date(latestMs);
    end.setHours(23, 59, 59, 999);
    const endDow = end.getDay();
    const offsetToSunday = endDow === 0 ? 0 : 7 - endDow;
    end.setDate(end.getDate() + offsetToSunday);
    const endMs = end.getTime();

    const totalMs = endMs - startMs;
    const weekCount = Math.max(1, Math.round(totalMs / WEEK_MS));

    const weeks: { start: number; label: string }[] = [];
    for (let w = 0; w < weekCount; w++) {
      const wStart = startMs + w * WEEK_MS;
      const wDate = new Date(wStart);
      weeks.push({
        start: wStart,
        label: wDate.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      });
    }
    return { startMs, endMs, totalMs, weeks };
  }, [todayMs, assignments]);

  return (
    <AppShell>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
            <CalendarDaysIcon className="h-4 w-4" />
            Cross-project schedule
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Sub Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Who&apos;s working when across all your active projects. Conflicts
            highlighted in red.
          </p>
        </div>
      </div>

      {!loaded ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading schedule…
        </div>
      ) : subs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
          <WrenchScrewdriverIcon className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No subs in your directory</p>
          <p className="mt-1 text-xs text-slate-500">
            Add subs on the{" "}
            <Link href="/distributors" className="font-medium text-amber-700 hover:underline">
              Subs &amp; Suppliers
            </Link>{" "}
            page first, then assign them to project phases.
          </p>
        </div>
      ) : assignments.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
          <CalendarDaysIcon className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No subs assigned to phases yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Open any project and assign subs to phases — they&apos;ll show up here with dates and project context.
          </p>
        </div>
      ) : (
        <ScheduleGrid
          subs={subRows}
          assignments={assignments}
          conflicts={conflicts}
          window={window}
          todayMs={todayMs}
          onAssignClick={(subId) => setAssignSubId(subId)}
          onUnassign={(subId, mId) => void unassignSubFromMilestone(subId, mId)}
        />
      )}

      {assignSubId && (
        <AssignModal
          sub={subs.find((s) => s.id === assignSubId)!}
          deals={deals}
          milestones={milestones}
          onAssign={async (mId) => {
            await assignSubToMilestone(assignSubId, mId);
          }}
          onClose={() => setAssignSubId(null)}
        />
      )}

      {conflicts.size > 0 && (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-semibold">{conflicts.size / 2} scheduling conflict{conflicts.size === 2 ? "" : "s"}</p>
            <p className="mt-0.5 text-xs">
              The same sub is assigned to overlapping date ranges across projects. Conflicting bars highlighted in red.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ScheduleGrid({
  subs,
  assignments,
  conflicts,
  window,
  todayMs,
  onAssignClick,
  onUnassign,
}: {
  subs: { active: Distributor[]; idle: Distributor[] };
  assignments: SubAssignment[];
  conflicts: Set<string>;
  window: { startMs: number; endMs: number; totalMs: number; weeks: { start: number; label: string }[] } | null;
  todayMs: number | null;
  onAssignClick: (subId: string) => void;
  onUnassign: (subId: string, milestoneId: string) => void;
}) {
  if (!window) return null;
  const todayInRange = todayMs !== null && todayMs >= window.startMs && todayMs <= window.endMs;
  const todayPercent = todayMs !== null ? ((todayMs - window.startMs) / window.totalMs) * 100 : 0;

  const bySub: Record<string, SubAssignment[]> = {};
  for (const a of assignments) (bySub[a.sub_id] ||= []).push(a);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Date axis — label every Nth week to avoid smushing at wide windows */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        <div className="w-48 flex-shrink-0 border-r border-slate-200 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Sub / Trade
        </div>
        <div className="relative flex-1">
          <div className="flex h-8">
            {window.weeks.map((w, i) => {
              // Show ~12-18 visible labels regardless of window width
              const labelStride = window.weeks.length <= 18 ? 1 : window.weeks.length <= 36 ? 2 : 4;
              const showLabel = i % labelStride === 0;
              return (
                <div
                  key={w.start}
                  className={`flex-1 border-r border-slate-200 px-1 text-center text-[9px] font-medium uppercase tracking-wider text-slate-500 last:border-r-0 ${
                    i % (labelStride * 4) === 0 ? "bg-slate-100" : ""
                  }`}
                >
                  {showLabel && <div className="pt-1.5">{w.label}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sub rows */}
      <div className="relative">
        {todayInRange && (
          <div
            className="pointer-events-none absolute z-10 w-px bg-red-400"
            style={{
              left: `calc(12rem + (100% - 12rem) * ${todayPercent / 100})`,
              top: 0,
              bottom: 0,
            }}
            aria-hidden
          >
            <div className="absolute -top-2 -translate-x-1/2 whitespace-nowrap rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              Today
            </div>
          </div>
        )}

        {subs.active.map((sub) => {
          const subAssignments = bySub[sub.id] || [];
          return (
            <SubRow
              key={sub.id}
              sub={sub}
              assignments={subAssignments}
              conflicts={conflicts}
              window={window}
              onAssignClick={() => onAssignClick(sub.id)}
              onUnassign={(mId) => onUnassign(sub.id, mId)}
            />
          );
        })}

        {subs.idle.length > 0 && (
          <>
            <div className="border-y border-slate-200 bg-slate-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Available · {subs.idle.length} sub{subs.idle.length === 1 ? "" : "s"} unassigned
            </div>
            {subs.idle.map((sub) => (
              <SubRow
                key={sub.id}
                sub={sub}
                assignments={[]}
                conflicts={conflicts}
                window={window}
                idle
                onAssignClick={() => onAssignClick(sub.id)}
                onUnassign={(mId) => onUnassign(sub.id, mId)}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function SubRow({
  sub,
  assignments,
  conflicts,
  window,
  idle,
  onAssignClick,
  onUnassign,
}: {
  sub: Distributor;
  assignments: SubAssignment[];
  conflicts: Set<string>;
  window: { startMs: number; endMs: number; totalMs: number; weeks: { start: number; label: string }[] };
  idle?: boolean;
  onAssignClick: () => void;
  onUnassign: (milestoneId: string) => void;
}) {
  return (
    <div className="group flex border-b border-slate-100 last:border-b-0">
      <div className="flex w-48 flex-shrink-0 items-start justify-between gap-1 border-r border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{sub.name}</p>
          {sub.account_number && (
            <p className="truncate text-[11px] text-slate-500">{sub.account_number}</p>
          )}
        </div>
        <button
          onClick={onAssignClick}
          className="flex-shrink-0 rounded p-1 text-slate-300 opacity-0 hover:bg-amber-50 hover:text-amber-700 group-hover:opacity-100 focus:opacity-100"
          title="Assign this sub to a project phase"
          aria-label="Assign work"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
      <div className={`relative h-14 flex-1 ${idle ? "bg-slate-50/60" : ""}`}>
        {/* Week column dividers */}
        {window.weeks.map((w, i) => (
          <div
            key={w.start}
            className={`absolute inset-y-0 ${i % 4 === 0 ? "border-l border-slate-200" : "border-l border-slate-100"}`}
            style={{ left: `${(i / window.weeks.length) * 100}%` }}
          />
        ))}

        {/* Assignment bars */}
        {assignments.map((a) => {
          const aStart = Math.max(Date.parse(a.start_date), window.startMs);
          const aEnd = Math.min(Date.parse(a.end_date), window.endMs);
          if (aEnd <= window.startMs || aStart >= window.endMs) return null;
          const left = ((aStart - window.startMs) / window.totalMs) * 100;
          const width = Math.max(0.5, ((aEnd - aStart) / window.totalMs) * 100);
          const isConflict = conflicts.has(`${a.sub_id}|${a.milestone_id}`);
          const baseColor = barColorForStatus(a.status);
          const color = isConflict ? "bg-red-500" : baseColor;
          return (
            <div
              key={a.milestone_id}
              className="group/bar absolute top-2"
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <Link
                href={`/deals/${a.deal_id}`}
                className={`flex h-10 items-center overflow-hidden rounded-md px-2 text-[10px] font-medium text-white shadow-sm hover:opacity-90 ${color}`}
                title={`${a.deal_name} · ${a.milestone_name} · ${a.start_date} → ${a.end_date}${isConflict ? " · CONFLICT" : ""}`}
              >
                <div className="min-w-0 truncate">
                  <div className="truncate">{a.deal_name}</div>
                  <div className="truncate text-[9px] opacity-90">{a.milestone_name}</div>
                </div>
              </Link>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm(`Unassign ${a.sub_name} from "${a.milestone_name}" on ${a.deal_name}?`)) {
                    onUnassign(a.milestone_id);
                  }
                }}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-slate-500 opacity-0 shadow ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600 group-hover/bar:opacity-100"
                title="Unassign"
                aria-label="Unassign"
              >
                <XMarkIcon className="h-2.5 w-2.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function barColorForStatus(status: ProjectMilestone["status"]): string {
  // Match the project page color vocabulary
  void MILESTONE_STATUS_STYLES; // keep import grounded for future
  switch (status) {
    case "pending":
      return "bg-slate-400";
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

function AssignModal({
  sub,
  deals,
  milestones,
  onAssign,
  onClose,
}: {
  sub: Distributor;
  deals: Deal[];
  milestones: ProjectMilestone[];
  onAssign: (milestoneId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [dealId, setDealId] = useState<string>(deals[0]?.id || "");
  const [milestoneId, setMilestoneId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const dealMilestones = useMemo(
    () => milestones
      .filter((m) => m.deal_ref === dealId)
      .sort((a, b) => a.order - b.order),
    [milestones, dealId]
  );

  // Auto-select the first phase the sub isn't already on, in the chosen deal.
  useEffect(() => {
    const firstAvailable = dealMilestones.find(
      (m) => !(m.assigned_subs || []).includes(sub.id)
    );
    setMilestoneId(firstAvailable?.id || dealMilestones[0]?.id || "");
  }, [dealId, dealMilestones, sub.id]);

  async function save() {
    if (!milestoneId || saving) return;
    setSaving(true);
    try {
      await onAssign(milestoneId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const selectedDeal = deals.find((d) => d.id === dealId);
  const selectedMilestone = dealMilestones.find((m) => m.id === milestoneId);
  const alreadyAssigned = selectedMilestone
    ? (selectedMilestone.assigned_subs || []).includes(sub.id)
    : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Assign <span className="text-amber-700">{sub.name}</span> to a phase
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Project
            </label>
            <select
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {deals.length === 0 && <option value="">(no projects)</option>}
              {deals.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Phase
            </label>
            {dealMilestones.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                This project has no milestones yet. Generate the schedule on the project page first.
              </p>
            ) : (
              <select
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {dealMilestones.map((m) => {
                  const isAssigned = (m.assigned_subs || []).includes(sub.id);
                  const dates = m.planned_start_date && m.planned_end_date
                    ? ` · ${m.planned_start_date} → ${m.planned_end_date}`
                    : "";
                  return (
                    <option key={m.id} value={m.id}>
                      {m.name} ({MILESTONE_STATUS_LABELS[m.status]}){dates}
                      {isAssigned ? " — already assigned" : ""}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {selectedMilestone && (
            <div className="rounded-md bg-slate-50 p-3 text-xs">
              <div className="text-slate-700">
                <span className="font-semibold">{selectedDeal?.name}</span>
                {" · "}
                {selectedMilestone.name}
              </div>
              {selectedMilestone.planned_start_date && selectedMilestone.planned_end_date && (
                <div className="mt-0.5 text-slate-500">
                  {selectedMilestone.planned_start_date} → {selectedMilestone.planned_end_date}
                </div>
              )}
              {alreadyAssigned && (
                <div className="mt-1 text-amber-700">
                  ⚠ {sub.name} is already on this phase.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!milestoneId || saving || alreadyAssigned}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
          >
            {saving ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
