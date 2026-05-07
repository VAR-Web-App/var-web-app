"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  ChevronLeftIcon,
} from "@heroicons/react/24/outline";

// Public, read-only demo of the document parser's output. Mirrors what
// /documents looks like after a parse completes: PDF on the left, parsed
// BOM + metadata on the right. No upload, no streaming, no auth — just
// the populated result for cold-email recipients to see.

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PARSED_BOM = [
  { item_number: "1", part_number: "FAKE-SW-9300",     description: "Catalyst Sample Switch 24-port",       qty: 4,  unit_price: 5234.50, extended_price: 20938.00 },
  { item_number: "2", part_number: "FAKE-SFP-10G",     description: "10G SFP+ Optical Transceiver",         qty: 16, unit_price: 287.25,  extended_price: 4596.00  },
  { item_number: "3", part_number: "FAKE-AP-9120",     description: "Wi-Fi 6 Access Point Indoor",          qty: 12, unit_price: 1245.00, extended_price: 14940.00 },
  { item_number: "4", part_number: "FAKE-CABLE-3M",    description: "3m Patch Cable Cat6A Blue",            qty: 50, unit_price: 24.99,   extended_price: 1249.50  },
  { item_number: "5", part_number: "FAKE-PWR-AC",      description: "AC Power Supply 1100W",                qty: 4,  unit_price: 895.00,  extended_price: 3580.00  },
  { item_number: "6", part_number: "FAKE-LIC-DNA",     description: "DNA Subscription License (1yr)",       qty: 4,  unit_price: 2100.00, extended_price: 8400.00  },
  { item_number: "7", part_number: "FAKE-CON-3YR",     description: "Smartcare Service 3yr (per device)",   qty: 32, unit_price: 446.42,  extended_price: 14285.45 },
  { item_number: "8", part_number: "FAKE-INSTALL-LBR", description: "Onsite Installation Labor",            qty: 1,  unit_price: 3500.00, extended_price: 3500.00  },
];

const TOTAL = PARSED_BOM.reduce((s, l) => s + l.extended_price, 0);

const METADATA: Array<[string, string]> = [
  ["Document #", "DSA-26-P-0042"],
  ["Document Date", "2026-04-21"],
  ["Total", fmtMoney(TOTAL)],
  ["Buyer / Agency", "Department of Sample Administration"],
  ["Period of Performance", "2026-05-01 → 2027-04-30"],
  ["Ship-to Contact", "Jordan Sample"],
  ["Ship-to Email", "jsample@dsa.gov"],
  ["Contracting Officer", "Robin Example"],
  ["CO Email", "rexample@dsa.gov"],
];

const SHIP_TO_ADDRESS =
  "Acme Federal Solutions, attn: Receiving Dock B\n1500 Sample Plaza Drive, Suite 200\nSpringfield, VA 22150";

export default function DemoDocumentsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-sky-200 bg-sky-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3 text-sm">
          <span className="text-sky-900">
            <span className="font-semibold">Demo</span> — read-only output of the document parser. Drop your own PDF inside the live app.
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

      <div className="mx-auto max-w-7xl px-6 py-8">
        <DemoNav active="documents" />

        <Link
          href="/demo"
          className="mt-6 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Pipeline
        </Link>

        <div className="mt-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Documents</h1>
          <p className="mt-1 text-sm text-slate-500">
            Drop a federal award, distributor quote, or vendor PO. The parser pulls a
            structured BOM and the document-level metadata. Below is what you&apos;d see
            after parsing a real federal award PDF.
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Left: PDF preview */}
          <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
            <div className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <DocumentTextIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  <span className="truncate text-xs font-medium text-slate-700">synthetic-award.pdf</span>
                </div>
                <span className="text-[11px] uppercase tracking-wide text-slate-400">Source</span>
              </div>
              <iframe
                src="/samples/synthetic-award.pdf"
                title="Source PDF"
                className="h-full w-full flex-1 bg-slate-50"
              />
            </div>
          </aside>

          {/* Right: parsed result */}
          <div className="min-w-0 space-y-6">
            <ResultBanner />
            <Metadata />
            <BomTable />
          </div>
        </div>

        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Parse your own docs</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Sign up to drop in real distributor quotes, vendor POs, or award PDFs.
            ~30 seconds per doc.
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

function ResultBanner() {
  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex items-center gap-3">
          <CheckCircleIcon className="h-7 w-7 flex-shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Parsed successfully</h2>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-700">Federal Award (Generic Section-B)</span>
              {" · "}2 pages · 8 lines
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">Line total</div>
          <div className="text-xl font-semibold tabular-nums text-slate-900">
            {fmtMoney(TOTAL)}
          </div>
          <div className="text-xs text-emerald-700">doc says {fmtMoney(TOTAL)} ✓</div>
        </div>
      </div>
    </section>
  );
}

function Metadata() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Metadata</h2>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-6 sm:grid-cols-2">
        {METADATA.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-900">{value}</dd>
          </div>
        ))}
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Ship-to</dt>
          <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-900">{SHIP_TO_ADDRESS}</dd>
        </div>
      </dl>
    </section>
  );
}

function BomTable() {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Bill of Materials</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Item</th>
              <th className="px-4 py-3 text-left">Part #</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit Price</th>
              <th className="px-4 py-3 text-right">Extended</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {PARSED_BOM.map((line, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900">{line.item_number}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{line.part_number}</td>
                <td className="px-4 py-3 text-slate-700">{line.description}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">{line.qty}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {fmtMoney(line.unit_price)}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                  {fmtMoney(line.extended_price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Lightweight cross-demo nav so the screen-share can hop between sections
// without typing URLs.
export function DemoNav({ active }: { active: "pipeline" | "deal" | "documents" | "compare" }) {
  const items: Array<{ key: typeof active; label: string; href: string }> = [
    { key: "pipeline", label: "Pipeline", href: "/demo" },
    { key: "deal", label: "Deal Detail", href: "/demo/sample" },
    { key: "documents", label: "Documents", href: "/demo/documents" },
    { key: "compare", label: "Compare", href: "/demo/compare" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
          V
        </div>
        <span className="text-base font-bold tracking-tight text-slate-900">VAR Web App</span>
      </div>
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              it.key === active
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {it.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
