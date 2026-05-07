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
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import { Deal, Distributor } from "@/types";
import { ProjectMilestone, MILESTONE_STATUS_STYLES } from "@/types/builder";
import {
  listDeals,
  listDistributors,
  listMilestones,
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

  useEffect(() => {
    setTodayMs(Date.now());
  }, []);

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

  // Calendar window: 2 weeks before today through 16 weeks after.
  const window = useMemo(() => {
    if (todayMs === null) return null;
    const start = new Date(todayMs);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 14);
    // Round to Monday for cleaner column boundaries
    const dow = start.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    start.setDate(start.getDate() + offsetToMonday);
    const startMs = start.getTime();

    const end = new Date(startMs);
    end.setDate(end.getDate() + 18 * 7); // 18 weeks
    const endMs = end.getTime();

    const totalMs = endMs - startMs;
    const weeks: { start: number; label: string }[] = [];
    for (let w = 0; w < 18; w++) {
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
  }, [todayMs]);

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
}: {
  subs: { active: Distributor[]; idle: Distributor[] };
  assignments: SubAssignment[];
  conflicts: Set<string>;
  window: { startMs: number; endMs: number; totalMs: number; weeks: { start: number; label: string }[] } | null;
  todayMs: number | null;
}) {
  if (!window) return null;
  const todayInRange = todayMs !== null && todayMs >= window.startMs && todayMs <= window.endMs;
  const todayPercent = todayMs !== null ? ((todayMs - window.startMs) / window.totalMs) * 100 : 0;

  const bySub: Record<string, SubAssignment[]> = {};
  for (const a of assignments) (bySub[a.sub_id] ||= []).push(a);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Date axis */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        <div className="w-48 flex-shrink-0 border-r border-slate-200 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Sub / Trade
        </div>
        <div className="relative flex-1">
          <div className="flex h-8">
            {window.weeks.map((w, i) => (
              <div
                key={w.start}
                className={`flex-1 border-r border-slate-200 px-1 text-center text-[9px] font-medium uppercase tracking-wider text-slate-500 last:border-r-0 ${
                  i % 4 === 0 ? "bg-slate-100" : ""
                }`}
              >
                <div className="pt-1.5">{w.label}</div>
              </div>
            ))}
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
}: {
  sub: Distributor;
  assignments: SubAssignment[];
  conflicts: Set<string>;
  window: { startMs: number; endMs: number; totalMs: number; weeks: { start: number; label: string }[] };
  idle?: boolean;
}) {
  return (
    <div className="flex border-b border-slate-100 last:border-b-0">
      <div className="w-48 flex-shrink-0 border-r border-slate-200 px-4 py-3">
        <p className="truncate text-sm font-medium text-slate-900">{sub.name}</p>
        {sub.account_number && (
          <p className="truncate text-[11px] text-slate-500">{sub.account_number}</p>
        )}
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
            <Link
              key={a.milestone_id}
              href={`/deals/${a.deal_id}`}
              className={`absolute top-2 flex h-10 items-center overflow-hidden rounded-md px-2 text-[10px] font-medium text-white shadow-sm hover:opacity-90 ${color}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${a.deal_name} · ${a.milestone_name} · ${a.start_date} → ${a.end_date}${isConflict ? " · CONFLICT" : ""}`}
            >
              <div className="min-w-0 truncate">
                <div className="truncate">{a.deal_name}</div>
                <div className="truncate text-[9px] opacity-90">{a.milestone_name}</div>
              </div>
            </Link>
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
