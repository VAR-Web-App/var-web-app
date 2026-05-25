"use client";

// Takeoff — the internal/lumber-yard-facing document. Full cost +
// markup detail (NOT for client eyes), phase-grouped, with subtotals.
// Used by the GC to send a quantified materials list to subs or
// suppliers, or as their own internal print reference.
//
// Architecture mirrors the proposal page: print-optimized layout
// rendered in the browser, user prints to PDF via Cmd+P. No PDF
// library needed.

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  PrinterIcon,
} from "@heroicons/react/24/outline";
import { Deal, OrgSettings, QuoteLine } from "@/types";
import { getDeal, getSettings, listQuoteLines } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMoneyRound = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtQty = (n: number) => {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
};

export default function TakeoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { profile } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    void (async () => {
      const [d, s, l] = await Promise.all([
        getDeal(id),
        getSettings(profile.org_ref),
        listQuoteLines(id),
      ]);
      if (!active) return;
      setDeal(d ?? null);
      setSettings(s);
      setLines(l);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [id, profile]);

  // Group lines by Phase, preserving first-appearance order. Mirrors
  // the grouping logic in the quote page so what the GC sees there
  // matches what the takeoff prints.
  const grouped = useMemo(() => {
    const seen = new Map<string, number>();
    const out: Array<{
      phase: string;
      lines: QuoteLine[];
      costSubtotal: number;
      customerSubtotal: number;
    }> = [];
    for (const l of lines) {
      const phase = (l.product_code || "").trim() || "Uncategorized";
      let idx = seen.get(phase);
      if (idx == null) {
        idx = out.length;
        seen.set(phase, idx);
        out.push({
          phase,
          lines: [],
          costSubtotal: 0,
          customerSubtotal: 0,
        });
      }
      out[idx].lines.push(l);
      out[idx].costSubtotal += l.cost_extended || 0;
      out[idx].customerSubtotal += l.customer_extended || 0;
    }
    return out;
  }, [lines]);

  if (!deal || !loaded) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-10 text-sm text-slate-500">
        Loading takeoff…
      </div>
    );
  }

  const totalCost = lines.reduce((s, l) => s + (l.cost_extended || 0), 0);
  const totalCustomer = lines.reduce(
    (s, l) => s + (l.customer_extended || 0),
    0,
  );
  const totalMargin =
    totalCustomer > 0 ? ((totalCustomer - totalCost) / totalCustomer) * 100 : 0;

  const dateStr = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Print-only CSS rules. @media print hides the page toolbar so
       *  what gets saved as PDF is just the takeoff document body,
       *  and turns off the slate-100 page background. */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          @page {
            margin: 0.5in;
          }
          body {
            background: white !important;
          }
        }
      `}</style>

      {/* Toolbar — hidden in print */}
      <div className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <Link
            href={`/deals/${id}/quote`}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to estimate
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              Internal takeoff — shows cost + markup. Not for client eyes.
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800"
            >
              <PrinterIcon className="h-4 w-4" />
              Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      {/* Document body */}
      <div className="mx-auto max-w-4xl bg-white px-8 py-10 shadow-sm print:max-w-none print:shadow-none">
        <DocumentHeader
          deal={deal}
          settings={settings}
          dateStr={dateStr}
          lineCount={lines.length}
        />

        {grouped.length === 0 ? (
          <div className="mt-10 rounded border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            No line items on this estimate yet. Add assemblies or line
            items on the quote page, then come back here to print the
            takeoff.
          </div>
        ) : (
          <>
            <div className="mt-8 space-y-6">
              {grouped.map((g) => (
                <PhaseSection key={g.phase} group={g} />
              ))}
            </div>

            <TotalsBlock
              totalCost={totalCost}
              totalCustomer={totalCustomer}
              totalMargin={totalMargin}
            />
          </>
        )}
      </div>
    </div>
  );
}

function DocumentHeader({
  deal,
  settings,
  dateStr,
  lineCount,
}: {
  deal: Deal;
  settings: OrgSettings | null;
  dateStr: string;
  lineCount: number;
}) {
  return (
    <header className="border-b border-slate-300 pb-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Project Takeoff
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {deal.name}
            {deal.account_name ? ` — ${deal.account_name}` : ""}
          </p>
          {deal.ship_to_address ? (
            <p className="mt-0.5 whitespace-pre-line text-xs text-slate-500">
              {deal.ship_to_address}
            </p>
          ) : null}
        </div>
        <div className="text-right text-xs text-slate-600">
          {settings?.company_name ? (
            <div className="text-sm font-semibold text-slate-900">
              {settings.company_name}
            </div>
          ) : null}
          {settings?.company_phone ? (
            <div>{settings.company_phone}</div>
          ) : null}
          {settings?.company_email ? (
            <div>{settings.company_email}</div>
          ) : null}
          <div className="mt-2 text-slate-500">{dateStr}</div>
          <div className="text-slate-500">
            {lineCount} line{lineCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    </header>
  );
}

function PhaseSection({
  group,
}: {
  group: {
    phase: string;
    lines: QuoteLine[];
    costSubtotal: number;
    customerSubtotal: number;
  };
}) {
  const margin =
    group.customerSubtotal > 0
      ? ((group.customerSubtotal - group.costSubtotal) /
          group.customerSubtotal) *
        100
      : 0;
  return (
    // page-break-inside: avoid helps the printer keep a small phase
    // section on one page when possible.
    <section className="break-inside-avoid">
      <div className="flex items-baseline justify-between border-b border-slate-300 pb-1.5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
          {group.phase}
        </h2>
        <span className="text-xs text-slate-500">
          {group.lines.length} line{group.lines.length === 1 ? "" : "s"}
        </span>
      </div>
      <table className="mt-2 w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="py-1 pr-2 text-left">Description</th>
            <th className="py-1 px-2 text-right">Qty</th>
            <th className="py-1 px-2 text-right">Unit Cost</th>
            <th className="py-1 px-2 text-right">Markup</th>
            <th className="py-1 px-2 text-right">Unit Price</th>
            <th className="py-1 pl-2 text-right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          {group.lines.map((l) => (
            <tr
              key={l.id}
              className="border-t border-slate-100 align-baseline text-slate-700"
            >
              <td className="py-1 pr-2">{l.description}</td>
              <td className="py-1 px-2 text-right tabular-nums">
                {fmtQty(l.qty)}
              </td>
              <td className="py-1 px-2 text-right tabular-nums">
                {fmtMoney(l.cost_unit_price)}
              </td>
              <td className="py-1 px-2 text-right tabular-nums text-slate-500">
                {l.markup_percent.toFixed(0)}%
              </td>
              <td className="py-1 px-2 text-right tabular-nums">
                {fmtMoney(l.customer_unit_price)}
              </td>
              <td className="py-1 pl-2 text-right tabular-nums font-medium text-slate-900">
                {fmtMoney(l.customer_extended)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-300 text-slate-700">
            <td
              colSpan={2}
              className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wider text-slate-500"
            >
              Phase subtotal
            </td>
            <td className="py-1.5 px-2 text-right tabular-nums">
              {fmtMoneyRound(group.costSubtotal)}
            </td>
            <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">
              {margin.toFixed(0)}%
            </td>
            <td className="py-1.5 px-2 text-right tabular-nums" />
            <td className="py-1.5 pl-2 text-right tabular-nums font-semibold text-slate-900">
              {fmtMoneyRound(group.customerSubtotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function TotalsBlock({
  totalCost,
  totalCustomer,
  totalMargin,
}: {
  totalCost: number;
  totalCustomer: number;
  totalMargin: number;
}) {
  return (
    <section className="mt-10 break-inside-avoid border-t-2 border-slate-900 pt-4">
      <dl className="ml-auto max-w-sm space-y-1.5 text-sm">
        <div className="flex justify-between text-slate-700">
          <dt>Total cost basis</dt>
          <dd className="tabular-nums">{fmtMoneyRound(totalCost)}</dd>
        </div>
        <div className="flex justify-between text-slate-700">
          <dt>Margin</dt>
          <dd className="tabular-nums">{totalMargin.toFixed(1)}%</dd>
        </div>
        <div className="flex justify-between border-t border-slate-300 pt-1.5 text-base font-bold text-slate-900">
          <dt>Estimate to client</dt>
          <dd className="tabular-nums">{fmtMoneyRound(totalCustomer)}</dd>
        </div>
      </dl>
    </section>
  );
}
