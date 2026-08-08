"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
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
import type { Deal, QuoteLine } from "@/types";

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
      {/* One headline KPI strip owns the top-line numbers + alerts, so the
          rest of the tab stops reading as several co-equal "dashboard stat"
          rows (Brennan's note). Forecast stays open (summaries/alerts); the
          deep transactional bands collapse by default (UX_PRINCIPLES). */}
      <div className="space-y-6">
        <FinancesGlanceStrip deal={deal} lines={lines} signals={signals} />
        <FinanceGroup
          title="Forecast"
          subtitle="Budget, margin, cash flow & sub overruns"
        >
          <BudgetPanel dealId={deal.id} onSignal={(s) => emit("budget", s)} />
          <FinanceForecastPanel dealId={deal.id} onSignal={(s) => emit("margin", s)} />
          <CashFlowTimelinePanel dealId={deal.id} onSignal={(s) => emit("cash", s)} />
          <SubCostPanel dealId={deal.id} onSignal={(s) => emit("subs", s)} />
        </FinanceGroup>

        <FinanceGroup
          title="Ledger"
          subtitle="Change orders, invoices & payments"
          collapsible
          defaultOpen={false}
        >
          <ChangeOrdersPanel deal={deal} />
          <InvoicesPanel deal={deal} />
          <PaymentsSection deal={deal} />
        </FinanceGroup>

        <FinanceGroup
          title="Sourcing"
          subtitle="Sub RFQs & bid benchmarking"
          collapsible
          defaultOpen={false}
        >
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
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const showBody = !collapsible || open;
  const Header = collapsible ? "button" : "div";
  return (
    <section>
      <Header
        {...(collapsible
          ? { onClick: () => setOpen((v) => !v), type: "button" as const }
          : {})}
        className={`mb-3 flex w-full items-baseline gap-2 border-b border-slate-200 pb-1.5 text-left ${
          collapsible ? "hover:border-slate-300" : ""
        }`}
      >
        {collapsible && (
          <ChevronDownIcon
            className={`h-3.5 w-3.5 self-center text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`}
          />
        )}
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {title}
        </h2>
        <span className="hidden truncate text-xs text-slate-400 sm:inline">
          {subtitle}
        </span>
        {collapsible && !open && (
          <span className="ml-auto text-xs font-medium text-sky-700">Show</span>
        )}
      </Header>
      {showBody && <div className="space-y-6">{children}</div>}
    </section>
  );
}

// The single headline for the whole tab: the top-line KPIs always visible,
// with the red/amber alerts folded in underneath. This is what makes the tab
// read as consolidated — one dashboard row, not several competing stat rows.
function FinancesGlanceStrip({
  deal,
  lines,
  signals,
}: {
  deal: Deal;
  lines: QuoteLine[];
  signals: Record<string, FinanceSignal | null>;
}) {
  const fmtMoney = (n: number) =>
    `$${Math.round(n).toLocaleString("en-US")}`;
  const customerTotal = lines.reduce((s, l) => s + (l.customer_extended || 0), 0);
  const costTotal = lines.reduce((s, l) => s + (l.cost_extended || 0), 0);
  const margin =
    customerTotal > 0 ? ((customerTotal - costTotal) / customerTotal) * 100 : 0;

  const alerts = Object.values(signals)
    .filter((s): s is FinanceSignal => !!s)
    .sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "red" ? -1 : 1,
    );

  const marginTone =
    margin >= 15
      ? "text-emerald-700"
      : margin >= 5
        ? "text-sky-700"
        : "text-red-700";

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
        <h2 className="text-sm font-semibold text-slate-900">
          Finances at a glance
        </h2>
        <Link
          href={`/deals/${deal.id}/quote`}
          className="text-xs font-semibold text-sky-700 hover:text-sky-800"
        >
          {lines.length === 0 ? "Build estimate →" : "Edit estimate →"}
        </Link>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-200">
        <Kpi label="Estimate to Client" value={fmtMoney(customerTotal)} />
        <Kpi label="Cost" value={fmtMoney(costTotal)} />
        <Kpi label="Margin" value={`${margin.toFixed(1)}%`} tone={marginTone} />
      </div>
      {alerts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-2.5 sm:px-6">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Needs attention
          </span>
          {alerts.map((s, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
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
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  tone = "text-slate-900",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="px-3 py-3 sm:px-6 sm:py-4">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold tabular-nums sm:text-lg ${tone}`}>
        {value}
      </div>
    </div>
  );
}

