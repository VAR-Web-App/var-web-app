"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusIcon } from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import NewDealModal from "@/components/new-deal-modal";
import { Deal, DealStage } from "@/types";
import { BUILDER_STAGES } from "@/types/builder";
import { listDeals, saveDeal, seedDemoData } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";

const STAGE_STYLES: Record<DealStage, { columnBg: string; topBorder: string; headerColor: string }> = {
  rfq: { columnBg: "bg-blue-50", topBorder: "border-t-4 border-t-blue-400", headerColor: "text-blue-800" },
  vendor_sourcing: { columnBg: "bg-amber-50", topBorder: "border-t-4 border-t-amber-400", headerColor: "text-amber-800" },
  quoted: { columnBg: "bg-yellow-50", topBorder: "border-t-4 border-t-yellow-500", headerColor: "text-yellow-800" },
  awarded: { columnBg: "bg-green-50", topBorder: "border-t-4 border-t-green-500", headerColor: "text-green-800" },
  po_sent: { columnBg: "bg-teal-50", topBorder: "border-t-4 border-t-teal-500", headerColor: "text-teal-800" },
  partially_shipped: { columnBg: "bg-orange-50", topBorder: "border-t-4 border-t-orange-500", headerColor: "text-orange-800" },
  closed_won: { columnBg: "bg-emerald-50", topBorder: "border-t-4 border-t-emerald-500", headerColor: "text-emerald-800" },
  closed_lost: { columnBg: "bg-red-50", topBorder: "border-t-4 border-t-red-400", headerColor: "text-red-800" },
};

export default function DealsPage() {
  const { profile } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    listDeals(profile.org_ref).then((d) => {
      if (active) {
        setDeals(d);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, [profile]);

  async function refresh() {
    if (!profile) return;
    setDeals(await listDeals(profile.org_ref));
  }

  async function onSeedDemo() {
    if (!profile || seeding) return;
    setSeeding(true);
    try {
      const { parsedCacheByDeal } = await seedDemoData(profile.org_ref);
      // Pre-populate sessionStorage so the deal detail page shows the
      // parsed BOM + comparison instantly (no 30-60s parser wait during
      // the live demo).
      try {
        for (const [dealId, cache] of Object.entries(parsedCacheByDeal)) {
          sessionStorage.setItem(`parsed:${dealId}`, JSON.stringify(cache));
        }
      } catch {
        // ignore quota errors
      }
      await refresh();
    } finally {
      setSeeding(false);
    }
  }

  async function handleDrop(stage: DealStage) {
    if (!draggedDeal) return;
    const deal = deals.find((d) => d.id === draggedDeal);
    if (deal && deal.stage !== stage) {
      const updated = { ...deal, stage, updated_at: new Date().toISOString() };
      // Optimistic update so the card moves immediately.
      setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      await saveDeal(updated);
    }
    setDraggedDeal(null);
  }

  const dealsByStage = (stage: DealStage) => deals.filter((d) => d.stage === stage);

  return (
    <AppShell>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Project Pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loaded
              ? `${deals.length} project${deals.length === 1 ? "" : "s"} · drag cards between columns to update stage`
              : "Loading…"}
          </p>
        </div>
        <button
          onClick={() => setShowNewDeal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
        >
          <PlusIcon className="h-4 w-4" />
          New Project
        </button>
      </div>

      {loaded && deals.length === 0 && (
        <EmptyPipeline
          onNew={() => setShowNewDeal(true)}
          onSeedDemo={onSeedDemo}
          seeding={seeding}
        />
      )}

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 180px)" }}>
        {BUILDER_STAGES.map((stage) => {
          const style = STAGE_STYLES[stage.key];
          const stageDeals = dealsByStage(stage.key);
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
                    href={`/deals/${deal.id}`}
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
                {stageDeals.length === 0 && loaded && (
                  <p className="py-8 text-center text-xs text-slate-400">No deals</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showNewDeal && (
        <NewDealModal
          onClose={() => setShowNewDeal(false)}
          onCreated={() => {
            setShowNewDeal(false);
            void refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function EmptyPipeline({
  onNew,
  onSeedDemo,
  seeding,
}: {
  onNew: () => void;
  onSeedDemo: () => void;
  seeding: boolean;
}) {
  return (
    <div className="mb-6 rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-base font-semibold text-slate-900">No projects yet</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Add your first project manually, or load sample data to see the workflow
        populated end-to-end.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onNew}
          className="rounded-md bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Add your first project
        </button>
        <button
          onClick={onSeedDemo}
          disabled={seeding}
          className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {seeding ? "Loading sample data…" : "Try with sample data"}
        </button>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Sample data populates a few projects across stages so you can preview the workflow.
      </p>
    </div>
  );
}
