"use client";

import { useEffect, useMemo, useState } from "react";
import { ScaleIcon } from "@heroicons/react/24/outline";
import {
  listChangeOrders,
  listPayments,
  listQuoteLines,
  listRFQs,
} from "@/lib/store";
import type { Payment, QuoteLine } from "@/types";
import type { ProjectChangeOrder, ProjectRFQ } from "@/types/builder";

/**
 * Project-level budget vs. committed vs. actual.
 *
 * Answers Barry's "will it track overall budget for each project as
 * well?" — the existing roll-ups on Deal stop at line items; this panel
 * pulls together every cost-relevant data source on a project and shows
 * one read-out.
 *
 *   Budget      = Σ QuoteLines.cost_extended  (what we planned to spend)
 *                 + Σ approved change-order amount_delta (adjustments)
 *   Committed   = Σ awarded RFQ winning bids   (promised to subs)
 *   Spent       = Σ outgoing Payments          (cash already out)
 *   Remaining   = Budget − Spent
 *
 * Pace bar shows Spent / Budget with a color tier (green/amber/red) so
 * the GC can see "we're 82% spent at 60% complete" at a glance.
 */
export default function BudgetPanel({ dealId }: { dealId: string }) {
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [rfqs, setRfqs] = useState<ProjectRFQ[]>([]);
  const [cos, setCos] = useState<ProjectChangeOrder[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [ql, rq, co, pay] = await Promise.all([
        listQuoteLines(dealId),
        listRFQs(dealId),
        listChangeOrders(dealId),
        listPayments(dealId),
      ]);
      if (!active) return;
      setLines(ql);
      setRfqs(rq);
      setCos(co);
      setPayments(pay);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [dealId]);

  const totals = useMemo(() => {
    const baseBudget = lines.reduce((s, l) => s + (l.cost_extended || 0), 0);
    const coAdjustment = cos
      .filter((c) => c.status === "approved")
      .reduce((s, c) => s + (c.amount_delta || 0), 0);
    const budget = baseBudget + coAdjustment;

    const committed = rfqs
      .filter((r) => r.status === "awarded" || r.status === "closed")
      .reduce((sum, r) => {
        const winner = r.invitees.find((i) => i.status === "selected");
        return sum + (winner?.bid_amount || 0);
      }, 0);

    const spent = payments
      .filter((p) => p.direction === "out")
      .reduce((s, p) => s + (p.amount || 0), 0);

    const remaining = budget - spent;
    const pacePct = budget > 0 ? (spent / budget) * 100 : 0;
    return {
      baseBudget,
      coAdjustment,
      budget,
      committed,
      spent,
      remaining,
      pacePct,
    };
  }, [lines, rfqs, cos, payments]);

  // Tier the pace color: green under 80%, amber 80-99%, red >=100%.
  const paceColor =
    totals.pacePct >= 100
      ? "bg-rose-500"
      : totals.pacePct >= 80
        ? "bg-amber-500"
        : "bg-emerald-500";
  const paceTextColor =
    totals.pacePct >= 100
      ? "text-rose-700"
      : totals.pacePct >= 80
        ? "text-amber-700"
        : "text-emerald-700";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScaleIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Project budget
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Planned spend vs. what&apos;s been committed and paid.
        </p>
      </header>

      {!loaded ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : totals.baseBudget === 0 &&
        totals.spent === 0 &&
        totals.committed === 0 ? (
        <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No budget data yet — add quote lines, sub bids, or payments to start
          tracking.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <BudgetTile
              label="Budget"
              value={totals.budget}
              accent="slate"
              sub={
                totals.coAdjustment !== 0
                  ? `incl. ${totals.coAdjustment > 0 ? "+" : "−"}$${Math.abs(totals.coAdjustment).toLocaleString(undefined, { maximumFractionDigits: 0 })} change orders`
                  : undefined
              }
            />
            <BudgetTile
              label="Committed"
              value={totals.committed}
              accent="sky"
              sub="awarded sub bids"
            />
            <BudgetTile
              label="Spent"
              value={totals.spent}
              accent="indigo"
              sub="payments out"
            />
            <BudgetTile
              label="Remaining"
              value={totals.remaining}
              accent={totals.remaining < 0 ? "rose" : "emerald"}
              sub={
                totals.budget > 0
                  ? `${totals.pacePct.toFixed(0)}% consumed`
                  : undefined
              }
            />
          </div>

          {/* Spend pace bar */}
          {totals.budget > 0 ? (
            <div className="mt-5">
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="font-medium text-slate-700">Spend pace</span>
                <span className={`tabular-nums ${paceTextColor}`}>
                  ${totals.spent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {" of "}
                  ${totals.budget.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {" ("}
                  {totals.pacePct.toFixed(0)}%{")"}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full ${paceColor} transition-[width] duration-300`}
                  style={{
                    width: `${Math.min(100, Math.max(0, totals.pacePct))}%`,
                  }}
                />
              </div>
              {totals.pacePct >= 100 ? (
                <p className="mt-1 text-xs font-medium text-rose-700">
                  Over budget by $
                  {(totals.spent - totals.budget).toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </p>
              ) : totals.pacePct >= 80 ? (
                <p className="mt-1 text-xs text-amber-700">
                  Approaching budget — $
                  {totals.remaining.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}{" "}
                  left
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function BudgetTile({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: number;
  accent: "slate" | "sky" | "indigo" | "emerald" | "rose";
  sub?: string;
}) {
  const accentClasses: Record<typeof accent, string> = {
    slate: "border-slate-200 bg-slate-50",
    sky: "border-sky-200 bg-sky-50",
    indigo: "border-indigo-200 bg-indigo-50",
    emerald: "border-emerald-200 bg-emerald-50",
    rose: "border-rose-200 bg-rose-50",
  };
  const valueClasses: Record<typeof accent, string> = {
    slate: "text-slate-900",
    sky: "text-sky-900",
    indigo: "text-indigo-900",
    emerald: "text-emerald-900",
    rose: "text-rose-900",
  };
  const sign = value < 0 ? "−" : "";
  return (
    <div className={`rounded-lg border ${accentClasses[accent]} px-3 py-2`}>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueClasses[accent]}`}>
        {sign}$
        {Math.abs(value).toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}
