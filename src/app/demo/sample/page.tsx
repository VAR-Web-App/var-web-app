"use client";

import Link from "next/link";
import {
  ChevronLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  ArrowRightIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import { compareBoms } from "@/lib/compare";
import type { BomLine } from "@/lib/parsers";

// Public read-only deal detail. Mirrors the shape of the authenticated
// /deals/[id] page but with hardcoded parsed BOM data so cold-email
// recipients can see the full workflow — kanban → deal detail → parsed
// docs → BOM/quote comparison — without having to sign up first.
//
// The BOMs below match the synthetic-quote.pdf + synthetic-award.pdf in
// public/samples/, so the rendered comparison is exactly what a real
// authenticated user would see if they uploaded those files.

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

const QUOTE_TOTAL = QUOTE_BOM.reduce((s, l) => s + l.extended_price, 0);
const AWARD_TOTAL = AWARD_BOM.reduce((s, l) => s + l.extended_price, 0);

export default function DemoSampleDealPage() {
  const comparison = compareBoms(QUOTE_BOM, AWARD_BOM);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Demo banner */}
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3 text-sm">
          <span className="text-amber-900">
            <span className="font-semibold">Demo deal</span> — read-only walkthrough.
            Sign up to drop in your own docs.
          </span>
          <Link
            href="/login"
            className="inline-flex items-center gap-1 rounded-md bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
          >
            Get started
            <ArrowRightIcon className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
            V
          </div>
          <span className="text-base font-bold tracking-tight text-slate-900">VAR Web App</span>
        </div>

        <Link
          href="/demo"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Pipeline
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              DSA — Switch Refresh (Q2)
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Department of Sample Administration · Cisco · Quotation
            </p>
          </div>
          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
            Awarded
          </span>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <AttachmentsCard />
            <ComparisonCard comparison={comparison} />
            <PlaceholderCard
              title="Vendor PO"
              body="Once the comparison is reconciled, the vendor PO is generated per manufacturer with the awarded line items, ship-to, and notes auto-filled. Coming soon."
            />
          </div>

          <div className="space-y-6">
            <MetadataCard />
            <NotesCard />
          </div>
        </div>

        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Drop in your own award and quote</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Sign up takes 30 seconds. The parser handles your distributor quotes (ScanSource,
            Tech Data, more coming) and federal awards. Comparison is automatic.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center gap-1 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Get started — create your first deal
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function MetadataCard() {
  const items: Array<[string, React.ReactNode]> = [
    ["Account", "Department of Sample Administration"],
    ["Manufacturer", "Cisco"],
    ["Distributor", "ScanSource Federal"],
    ["Solicitation #", "DSA-26-Q-0019"],
    ["Customer PO #", "DSA-26-P-0042"],
    ["Lead Time", "8-10 weeks"],
    ["Awarded", "May 1, 2026"],
    ["Quote Total", fmtMoney(QUOTE_TOTAL)],
    ["Award Total", fmtMoney(AWARD_TOTAL)],
    ["Margin", "24.6%"],
  ];
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Deal Details</h2>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 p-6 text-sm">
        {items.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[120px_1fr] items-baseline gap-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="text-slate-900">{value}</dd>
          </div>
        ))}
        <div className="grid grid-cols-[120px_1fr] items-baseline gap-3">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Ship-To</dt>
          <dd className="whitespace-pre-line text-slate-900">
            Acme Federal Solutions, attn: Receiving Dock B{"\n"}
            1500 Sample Plaza Drive, Suite 200{"\n"}
            Springfield, VA 22150
          </dd>
        </div>
      </dl>
    </section>
  );
}

function NotesCard() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Notes</h2>
      </div>
      <div className="p-6 text-sm">
        <p className="whitespace-pre-line text-slate-700">
          Customer expanded AP qty 10 → 12 mid-week. Verified before award.
          {"\n\n"}Smartcare service line and install labor were added at award —
          ~$17.7K incremental on top of the original quote.
        </p>
      </div>
    </section>
  );
}

function AttachmentsCard() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Attachments &amp; parsed docs</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Drop a PDF in any category; the parser auto-runs on upload and the structured data
          flows into the deal.
        </p>
      </div>
      <div className="space-y-4 p-6">
        <DemoCategory
          label="Customer Quote"
          file={{
            name: "synthetic-quote.pdf",
            size: 3.3,
            lines: QUOTE_BOM.length,
            total: QUOTE_TOTAL,
          }}
        />
        <DemoCategory
          label="Award Document"
          file={{
            name: "synthetic-award.pdf",
            size: 3.6,
            lines: AWARD_BOM.length,
            total: AWARD_TOTAL,
          }}
        />
        <EmptyCategory label="Vendor POs" />
        <EmptyCategory label="Shipping / Tracking" />
      </div>
    </section>
  );
}

function DemoCategory({
  label,
  file,
}: {
  label: string;
  file: { name: string; size: number; lines: number; total: number };
}) {
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</h3>
        <span className="text-xs italic text-slate-400">+ Upload (sign up to enable)</span>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <DocumentTextIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
              <p className="text-[11px] text-slate-500">
                {file.size.toFixed(1)} KB · uploaded today
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            <CheckCircleIcon className="h-3.5 w-3.5" />
            {file.lines} lines · {fmtMoney(file.total)}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyCategory({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</h3>
      </div>
      <p className="px-4 py-3 text-xs italic text-slate-400">No {label.toLowerCase()}.</p>
    </div>
  );
}

function ComparisonCard({ comparison }: { comparison: ReturnType<typeof compareBoms> }) {
  const issueRows = comparison.matched.filter((r) => r.diff !== "match");
  const matchCount = comparison.matched.length - issueRows.length;
  const totalIssues =
    issueRows.length + comparison.only_in_quote.length + comparison.only_in_award.length;
  const deltaColor =
    comparison.totals.delta > 0.01 ? "text-emerald-700" : "text-red-700";

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-amber-200 bg-amber-50 px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 text-amber-600" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {totalIssues} discrepanc{totalIssues === 1 ? "y" : "ies"}
              </h2>
              <p className="text-xs text-slate-700">
                {matchCount} matched · {issueRows.length} with issues ·{" "}
                {comparison.only_in_quote.length} only in quote ·{" "}
                {comparison.only_in_award.length} only in award
              </p>
            </div>
          </div>
          <div className="text-right text-xs">
            <span className="text-slate-500">Quote </span>
            <span className="font-semibold text-slate-900">{fmtMoney(comparison.totals.quote_extended)}</span>
            <span className="text-slate-400"> → </span>
            <span className="font-semibold text-slate-900">{fmtMoney(comparison.totals.award_extended)}</span>
            <span className={`ml-2 font-semibold ${deltaColor}`}>
              ({fmtDelta(comparison.totals.delta)})
            </span>
          </div>
        </div>
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
                <tr key={i} className="bg-amber-50/30">
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
                    <div className="font-medium text-amber-900">{labels.join(" + ")}</div>
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
              <tr key={`q${i}`} className="bg-amber-50/30">
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
                  <div className="font-medium text-amber-900">Only in quote</div>
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
  );
}

function PlaceholderCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 shadow-sm">
      <div className="flex items-start gap-3">
        <ArrowUpTrayIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{body}</p>
        </div>
      </div>
    </section>
  );
}
