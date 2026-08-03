"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FinanceSignal } from "@/lib/finance-signal";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import {
  listChangeOrders,
  listMilestones,
  listPayments,
  listQuoteLines,
} from "@/lib/store";
import type { Payment, QuoteLine } from "@/types";
import type { ProjectChangeOrder, ProjectMilestone } from "@/types/builder";

/**
 * Dynamic Finance Forecasting — panel 2: cash-flow timeline.
 *
 * The premium payload: builders go under on profitable jobs because they pay
 * subs *before* the client draw lands. This projects the running cash balance
 * forward and surfaces the LOW POINT — "you'll dip to −$40k around Sept, three
 * weeks before the Finishes draw" — while there's still time to act.
 *
 * Model (all clearly split into actual vs projected):
 *   Actuals   — every logged payment, in/out, at its date.
 *   Projected — each not-yet-released draw as cash IN at its planned end date;
 *               remaining cost (budget − paid) distributed across the upcoming
 *               phases by draw %, as cash OUT at each phase's planned START —
 *               so outflow leads the inflow within a phase, the way real
 *               builder cash actually behaves.
 *
 * Where data is thin (no dated draw schedule), we don't guess — we show the
 * actual position and say what's needed to project.
 */

const fmt = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function parseIso(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function endOfMonth(year: number, month0: number): Date {
  return new Date(year, month0 + 1, 0, 23, 59, 59, 999);
}

interface CashEvent {
  t: Date;
  delta: number; // + inflow, − outflow
  projected: boolean;
}

export default function CashFlowTimelinePanel({
  dealId,
  onSignal,
}: {
  dealId: string;
  onSignal?: (s: FinanceSignal | null) => void;
}) {
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [cos, setCos] = useState<ProjectChangeOrder[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [qlR, coR, payR, msR] = await Promise.allSettled([
        listQuoteLines(dealId),
        listChangeOrders(dealId),
        listPayments(dealId),
        listMilestones(dealId),
      ]);
      if (!active) return;
      const unwrap = <T,>(r: PromiseSettledResult<T[]>, label: string): T[] => {
        if (r.status === "fulfilled") return r.value;
        console.warn(`[cash-flow-timeline] ${label} failed`, r.reason);
        return [];
      };
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

  const model = useMemo(() => {
    const today = startOfToday();

    // ── actual events: logged payments ──
    const events: CashEvent[] = [];
    for (const p of payments) {
      const t = parseIso(p.date) ?? parseIso(p.created_at);
      if (!t) continue;
      events.push({
        t,
        delta: p.direction === "in" ? p.amount || 0 : -(p.amount || 0),
        projected: false,
      });
    }
    const cashNow = payments.reduce(
      (s, p) => s + (p.direction === "in" ? p.amount || 0 : -(p.amount || 0)),
      0,
    );

    // ── projected events ──
    const costBudget =
      lines.reduce((s, l) => s + (l.cost_extended || 0), 0) +
      cos
        .filter((c) => c.status === "approved")
        .reduce((s, c) => s + (c.amount_delta || 0), 0);
    const paidOut = payments
      .filter((p) => p.direction === "out")
      .reduce((s, p) => s + (p.amount || 0), 0);
    const remainingCost = Math.max(0, costBudget - paidOut);

    const upcoming = milestones
      .filter((m) => m.status !== "released")
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const pctSum = upcoming.reduce((s, m) => s + (m.percentage || 0), 0);

    let projectable = false;
    for (const m of upcoming) {
      const end = parseIso(m.planned_end_date);
      const start = parseIso(m.planned_start_date) ?? end;
      // Draw in — at (or after) planned end; overdue draws land "now".
      if (end) {
        projectable = true;
        events.push({
          t: end < today ? today : end,
          delta: m.amount || 0,
          projected: true,
        });
      }
      // Cost out — distributed by draw %, at phase start (leads the draw).
      if (start && pctSum > 0 && remainingCost > 0) {
        const share = remainingCost * ((m.percentage || 0) / pctSum);
        if (share > 0) {
          events.push({
            t: start < today ? today : start,
            delta: -share,
            projected: true,
          });
        }
      }
    }

    events.sort((a, b) => a.t.getTime() - b.t.getTime());
    if (events.length === 0) {
      return { hasData: false } as const;
    }

    // ── monthly series: month-END running balance ──
    // We resolve to month granularity on purpose. Our projection inputs
    // (planned phase dates, cost distributed by draw %) are month-precise at
    // best, so a per-event trough would be false precision — and sensitive to
    // the arbitrary ordering of same-day events. Month-end is defensible and
    // keeps the headline low point consistent with what the chart draws.
    const first = events[0].t;
    const last = events[events.length - 1].t;
    const series: {
      label: string;
      date: Date;
      balance: number;
      projected: boolean;
    }[] = [];
    let y = first.getFullYear();
    let m0 = first.getMonth();
    for (let i = 0; i < 60; i++) {
      const eom = endOfMonth(y, m0);
      const bal = events
        .filter((e) => e.t.getTime() <= eom.getTime())
        .reduce((s, e) => s + e.delta, 0);
      series.push({
        label: fmtDate(new Date(y, m0, 1)),
        date: new Date(y, m0, 1),
        balance: bal,
        projected: eom.getTime() > today.getTime(),
      });
      if (y === last.getFullYear() && m0 === last.getMonth()) break;
      m0++;
      if (m0 > 11) {
        m0 = 0;
        y++;
      }
    }

    // ── forward low point, from the month-end series ──
    const forwardMonths = series.filter((s) => s.projected);
    const low =
      forwardMonths.length > 0
        ? forwardMonths.reduce((m, s) => (s.balance < m.balance ? s : m))
        : null;
    const projectedLow = low
      ? { value: low.balance, date: low.date }
      : { value: cashNow, date: today };
    const financingNeed =
      projectedLow.value < 0 ? -projectedLow.value : 0;

    return {
      hasData: true,
      projectable,
      cashNow,
      projectedLow,
      financingNeed,
      remainingCost,
      series,
      today,
    } as const;
  }, [lines, cos, payments, milestones]);

  const signal = useMemo<FinanceSignal | null>(() => {
    if (!model.projectable) return null;
    if (model.projectedLow.value < 0)
      return { severity: "red", label: "Cash shortfall", detail: `${fmt(Math.abs(model.projectedLow.value))} at the low point` };
    if (model.projectedLow.value < model.cashNow)
      return { severity: "amber", label: "Cash dips", detail: `to ${fmt(model.projectedLow.value)}` };
    return null;
  }, [model]);
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;
  useEffect(() => {
    onSignalRef.current?.(signal);
  }, [signal]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <BanknotesIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Cash-flow timeline
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Running cash position — actual, then projected forward.
        </p>
      </header>

      {!loaded ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : !model.hasData ? (
        <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No cash activity yet — log client draws and sub payments to see your
          cash position over time.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Tile
              label="Cash on project now"
              value={fmt(model.cashNow)}
              tone={model.cashNow >= 0 ? "emerald" : "rose"}
              sub="collected − paid to date"
            />
            <Tile
              label="Projected low point"
              value={model.projectable ? fmt(model.projectedLow.value) : "—"}
              tone={
                !model.projectable
                  ? "slate"
                  : model.projectedLow.value < 0
                    ? "rose"
                    : model.projectedLow.value < model.cashNow
                      ? "amber"
                      : "emerald"
              }
              sub={
                model.projectable
                  ? `around ${model.projectedLow.date.toLocaleDateString(undefined, { month: "long" })}`
                  : "add draw dates to project"
              }
            />
            <Tile
              label="Bridge financing need"
              value={model.projectable ? fmt(model.financingNeed) : "—"}
              tone={
                !model.projectable
                  ? "slate"
                  : model.financingNeed > 0
                    ? "rose"
                    : "emerald"
              }
              sub={
                !model.projectable
                  ? "add draw dates to project"
                  : model.financingNeed > 0
                    ? "to cover the low point"
                    : "none — self-funds"
              }
            />
          </div>

          {/* The punch line */}
          {model.projectable ? (
            model.projectedLow.value < 0 ? (
              <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                Projected cash shortfall of {fmt(Math.abs(model.projectedLow.value))}{" "}
                around{" "}
                {model.projectedLow.date.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
                . You&apos;ll owe subs before that draw releases — line up financing
                or pull the draw forward.
              </p>
            ) : model.projectedLow.value < model.cashNow ? (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                Cash dips to {fmt(model.projectedLow.value)} around{" "}
                {model.projectedLow.date.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}{" "}
                before recovering — stays positive, but watch that window.
              </p>
            ) : (
              <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                Cash stays positive throughout — low point{" "}
                {fmt(model.projectedLow.value)}.
              </p>
            )
          ) : (
            <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Showing actual cash to date. Add planned dates to the draw schedule
              (Schedule tab) to project the cash curve forward.
            </p>
          )}

          <BalanceChart series={model.series} />

          <div className="mt-2 flex items-center justify-end gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-4 rounded bg-slate-700" /> Actual
            </span>
            <span className="flex items-center gap-1">
              <span className="h-0.5 w-4 rounded bg-slate-400 opacity-70 [background:repeating-linear-gradient(90deg,currentColor_0_3px,transparent_3px_6px)]" />{" "}
              Projected
            </span>
          </div>
        </>
      )}
    </section>
  );
}

// ── running-balance line chart (inline SVG, no deps) ────────────────
function BalanceChart({
  series,
}: {
  series: { label: string; balance: number; projected: boolean }[];
}) {
  const W = 640;
  const H = 150;
  const padX = 8;
  const padTop = 12;
  const padBottom = 22;
  if (series.length < 2) return null;

  const vals = series.map((s) => s.balance);
  const maxV = Math.max(0, ...vals);
  const minV = Math.min(0, ...vals);
  const range = maxV - minV || 1;
  const plotH = H - padTop - padBottom;
  const x = (i: number) =>
    padX + (i * (W - padX * 2)) / (series.length - 1);
  const y = (v: number) => padTop + ((maxV - v) / range) * plotH;
  const zeroY = y(0);

  // Split into actual + projected polylines (share the boundary point).
  const firstProj = series.findIndex((s) => s.projected);
  const boundary = firstProj <= 0 ? series.length : firstProj;
  const actualPts = series
    .slice(0, boundary)
    .map((s, i) => `${x(i)},${y(s.balance)}`)
    .join(" ");
  const projPts = series
    .slice(Math.max(0, boundary - 1))
    .map((s, i) => `${x(Math.max(0, boundary - 1) + i)},${y(s.balance)}`)
    .join(" ");

  const lowIdx = vals.indexOf(Math.min(...vals));

  return (
    <div className="mt-4 overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[420px]"
        role="img"
        aria-label="Projected running cash balance over time"
      >
        {/* zero baseline */}
        <line
          x1={padX}
          x2={W - padX}
          y1={zeroY}
          y2={zeroY}
          stroke="#cbd5e1"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
        <text x={padX} y={zeroY - 3} fontSize="9" fill="#94a3b8">
          $0
        </text>
        {/* actual segment */}
        {actualPts && (
          <polyline
            points={actualPts}
            fill="none"
            stroke="#334155"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {/* projected segment */}
        {boundary < series.length && (
          <polyline
            points={projPts}
            fill="none"
            stroke="#64748b"
            strokeWidth="2"
            strokeDasharray="4 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {/* low-point marker */}
        <circle
          cx={x(lowIdx)}
          cy={y(series[lowIdx].balance)}
          r="3.5"
          fill={series[lowIdx].balance < 0 ? "#e11d48" : "#0ea5e9"}
        />
        {/* month labels (sparse to avoid crowding) */}
        {series.map((s, i) => {
          const step = Math.ceil(series.length / 6);
          if (i % step !== 0 && i !== series.length - 1) return null;
          return (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              fontSize="9"
              fill="#94a3b8"
              textAnchor={
                i === 0
                  ? "start"
                  : i === series.length - 1
                    ? "end"
                    : "middle"
              }
            >
              {s.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── tile ────────────────────────────────────────────────────────────
type Tone = "slate" | "sky" | "emerald" | "amber" | "rose";
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
    emerald: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    rose: "border-rose-200 bg-rose-50",
  };
  const text: Record<Tone, string> = {
    slate: "text-slate-900",
    sky: "text-sky-900",
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
