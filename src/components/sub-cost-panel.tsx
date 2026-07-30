"use client";

import CollapsibleDetail from "@/components/collapsible-detail";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FinanceSignal } from "@/lib/finance-signal";
import { ExclamationTriangleIcon, UsersIcon } from "@heroicons/react/24/outline";
import { listPayments, listRFQs } from "@/lib/store";
import type { Payment } from "@/types";
import type { ProjectRFQ } from "@/types/builder";

/**
 * Dynamic Finance Forecasting — panel 3: sub costs & overruns.
 *
 * Trustworthy overrun detection, per sub. We compare what was *committed*
 * (the awarded RFQ bid) against what's been *paid* (payments tagged with that
 * sub's party_ref). Both are reliably captured — payments always record who
 * got paid, and awards record the promised amount — unlike per-phase spend,
 * which depends on milestone tags builders rarely set. So an alert only fires
 * on real, attributable data: "you awarded the framer $46k, you've paid $48.2k."
 *
 * Per-sub cost vs. commitment is also the atomic capture the product compounds
 * on: real costs per trade → smarter future bids + sub reliability over time.
 */

const fmt = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;

interface SubRow {
  key: string;
  name: string;
  committed: number;
  paid: number;
  phases: string[];
}

export default function SubCostPanel({
  dealId,
  onSignal,
}: {
  dealId: string;
  onSignal?: (s: FinanceSignal | null) => void;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [rfqs, setRfqs] = useState<ProjectRFQ[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [payR, rqR] = await Promise.allSettled([
        listPayments(dealId),
        listRFQs(dealId),
      ]);
      if (!active) return;
      const unwrap = <T,>(r: PromiseSettledResult<T[]>, label: string): T[] => {
        if (r.status === "fulfilled") return r.value;
        console.warn(`[sub-cost] ${label} failed`, r.reason);
        return [];
      };
      setPayments(unwrap(payR, "listPayments"));
      setRfqs(unwrap(rqR, "listRFQs"));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [dealId]);

  const model = useMemo(() => {
    const byKey = new Map<string, SubRow>();
    const keyFor = (ref?: string, name?: string) =>
      ref || `name:${(name || "").toLowerCase().trim()}`;
    const get = (key: string, name: string): SubRow => {
      let r = byKey.get(key);
      if (!r) {
        r = { key, name, committed: 0, paid: 0, phases: [] };
        byKey.set(key, r);
      }
      return r;
    };

    // Committed = winning bid on each awarded/closed RFQ.
    for (const rfq of rfqs) {
      if (rfq.status !== "awarded" && rfq.status !== "closed") continue;
      const winner =
        rfq.invitees.find((i) => i.status === "selected") ??
        rfq.invitees.find((i) => i.sub_ref === rfq.awarded_to_sub_ref);
      if (!winner || !winner.bid_amount) continue;
      const row = get(keyFor(winner.sub_ref, winner.sub_name), winner.sub_name);
      row.committed += winner.bid_amount;
      if (rfq.phase && !row.phases.includes(rfq.phase)) row.phases.push(rfq.phase);
    }

    // Paid = outgoing payments, grouped by the party (sub) they went to.
    for (const p of payments) {
      if (p.direction !== "out") continue;
      const row = get(keyFor(p.party_ref, p.party_name), p.party_name || "Unknown");
      row.paid += p.amount || 0;
    }

    const rows = [...byKey.values()];
    const classify = (r: SubRow) =>
      r.committed <= 0 ? "untracked" : r.paid > r.committed + 1 ? "over" : "on_track";
    rows.sort((a, b) => {
      const rank = { over: 0, on_track: 1, untracked: 2 } as const;
      const ca = classify(a);
      const cb = classify(b);
      if (rank[ca] !== rank[cb]) return rank[ca] - rank[cb];
      if (ca === "over") return b.paid - b.committed - (a.paid - a.committed);
      return b.paid - a.paid;
    });

    const overRows = rows.filter((r) => classify(r) === "over");
    const overTotal = overRows.reduce((s, r) => s + (r.paid - r.committed), 0);
    const totalCommitted = rows.reduce((s, r) => s + r.committed, 0);
    const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
    const untrackedPaid = rows
      .filter((r) => classify(r) === "untracked")
      .reduce((s, r) => s + r.paid, 0);

    return {
      rows,
      classify,
      overRows,
      overTotal,
      totalCommitted,
      totalPaid,
      untrackedPaid,
      hasData: rows.length > 0,
    };
  }, [payments, rfqs]);

  const signal = useMemo<FinanceSignal | null>(() => {
    if (model.overRows.length === 0) return null;
    return {
      severity: "red",
      label: `${model.overRows.length} sub${model.overRows.length === 1 ? "" : "s"} over bid`,
      detail: `${fmt(model.overTotal)} over`,
    };
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
          <UsersIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Sub costs &amp; overruns
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Awarded (committed) vs. paid, by sub.
        </p>
      </header>

      {!loaded ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : !model.hasData ? (
        <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No sub costs yet — award an RFQ and log payments to subs to track
          committed vs. actual.
        </p>
      ) : (
        <>
          {model.overRows.length > 0 ? (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                {model.overRows.length} sub
                {model.overRows.length === 1 ? "" : "s"} over the awarded bid —{" "}
                {fmt(model.overTotal)} total. Review before the next payment.
              </span>
            </div>
          ) : model.totalCommitted > 0 ? (
            <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              All subs within their awarded bids.
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Tile label="Committed" value={fmt(model.totalCommitted)} tone="sky" sub="awarded bids" />
            <Tile label="Paid to subs" value={fmt(model.totalPaid)} tone="indigo" sub="payments out" />
            <Tile
              label="Over awarded"
              value={fmt(model.overTotal)}
              tone={model.overTotal > 0 ? "rose" : "emerald"}
              sub={model.overTotal > 0 ? "across flagged subs" : "none over"}
            />
          </div>

          <CollapsibleDetail summary={`${model.rows.length} sub${model.rows.length === 1 ? "" : "s"}`}>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
              {model.rows.map((r) => (
                <SubRowView key={r.key} row={r} status={model.classify(r)} />
              ))}
            </ul>
          </CollapsibleDetail>

          {model.untrackedPaid > 0 ? (
            <p className="mt-3 text-[11px] text-slate-500">
              {fmt(model.untrackedPaid)} paid to subs with no awarded bid to
              compare against. Award their RFQ to catch overruns automatically.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function SubRowView({
  row,
  status,
}: {
  row: SubRow;
  status: "over" | "on_track" | "untracked";
}) {
  const variance = row.paid - row.committed;
  const pct = row.committed > 0 ? Math.min(100, (row.paid / row.committed) * 100) : 0;
  const barColor =
    status === "over" ? "bg-rose-500" : status === "on_track" ? "bg-sky-500" : "bg-slate-300";

  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
          {row.name}
          {row.phases.length > 0 ? (
            <span className="ml-2 text-[11px] font-normal text-slate-400">
              {row.phases.join(" · ")}
            </span>
          ) : null}
        </span>
        <span className="text-right text-xs tabular-nums text-slate-500">
          {row.committed > 0 ? (
            <>
              {fmt(row.paid)} <span className="text-slate-400">/ {fmt(row.committed)}</span>
            </>
          ) : (
            <>{fmt(row.paid)} paid</>
          )}
        </span>
        <span className="w-28 text-right">
          {status === "over" ? (
            <Badge tone="rose">
              +{fmt(variance)} over
              {row.committed > 0 ? ` (${((variance / row.committed) * 100).toFixed(0)}%)` : ""}
            </Badge>
          ) : status === "on_track" ? (
            variance >= 0 ? (
              <Badge tone="emerald">Paid in full</Badge>
            ) : (
              <Badge tone="sky">{fmt(-variance)} left</Badge>
            )
          ) : (
            <Badge tone="slate">No awarded bid</Badge>
          )}
        </span>
      </div>
      {row.committed > 0 ? (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </li>
  );
}

type Tone = "slate" | "sky" | "indigo" | "emerald" | "rose";
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
    rose: "border-rose-200 bg-rose-50",
  };
  const text: Record<Tone, string> = {
    slate: "text-slate-900",
    sky: "text-sky-900",
    indigo: "text-indigo-900",
    emerald: "text-emerald-900",
    rose: "text-rose-900",
  };
  return (
    <div className={`rounded-lg border ${box[tone]} px-3 py-2`}>
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${text[tone]}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "rose" | "emerald" | "sky" | "slate";
  children: React.ReactNode;
}) {
  const cls: Record<typeof tone, string> = {
    rose: "bg-rose-100 text-rose-800",
    emerald: "bg-emerald-100 text-emerald-800",
    sky: "bg-sky-100 text-sky-800",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls[tone]}`}>
      {children}
    </span>
  );
}
