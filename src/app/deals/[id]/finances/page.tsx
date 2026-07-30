"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { FinanceSignal } from "@/lib/finance-signal";
import RFQPanel from "@/components/rfq-panel";
import BidIntelligencePanel from "@/components/bid-intelligence-panel";
import ChangeOrdersPanel from "@/components/change-orders-panel";
import PaymentsSection from "@/components/payments-section";
import BudgetPanel from "@/components/budget-panel";
import FinanceForecastPanel from "@/components/finance-forecast-panel";
import CashFlowTimelinePanel from "@/components/cash-flow-timeline-panel";
import SubCostPanel from "@/components/sub-cost-panel";
import InvoicesPanel from "@/components/invoices-panel";
import DealPageShell, {
  DealLoadingShell,
  DealNotFoundShell,
} from "@/components/deal-page-shell";
import { useDeal } from "@/lib/use-deal";
import { listQuoteLines } from "@/lib/store";
import type { QuoteLine } from "@/types";

export default function DealFinancesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { deal, loaded } = useDeal(id);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  // Signals emitted up by the Forecast panels → aggregated in the attention
  // strip at the top of the tab (governor: hoist the alerts, keep visible).
  const [signals, setSignals] = useState<Record<string, FinanceSignal | null>>({});
  const emit = useCallback((key: string, s: FinanceSignal | null) => {
    setSignals((p) => (p[key] === s ? p : { ...p, [key]: s }));
  }, []);

  useEffect(() => {
    if (!deal) return;
    let active = true;
    void (async () => {
      const l = await listQuoteLines(deal.id);
      if (active) setLines(l);
    })();
    return () => {
      active = false;
    };
  }, [deal]);

  if (!loaded) return <DealLoadingShell />;
  if (!deal) return <DealNotFoundShell />;

  return (
    <DealPageShell deal={deal} active="finances">
      {/* Grouped into three bands so the tab reads as 3 areas, not 10 flat
          peers (UX_PRINCIPLES: group past ~4–5 co-equal panels). Phase 2:
          a top attention strip aggregating the red/amber signals + collapsing
          the deep tables. */}
      <div className="space-y-8">
        <FinancesAttentionStrip signals={signals} />
        <FinanceGroup
          title="Forecast"
          subtitle="Estimate, budget, margin, cash flow & sub overruns"
        >
          <EstimateSummary dealId={deal.id} lines={lines} />
          <BudgetPanel dealId={deal.id} onSignal={(s) => emit("budget", s)} />
          <FinanceForecastPanel dealId={deal.id} onSignal={(s) => emit("margin", s)} />
          <CashFlowTimelinePanel dealId={deal.id} onSignal={(s) => emit("cash", s)} />
          <SubCostPanel dealId={deal.id} onSignal={(s) => emit("subs", s)} />
        </FinanceGroup>

        <FinanceGroup
          title="Ledger"
          subtitle="Change orders, invoices & payments"
        >
          <ChangeOrdersPanel deal={deal} />
          <InvoicesPanel deal={deal} />
          <PaymentsSection deal={deal} />
        </FinanceGroup>

        <FinanceGroup title="Sourcing" subtitle="Sub RFQs & bid benchmarking">
          <RFQPanel deal={deal} />
          <BidIntelligencePanel deal={deal} />
        </FinanceGroup>
      </div>
    </DealPageShell>
  );
}

function FinanceGroup({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2 border-b border-slate-200 pb-1.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {title}
        </h2>
        <span className="hidden truncate text-xs text-slate-400 sm:inline">
          {subtitle}
        </span>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

// Aggregates the red/amber signals the Forecast panels emit into one row at
// the top of the tab. Self-hides when everything's clear (never shows a
// "nothing wrong" banner). Red first.
function FinancesAttentionStrip({
  signals,
}: {
  signals: Record<string, FinanceSignal | null>;
}) {
  const active = Object.values(signals).filter((s): s is FinanceSignal => !!s);
  if (active.length === 0) return null;
  active.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "red" ? -1 : 1,
  );
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">
        Needs attention
      </span>
      {active.map((s, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            s.severity === "red"
              ? "bg-rose-100 text-rose-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {s.label}
          <span className="font-normal opacity-80">· {s.detail}</span>
        </span>
      ))}
    </div>
  );
}

function EstimateSummary({
  dealId,
  lines,
}: {
  dealId: string;
  lines: QuoteLine[];
}) {
  const fmtMoney = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const customerTotal = lines.reduce(
    (s, l) => s + (l.customer_extended || 0),
    0,
  );
  const costTotal = lines.reduce((s, l) => s + (l.cost_extended || 0), 0);
  const margin =
    customerTotal > 0 ? ((customerTotal - costTotal) / customerTotal) * 100 : 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Project Estimate
          </h2>
          <p className="mt-0.5 hidden text-xs text-slate-500 md:block">
            {lines.length === 0
              ? "No line items yet — open the quote editor to build it out."
              : `${lines.length} line item${lines.length === 1 ? "" : "s"} · saved`}
          </p>
        </div>
        <Link
          href={`/deals/${dealId}/quote`}
          className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 sm:px-4"
        >
          {lines.length === 0 ? "Build estimate →" : "Edit estimate →"}
        </Link>
      </div>
      {lines.length > 0 ? (
        <div className="grid grid-cols-3 divide-x divide-slate-200">
          <div className="px-3 py-3 sm:px-6 sm:py-4">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">
              Cost
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-slate-900 sm:text-lg">
              {fmtMoney(costTotal)}
            </div>
          </div>
          <div className="px-3 py-3 sm:px-6 sm:py-4">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">
              <span className="sm:hidden">Client</span>
              <span className="hidden sm:inline">Estimate to Client</span>
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-emerald-700 sm:text-lg">
              {fmtMoney(customerTotal)}
            </div>
          </div>
          <div className="px-3 py-3 sm:px-6 sm:py-4">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">
              Margin
            </div>
            <div
              className={`mt-1 text-sm font-semibold tabular-nums sm:text-lg ${
                margin >= 15
                  ? "text-emerald-700"
                  : margin >= 5
                    ? "text-sky-700"
                    : "text-red-700"
              }`}
            >
              {margin.toFixed(1)}%
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
