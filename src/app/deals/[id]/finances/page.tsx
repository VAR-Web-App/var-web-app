"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import RFQPanel from "@/components/rfq-panel";
import ChangeOrdersPanel from "@/components/change-orders-panel";
import PaymentsSection from "@/components/payments-section";
import BudgetPanel from "@/components/budget-panel";
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
      <div className="space-y-6">
        <EstimateSummary dealId={deal.id} lines={lines} />
        <BudgetPanel dealId={deal.id} />
        <ChangeOrdersPanel deal={deal} />
        <InvoicesPanel deal={deal} />
        <PaymentsSection deal={deal} />
        <RFQPanel deal={deal} />
      </div>
    </DealPageShell>
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
