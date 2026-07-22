"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartBarIcon } from "@heroicons/react/24/outline";
import {
  listChangeOrders,
  listMilestones,
  listPayments,
  listQuoteLines,
} from "@/lib/store";
import type { Payment, QuoteLine } from "@/types";
import type { MilestoneStatus, ProjectChangeOrder, ProjectMilestone } from "@/types/builder";

/**
 * Dynamic Finance Forecasting — panel 1: projected margin, cash position,
 * and the draw schedule.
 *
 * BudgetPanel answers "where is the budget right now?" (budget / committed /
 * spent tiles). This looks *forward*:
 *
 *   Projected margin = Σ customer_extended − (Σ cost_extended + approved COs)
 *   Net cash         = Σ payments in − Σ payments out   (cash on the project)
 *   Collected        = Σ payments in
 *   Remaining        = contract − collected             (still to bill client)
 *
 * The draw schedule below breaks the project into phases (one milestone per
 * draw) so the builder can see the *timing* of incoming cash — the thing that
 * sinks builders even on profitable jobs. We anchor per-phase on the draw
 * amount + status (reliably present), not on per-payment phase tags (which
 * builders rarely set), so no row is ever silently empty.
 */

const HEALTHY_MARGIN_PCT = 2; // shared rule: green ≥2%, amber 0–<2%, red <0%

const fmt = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;

export default function FinanceForecastPanel({ dealId }: { dealId: string }) {
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [cos, setCos] = useState<ProjectChangeOrder[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      // Settle independently — a hiccup on one source shouldn't strand the
      // whole panel (mirrors BudgetPanel/PaymentsSection).
      const [qlR, coR, payR, msR] = await Promise.allSettled([
        listQuoteLines(dealId),
        listChangeOrders(dealId),
        listPayments(dealId),
        listMilestones(dealId),
      ]);
      if (!active) return;
      function unwrap<T>(r: PromiseSettledResult<T[]>, label: string): T[] {
        if (r.status === "fulfilled") return r.value;
        console.warn(`[finance-forecast] ${label} failed`, r.reason);
        return [];
      }
      setLines(unwrap(qlR, "listQuoteLines"));
      setCos(unwrap(coR, "listChangeOrders"));
      setPayments(unwrap(payR, "listPayments"));
      setMilestones(unwrap(msR, "listMilestones"));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [dealId]);

  const f = useMemo(() => {
    const contract = lines.reduce((s, l) => s + (l.customer_extended || 0), 0);
    const baseCost = lines.reduce((s, l) => s + (l.cost_extended || 0), 0);
    const coDelta = cos
      .filter((c) => c.status === "approved")
      .reduce((s, c) => s + (c.amount_delta || 0), 0);
    const costBudget = baseCost + coDelta;

    const collected = payments
      .filter((p) => p.direction === "in")
      .reduce((s, p) => s + (p.amount || 0), 0);
    const paidOut = payments
      .filter((p) => p.direction === "out")
      .reduce((s, p) => s + (p.amount || 0), 0);

    const projMargin = contract - costBudget;
    const projMarginPct = contract > 0 ? (projMargin / contract) * 100 : 0;
    const netCash = collected - paidOut;
    const remaining = Math.max(0, contract - collected);
    const collectedPct = contract > 0 ? (collected / contract) * 100 : 0;

    const draws = [...milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const drawsReleased = draws.filter((m) => m.status === "released").length;
    const drawsPending = draws.length - drawsReleased;
    // Next expected cash-in: earliest not-yet-released draw.
    const nextDraw = draws.find(
      (m) => m.status !== "released" && m.status !== "disputed",
    );

    return {
      contract,
      costBudget,
      projMargin,
      projMarginPct,
      collected,
      paidOut,
      netCash,
      remaining,
      collectedPct,
      draws,
      drawsReleased,
      drawsPending,
      nextDraw,
    };
  }, [lines, cos, payments, milestones]);

  const marginTone =
    f.projMarginPct >= HEALTHY_MARGIN_PCT
      ? "emerald"
      : f.projMarginPct >= 0
        ? "amber"
        : "rose";

  const hasAnything =
    f.contract > 0 || f.collected > 0 || f.paidOut > 0 || f.draws.length > 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <ChartBarIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Finance forecast
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Projected margin, cash position, and the draw schedule.
        </p>
      </header>

      {!loaded ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : !hasAnything ? (
        <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No financial data yet — build the estimate, log payments, or set up a
          draw schedule to start forecasting.
        </p>
      ) : (
        <>
          {/* Headline tiles */}
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Tile
              label="Projected margin"
              value={f.contract > 0 ? fmt(f.projMargin) : "—"}
              tone={marginTone}
              sub={
                f.contract > 0
                  ? `${f.projMarginPct.toFixed(1)}% of contract`
                  : "add estimate to project"
              }
            />
            <Tile
              label="Net cash on project"
              value={fmt(f.netCash)}
              tone={f.netCash >= 0 ? "emerald" : "rose"}
              sub="collected − paid out"
            />
            <Tile
              label="Collected"
              value={fmt(f.collected)}
              tone="sky"
              sub={
                f.contract > 0
                  ? `${f.collectedPct.toFixed(0)}% of contract`
                  : "client payments in"
              }
            />
            <Tile
              label="Remaining to collect"
              value={fmt(f.remaining)}
              tone="slate"
              sub={
                f.draws.length > 0
                  ? `${f.drawsPending} draw${f.drawsPending === 1 ? "" : "s"} pending`
                  : undefined
              }
            />
          </div>

          {/* Margin health note */}
          {f.contract > 0 && f.projMarginPct < HEALTHY_MARGIN_PCT ? (
            <p
              className={`mt-3 rounded-md px-3 py-2 text-xs font-medium ${
                f.projMarginPct < 0
                  ? "bg-rose-50 text-rose-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {f.projMarginPct < 0
                ? `This project is projected to lose ${fmt(Math.abs(f.projMargin))} — cost exceeds the contract.`
                : `Thin margin: only ${f.projMarginPct.toFixed(1)}% projected. Watch overruns closely.`}
            </p>
          ) : null}

          {/* Next draw callout */}
          {f.nextDraw ? (
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
              <span className="text-xs font-medium text-sky-900">
                Next draw · {f.nextDraw.name}
              </span>
              <span className="text-xs text-sky-800">
                <span className="font-semibold tabular-nums">
                  {fmt(f.nextDraw.amount || 0)}
                </span>
                {f.nextDraw.planned_end_date
                  ? ` · expected ${formatDate(f.nextDraw.planned_end_date)}`
                  : ""}
              </span>
            </div>
          ) : null}

          {/* Draw schedule (phase timeline) */}
          {f.draws.length > 0 ? (
            <div className="mt-5">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Draw schedule
                </h3>
                <span className="text-[11px] text-slate-500">
                  {f.drawsReleased} of {f.draws.length} released
                </span>
              </div>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                {f.draws.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <StatusDot status={m.status} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                      {m.name}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {formatDate(m.planned_end_date)}
                    </span>
                    <span className="w-24 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {fmt(m.amount || 0)}
                    </span>
                    <span className="w-10 text-right text-[11px] tabular-nums text-slate-400">
                      {m.percentage ? `${m.percentage}%` : ""}
                    </span>
                    <span className="w-full sm:w-28 sm:text-right">
                      <StatusBadge status={m.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
              No draw schedule yet — set one up on the Schedule tab to forecast
              incoming cash by phase.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ── bits ──────────────────────────────────────────────────────────

type Tone = "slate" | "sky" | "indigo" | "emerald" | "amber" | "rose";

function Tile({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: Tone;
  sub?: string;
}) {
  const box: Record<Tone, string> = {
    slate: "border-slate-200 bg-slate-50",
    sky: "border-sky-200 bg-sky-50",
    indigo: "border-indigo-200 bg-indigo-50",
    emerald: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    rose: "border-rose-200 bg-rose-50",
  };
  const text: Record<Tone, string> = {
    slate: "text-slate-900",
    sky: "text-sky-900",
    indigo: "text-indigo-900",
    emerald: "text-emerald-900",
    amber: "text-amber-900",
    rose: "text-rose-900",
  };
  return (
    <div className={`rounded-lg border ${box[tone]} px-3 py-2`}>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${text[tone]}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

const STATUS_META: Record<
  MilestoneStatus,
  { label: string; dot: string; badge: string }
> = {
  pending: {
    label: "Upcoming",
    dot: "bg-slate-300",
    badge: "bg-slate-100 text-slate-600",
  },
  in_progress: {
    label: "In progress",
    dot: "bg-sky-500",
    badge: "bg-sky-100 text-sky-800",
  },
  awaiting_approval: {
    label: "Awaiting client",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-800",
  },
  approved: {
    label: "Ready to bill",
    dot: "bg-indigo-500",
    badge: "bg-indigo-100 text-indigo-800",
  },
  released: {
    label: "Released",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800",
  },
  disputed: {
    label: "Disputed",
    dot: "bg-rose-500",
    badge: "bg-rose-100 text-rose-800",
  },
};

function StatusDot({ status }: { status: MilestoneStatus }) {
  return (
    <span
      className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_META[status].dot}`}
      aria-hidden
    />
  );
}

function StatusBadge({ status }: { status: MilestoneStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}
    >
      {meta.label}
    </span>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
