"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { compareBoms } from "@/lib/compare";
import type { BomLine } from "@/lib/parsers";
import { DemoNav } from "../documents/page";

// Public, read-only demo of the BOM-vs-Quote comparison output. Mirrors
// what /compare looks like after both docs are parsed and the comparison
// has run. Same hardcoded data as /demo/sample so the numbers stay
// consistent across demo pages.

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDelta = (n: number) =>
  `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const QUOTE_BOM: BomLine[] = [
  { item_number: "1", part_number: "FAKE-SW-9300",   description: "Catalyst Sample Switch 24-port",      qty: 4,  unit_price: 5300.00, extended_price: 21200.00, extra_fields: {} },
  { item_number: "2", part_number: "FAKE-SFP-10G",   description: "10G SFP+ Optical Transceiver",         qty: 16, unit_price: 287.25,  extended_price: 4596.00,  extra_fields: {} },
  { item_number: "3", part_number: "FAKE-AP-9120",   description: "Wi-Fi 6 Access Point Indoor",          qty: 10, unit_price: 1245.00, extended_price: 12450.00, extra_fields: {} },
  { item_number: "4", part_number: "FAKE-CABLE-3M",  description: "3m Patch Cable Cat6A Blue",            qty: 50, unit_price: 24.99,   extended_price: 1249.50,  extra_fields: {} },
  { item_number: "5", part_number: "FAKE-PWR-AC",    description: "AC Power Supply 1100W",                qty: 4,  unit_price: 895.00,  extended_price: 3580.00,  extra_fields: {} },
  { item_number: "6", part_number: "FAKE-LIC-DNA",   description: "DNA Subscription License (1yr)",       qty: 4,  unit_price: 2150.00, extended_price: 8600.00,  extra_fields: {} },
  { item_number: "7", part_number: "FAKE-RACK-RU2",  description: "2U Rackmount Kit (rail + cable mgmt)", qty: 2,  unit_price: 850.00,  extended_price: 1700.00,  extra_fields: {} },
  { item_number: "8", part_number: "FAKE-PSU-RDND",  description: "Redundant PSU Bracket Assembly",       qty: 4,  unit_price: 320.00,  extended_price: 1280.00,  extra_fields: {} },
];

const AWARD_BOM: BomLine[] = [
  { item_number: "1", part_number: "FAKE-SW-9300",     description: "Catalyst Sample Switch 24-port",      qty: 4,  unit_price: 5234.50, extended_price: 20938.00, extra_fields: {} },
  { item_number: "2", part_number: "FAKE-SFP-10G",     description: "10G SFP+ Optical Transceiver",         qty: 16, unit_price: 287.25,  extended_price: 4596.00,  extra_fields: {} },
  { item_number: "3", part_number: "FAKE-AP-9120",     description: "Wi-Fi 6 Access Point Indoor",          qty: 12, unit_price: 1245.00, extended_price: 14940.00, extra_fields: {} },
  { item_number: "4", part_number: "FAKE-CABLE-3M",    description: "3m Patch Cable Cat6A Blue",            qty: 50, unit_price: 24.99,   extended_price: 1249.50,  extra_fields: {} },
  { item_number: "5", part_number: "FAKE-PWR-AC",      description: "AC Power Supply 1100W",                qty: 4,  unit_price: 895.00,  extended_price: 3580.00,  extra_fields: {} },
  { item_number: "6", part_number: "FAKE-LIC-DNA",     description: "DNA Subscription License (1yr)",       qty: 4,  unit_price: 2100.00, extended_price: 8400.00,  extra_fields: {} },
  { item_number: "7", part_number: "FAKE-CON-3YR",     description: "Smartcare Service 3yr (per device)",   qty: 32, unit_price: 446.42,  extended_price: 14285.45, extra_fields: {} },
  { item_number: "8", part_number: "FAKE-INSTALL-LBR", description: "Onsite Installation Labor",            qty: 1,  unit_price: 3500.00, extended_price: 3500.00,  extra_fields: {} },
];

export default function DemoComparePage() {
  const comparison = compareBoms(QUOTE_BOM, AWARD_BOM);
  const issueRows = comparison.matched.filter((r) => r.diff !== "match");
  const matchCount = comparison.matched.length - issueRows.length;
  const totalIssues =
    issueRows.length + comparison.only_in_quote.length + comparison.only_in_award.length;
  const deltaColor = comparison.totals.delta > 0 ? "text-emerald-700" : "text-red-700";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-sky-200 bg-sky-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3 text-sm">
          <span className="text-sky-900">
            <span className="font-semibold">Demo</span> — read-only output of the BOM comparison engine. Drop your own docs in the live app.
          </span>
          <Link
            href="/login"
            className="inline-flex items-center gap-1 rounded-md bg-sky-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
          >
            Get started
            <ArrowRightIcon className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <DemoNav active="compare" />

        <Link
          href="/demo"
          className="mt-6 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Pipeline
        </Link>

        <div className="mt-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Compare</h1>
          <p className="mt-1 text-sm text-slate-500">
            Drop in two BOMs — typically your quote and the award PDF. The comparison
            highlights every line that doesn&apos;t match: price drift, quantity changes,
            lines added, lines dropped.
          </p>
        </div>

        {/* File chips showing both docs are parsed */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <FileChip name="synthetic-quote.pdf" lines={QUOTE_BOM.length} total={comparison.totals.quote_extended} label="Original Quote" />
          <FileChip name="synthetic-award.pdf" lines={AWARD_BOM.length} total={comparison.totals.award_extended} label="Award PDF" />
        </div>

        {/* Summary banner */}
        <section
          className={`mt-6 rounded-xl border p-6 ${
            totalIssues === 0 ? "border-emerald-200 bg-emerald-50" : "border-sky-200 bg-sky-50"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div className="flex items-center gap-3">
              {totalIssues === 0 ? (
                <CheckCircleIcon className="h-7 w-7 flex-shrink-0 text-emerald-600" />
              ) : (
                <ExclamationTriangleIcon className="h-7 w-7 flex-shrink-0 text-sky-600" />
              )}
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {totalIssues === 0 ? "Quote and award match" : `${totalIssues} discrepancies`}
                </h2>
                <p className="text-sm text-slate-700">
                  {matchCount} matched · {issueRows.length} with issues ·{" "}
                  {comparison.only_in_quote.length} only in quote ·{" "}
                  {comparison.only_in_award.length} only in award
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="grid grid-cols-3 gap-x-6 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Quote</div>
                  <div className="font-semibold tabular-nums text-slate-900">
                    {fmtMoney(comparison.totals.quote_extended)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Award</div>
                  <div className="font-semibold tabular-nums text-slate-900">
                    {fmtMoney(comparison.totals.award_extended)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Delta</div>
                  <div className={`font-semibold tabular-nums ${deltaColor}`}>
                    {fmtDelta(comparison.totals.delta)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Discrepancy table */}
        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Discrepancies ({issueRows.length})</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Lines where the two BOMs disagree on qty, price, or presence. Cells with
              differences highlighted in amber.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Part &amp; Description</th>
                  <th className="px-4 py-3 text-right">Quote</th>
                  <th className="px-4 py-3 text-right">Award</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issueRows.map((row, i) => {
                  const qtyChanged = row.quote.qty !== row.award.qty;
                  const priceChanged =
                    Math.abs(row.quote.unit_price - row.award.unit_price) > 0.005;
                  const extDelta = row.award.extended_price - row.quote.extended_price;
                  const labels: string[] = [];
                  if (qtyChanged) labels.push("Qty Δ");
                  if (priceChanged) labels.push("Price Δ");
                  const dColor = extDelta > 0 ? "text-emerald-700" : "text-red-700";
                  return (
                    <tr key={i} className="bg-sky-50/30">
                      <td className="px-4 py-3 align-top">
                        <div className="font-mono text-xs text-slate-900">{row.part_number}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{row.award.description}</div>
                      </td>
                      <td className="px-4 py-3 text-right align-top text-xs tabular-nums">
                        {row.quote.qty} × {fmtMoney(row.quote.unit_price)}
                        <div className="text-[11px] text-slate-500">= {fmtMoney(row.quote.extended_price)}</div>
                      </td>
                      <td className="px-4 py-3 text-right align-top text-xs tabular-nums">
                        {row.award.qty} × {fmtMoney(row.award.unit_price)}
                        <div className="text-[11px] text-slate-500">= {fmtMoney(row.award.extended_price)}</div>
                      </td>
                      <td className="px-4 py-3 align-top text-xs">
                        <div className="font-medium text-sky-900">{labels.join(" + ")}</div>
                        {Math.abs(extDelta) > 0.01 && (
                          <div className={`tabular-nums ${dColor}`}>
                            {fmtDelta(extDelta)} on this line
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {comparison.only_in_quote.map((line, i) => (
                  <tr key={`q${i}`} className="bg-sky-50/30">
                    <td className="px-4 py-3 align-top">
                      <div className="font-mono text-xs text-slate-900">{line.part_number}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{line.description}</div>
                    </td>
                    <td className="px-4 py-3 text-right align-top text-xs tabular-nums">
                      {line.qty} × {fmtMoney(line.unit_price)}
                      <div className="text-[11px] text-slate-500">= {fmtMoney(line.extended_price)}</div>
                    </td>
                    <td className="px-4 py-3 text-right align-top text-xs italic text-slate-400">—</td>
                    <td className="px-4 py-3 align-top text-xs">
                      <div className="font-medium text-sky-900">Only in quote</div>
                      <div className="text-slate-500">customer dropped from award</div>
                    </td>
                  </tr>
                ))}
                {comparison.only_in_award.map((line, i) => (
                  <tr key={`a${i}`} className="bg-blue-50/30">
                    <td className="px-4 py-3 align-top">
                      <div className="font-mono text-xs text-slate-900">{line.part_number}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{line.description}</div>
                    </td>
                    <td className="px-4 py-3 text-right align-top text-xs italic text-slate-400">—</td>
                    <td className="px-4 py-3 text-right align-top text-xs tabular-nums">
                      {line.qty} × {fmtMoney(line.unit_price)}
                      <div className="text-[11px] text-slate-500">= {fmtMoney(line.extended_price)}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs">
                      <div className="font-medium text-blue-900">Only in award</div>
                      <div className="text-slate-500">customer added — likely a mod</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {matchCount > 0 && (
            <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-600">
              <span className="text-emerald-700">✓ {matchCount} more line{matchCount === 1 ? "" : "s"}</span>{" "}
              matched perfectly — nothing to review there.
            </div>
          )}
        </section>

        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Run this on your own docs</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Sign up takes 30 seconds. Drop in your quote and award PDFs — the comparison
            runs automatically.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center gap-1 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Get started
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function FileChip({
  name,
  lines,
  total,
  label,
}: {
  name: string;
  lines: number;
  total: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <DocumentTextIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <span className="truncate text-sm font-medium text-slate-900">{name}</span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {lines} lines · {fmtMoney(total)}
        </span>
      </div>
    </div>
  );
}
