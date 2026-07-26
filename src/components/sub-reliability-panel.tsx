"use client";

import { useEffect, useMemo, useState } from "react";
import { TrophyIcon } from "@heroicons/react/24/outline";
import {
  listAllMilestonesForOrg,
  listDeals,
  listDistributors,
  listPayments,
  listRFQs,
} from "@/lib/store";
import type { Distributor, Payment } from "@/types";
import type { ProjectMilestone, ProjectRFQ } from "@/types/builder";

/**
 * Sub reliability — a sub's cross-project track record.
 *
 * This is a compounding-data feature (moat #1): the more jobs run through
 * KeystonePro, the sharper each sub's score, and no competitor can replicate
 * it without the same job history. We score on two signals we already capture
 * reliably:
 *   On-time  — of the phases this sub worked that have completed, how many
 *              finished by the planned end date (milestone actual vs planned).
 *   On-budget — awarded RFQ bid vs what they were actually paid (party_ref).
 *
 * Honest about cold-start: a sub with no completed phases and no awarded work
 * shows "New — no track record yet" instead of a fabricated grade.
 */

const GRACE_DAYS = 2; // a phase finishing ≤2 days late still counts on-time
const MIN_SIGNALS = 1; // need at least one completed phase or award to grade

interface SubScore {
  id: string;
  name: string;
  completedPhases: number;
  onTimePhases: number;
  awardedJobs: number;
  committed: number;
  paid: number;
  hasData: boolean;
  onTimePct: number | null; // null when no completed phases
  overrunPct: number | null; // null when nothing awarded
  composite: number | null; // 0–100, null when cold-start
}

const dayMs = 86_400_000;

export default function SubReliabilityPanel({ orgRef }: { orgRef: string }) {
  const [subs, setSubs] = useState<Distributor[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [rfqs, setRfqs] = useState<ProjectRFQ[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!orgRef) return;
    let active = true;
    void (async () => {
      const [subsR, dealsR, msR] = await Promise.allSettled([
        listDistributors(orgRef),
        listDeals(orgRef),
        listAllMilestonesForOrg(orgRef),
      ]);
      if (!active) return;
      const subsList = subsR.status === "fulfilled" ? subsR.value : [];
      const deals = dealsR.status === "fulfilled" ? dealsR.value : [];
      const ms = msR.status === "fulfilled" ? msR.value : [];
      if (msR.status === "rejected")
        console.warn("[sub-reliability] milestones query failed", msR.reason);

      // Cross-project on-budget: awarded bids + payments across every deal.
      const perDeal = await Promise.all(
        deals.map(async (d) => {
          try {
            const [r, p] = await Promise.all([listRFQs(d.id), listPayments(d.id)]);
            return { r, p };
          } catch {
            return { r: [] as ProjectRFQ[], p: [] as Payment[] };
          }
        }),
      );
      if (!active) return;
      setSubs(subsList);
      setMilestones(ms);
      setRfqs(perDeal.flatMap((x) => x.r));
      setPayments(perDeal.flatMap((x) => x.p));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [orgRef]);

  const scores = useMemo(() => {
    const rows: SubScore[] = subs.map((sub) => {
      // On-time: phases this sub worked that have completed.
      let completed = 0;
      let onTime = 0;
      for (const m of milestones) {
        if (!m.assigned_subs?.includes(sub.id)) continue;
        const doneAt = m.marked_complete_at ?? m.approved_at;
        const isDone =
          !!doneAt || m.status === "approved" || m.status === "released";
        if (!isDone || !m.planned_end_date) continue;
        completed++;
        const planned = new Date(m.planned_end_date).getTime();
        const actual = doneAt ? new Date(doneAt).getTime() : planned;
        if (actual <= planned + GRACE_DAYS * dayMs) onTime++;
      }

      // On-budget: awarded bids won vs payments made, across all deals.
      let committed = 0;
      let awardedJobs = 0;
      for (const rfq of rfqs) {
        if (rfq.status !== "awarded" && rfq.status !== "closed") continue;
        const winner =
          rfq.invitees.find((i) => i.status === "selected") ??
          rfq.invitees.find((i) => i.sub_ref === rfq.awarded_to_sub_ref);
        if (winner?.sub_ref === sub.id && winner.bid_amount) {
          committed += winner.bid_amount;
          awardedJobs++;
        }
      }
      const paid = payments
        .filter((p) => p.direction === "out" && p.party_ref === sub.id)
        .reduce((s, p) => s + (p.amount || 0), 0);

      const onTimePct = completed > 0 ? (onTime / completed) * 100 : null;
      const overrunPct =
        committed > 0 ? Math.max(0, ((paid - committed) / committed) * 100) : null;
      const hasData = completed >= MIN_SIGNALS || awardedJobs >= MIN_SIGNALS;

      // Composite: 60% on-time, 40% on-budget. Each defaults to a neutral 75
      // when its signal is absent, so one dimension doesn't unfairly sink a
      // sub we only have half the picture on.
      let composite: number | null = null;
      if (hasData) {
        const onTimeScore = onTimePct ?? 75;
        const onBudgetScore =
          overrunPct == null ? 75 : Math.max(0, 100 - overrunPct * 3);
        composite = Math.round(onTimeScore * 0.6 + onBudgetScore * 0.4);
      }

      return {
        id: sub.id,
        name: sub.name,
        completedPhases: completed,
        onTimePhases: onTime,
        awardedJobs,
        committed,
        paid,
        hasData,
        onTimePct,
        overrunPct,
        composite,
      };
    });

    // Graded subs first (best → worst so risk surfaces near the top of the
    // graded block via the badge), then cold-start subs.
    const graded = rows
      .filter((r) => r.hasData)
      .sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));
    const cold = rows.filter((r) => !r.hasData);
    const attention = graded.filter((r) => (r.composite ?? 100) < 70).length;
    return { graded, cold, attention, total: rows.length };
  }, [subs, milestones, rfqs, payments]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrophyIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Sub reliability</h2>
        </div>
        <p className="text-xs text-slate-500">
          On-time + on-budget track record across your projects.
        </p>
      </header>

      {!loaded ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : scores.total === 0 ? (
        <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No subs yet — add subs and run a few phases to build reliability
          scores.
        </p>
      ) : (
        <>
          {scores.attention > 0 ? (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              {scores.attention} sub{scores.attention === 1 ? "" : "s"} trending
              below target — check before your next award.
            </p>
          ) : scores.graded.length > 0 ? (
            <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              Your graded subs are all performing at target.
            </p>
          ) : null}

          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {scores.graded.map((r) => (
              <ScoreRow key={r.id} row={r} />
            ))}
            {scores.cold.map((r) => (
              <ScoreRow key={r.id} row={r} />
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">
            Scores sharpen as more jobs run through KeystonePro. On-time is from
            planned vs. actual phase completion; on-budget from awarded bid vs.
            paid.
          </p>
        </>
      )}
    </section>
  );
}

function grade(score: number): { label: string; tone: Tone } {
  if (score >= 85) return { label: "Reliable", tone: "emerald" };
  if (score >= 70) return { label: "Solid", tone: "sky" };
  if (score >= 50) return { label: "Watch", tone: "amber" };
  return { label: "At risk", tone: "rose" };
}

function ScoreRow({ row }: { row: SubScore }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
        {row.name}
      </span>

      {row.hasData ? (
        <>
          <span className="hidden text-[11px] tabular-nums text-slate-500 sm:inline">
            {row.completedPhases > 0
              ? `${row.onTimePhases}/${row.completedPhases} on time`
              : "no completed phases"}
          </span>
          <span className="hidden text-[11px] tabular-nums text-slate-500 sm:inline">
            {row.overrunPct == null
              ? "no awards"
              : row.overrunPct > 0
                ? `${row.overrunPct.toFixed(0)}% over bid`
                : "on budget"}
          </span>
          <span className="w-16 text-right text-sm font-semibold tabular-nums text-slate-900">
            {row.composite}
          </span>
          <span className="w-20 text-right">
            <GradeBadge score={row.composite ?? 0} />
          </span>
        </>
      ) : (
        <span className="w-full text-right sm:w-auto">
          <Badge tone="slate">New — no track record yet</Badge>
        </span>
      )}
    </li>
  );
}

function GradeBadge({ score }: { score: number }) {
  const g = grade(score);
  return <Badge tone={g.tone}>{g.label}</Badge>;
}

type Tone = "slate" | "sky" | "emerald" | "amber" | "rose";
function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const cls: Record<Tone, string> = {
    slate: "bg-slate-100 text-slate-600",
    sky: "bg-sky-100 text-sky-800",
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls[tone]}`}>
      {children}
    </span>
  );
}
