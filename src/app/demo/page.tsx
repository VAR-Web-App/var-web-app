"use client";

import Link from "next/link";
import { useState } from "react";
import { Deal, DealStage, DEAL_STAGES } from "@/types";
import { ArrowRightIcon } from "@heroicons/react/24/outline";

// Public, auth-free demo of the kanban with realistic seed deals. No CRUD,
// no Firestore — read-only walkthrough for cold-email recipients who
// haven't signed up yet. Cards link to a static demo deal.

const STAGE_STYLES: Record<DealStage, { columnBg: string; topBorder: string; headerColor: string }> = {
  rfq: { columnBg: "bg-blue-50", topBorder: "border-t-4 border-t-blue-400", headerColor: "text-blue-800" },
  vendor_sourcing: { columnBg: "bg-purple-50", topBorder: "border-t-4 border-t-purple-400", headerColor: "text-purple-800" },
  quoted: { columnBg: "bg-yellow-50", topBorder: "border-t-4 border-t-yellow-500", headerColor: "text-yellow-800" },
  awarded: { columnBg: "bg-green-50", topBorder: "border-t-4 border-t-green-500", headerColor: "text-green-800" },
  po_sent: { columnBg: "bg-teal-50", topBorder: "border-t-4 border-t-teal-500", headerColor: "text-teal-800" },
  partially_shipped: { columnBg: "bg-orange-50", topBorder: "border-t-4 border-t-orange-500", headerColor: "text-orange-800" },
  closed_won: { columnBg: "bg-emerald-50", topBorder: "border-t-4 border-t-emerald-500", headerColor: "text-emerald-800" },
  closed_lost: { columnBg: "bg-red-50", topBorder: "border-t-4 border-t-red-400", headerColor: "text-red-800" },
};

const DEMO_DEALS: Pick<Deal, "id" | "name" | "stage" | "account_name" | "solicitation_number" | "total_quote_value">[] = [
  { id: "demo_dsa_video",    name: "DSA — Video endpoint refresh",            stage: "rfq",                account_name: "Department of Sample Administration", solicitation_number: "DSA-26-Q-0061", total_quote_value: 0 },
  { id: "demo_ftc_router",   name: "FTC HQ — Edge router replacement",        stage: "vendor_sourcing",    account_name: "Federal Trade Commission",            solicitation_number: "FTC-26-Q-0084", total_quote_value: 0 },
  { id: "demo_va_wifi",      name: "VA Field — Wi-Fi 6 expansion (3 sites)",  stage: "quoted",             account_name: "Veterans Affairs Field Office",       solicitation_number: "VA-26-Q-3318",  total_quote_value: 128400 },
  { id: "demo_dsa_switch",   name: "DSA — Switch Refresh (Q2)",               stage: "awarded",            account_name: "Department of Sample Administration", solicitation_number: "DSA-26-Q-0019", total_quote_value: 54655.5 },
  { id: "demo_va_tacacs",    name: "VA Field — TACACS+ migration",            stage: "po_sent",            account_name: "Veterans Affairs Field Office",       solicitation_number: "VA-26-Q-2710",  total_quote_value: 38420 },
  { id: "demo_dsa_phones",   name: "DSA — Desk phone refresh (regional)",     stage: "partially_shipped",  account_name: "Department of Sample Administration", solicitation_number: "DSA-26-Q-0014", total_quote_value: 184200 },
  { id: "demo_dsa_ups",      name: "DSA — UPS / power refresh",               stage: "closed_won",         account_name: "Department of Sample Administration", solicitation_number: "DSA-25-Q-9912", total_quote_value: 22340 },
  { id: "demo_ftc_smartnet", name: "FTC — Smartnet renewal RFQ",              stage: "closed_lost",        account_name: "Federal Trade Commission",            solicitation_number: "FTC-26-Q-0009", total_quote_value: 8400 },
];

export default function DemoPage() {
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [deals, setDeals] = useState(DEMO_DEALS);

  function handleDrop(stage: DealStage) {
    if (!draggedDeal) return;
    setDeals((prev) => prev.map((d) => (d.id === draggedDeal ? { ...d, stage } : d)));
    setDraggedDeal(null);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Demo banner */}
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3 text-sm">
          <span className="text-amber-900">
            <span className="font-semibold">Demo mode</span> — read-only kanban with sample data.
            Try dragging a card.
          </span>
          <Link
            href="/login"
            className="inline-flex items-center gap-1 rounded-md bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
          >
            Create your own pipeline
            <ArrowRightIcon className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            V
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">VAR Web App</span>
        </div>

        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Deal Pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            8 sample deals across all stages. Drag a card between columns, or click one to see
            the parsed BOM + award comparison inside.
          </p>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-4">
          {DEAL_STAGES.map((stage) => {
            const style = STAGE_STYLES[stage.key];
            const stageDeals = deals.filter((d) => d.stage === stage.key);
            return (
              <div
                key={stage.key}
                className={`w-64 flex-shrink-0 rounded-xl p-3 ${style.columnBg} ${style.topBorder}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(stage.key)}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className={`text-xs font-bold uppercase tracking-wide ${style.headerColor}`}>
                    {stage.label}
                  </h3>
                  <span className={`rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold ${style.headerColor}`}>
                    {stageDeals.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {stageDeals.map((deal) => (
                    <Link
                      key={deal.id}
                      href="/demo/sample"
                      draggable
                      onDragStart={() => setDraggedDeal(deal.id)}
                      className={`block cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-blue-300 hover:shadow active:cursor-grabbing ${
                        draggedDeal === deal.id ? "opacity-50" : ""
                      }`}
                    >
                      <p className="truncate text-sm font-medium text-slate-900">{deal.name}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{deal.account_name}</p>
                      {deal.total_quote_value > 0 && (
                        <p className="mt-1.5 text-xs font-semibold text-emerald-700">
                          ${deal.total_quote_value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </p>
                      )}
                      {deal.solicitation_number && (
                        <p className="mt-1 font-mono text-[10px] text-slate-400">
                          {deal.solicitation_number}
                        </p>
                      )}
                    </Link>
                  ))}
                  {stageDeals.length === 0 && (
                    <p className="py-8 text-center text-xs text-slate-400">No deals</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Run this on your real docs</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Sign up takes 30 seconds. Drop in your own award PDF and a distributor quote — the
            parser pulls the line items, the comparison flags discrepancies.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex items-center gap-1 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Get started — try with your docs
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
