"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import NewDealModal from "@/components/new-deal-modal";
import Tooltip from "@/components/tooltip";
import { Deal, DealStage } from "@/types";
import { BUILDER_STAGES } from "@/types/builder";
import { listDeals, saveDeal, seedBuilderDemoData, resetAndSeedBuilderDemo } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";

const STAGE_STYLES: Record<DealStage, { columnBg: string; topBorder: string; headerColor: string }> = {
  rfq: { columnBg: "bg-blue-50", topBorder: "border-t-4 border-t-blue-400", headerColor: "text-blue-800" },
  vendor_sourcing: { columnBg: "bg-sky-50", topBorder: "border-t-4 border-t-sky-400", headerColor: "text-sky-800" },
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
      await seedBuilderDemoData(profile.org_ref);
      await refresh();
    } finally {
      setSeeding(false);
    }
  }

  async function onResetAndSeed() {
    if (!profile || seeding) return;
    if (!confirm(
      "Replace all existing pipeline data (clients, subs, projects, milestones, photos, RFQs) with the builder sample fixtures?\n\nThis cannot be undone."
    )) return;
    setSeeding(true);
    try {
      await resetAndSeedBuilderDemo(profile.org_ref);
      // Clear sessionStorage parsed-BOM cache too — stale references.
      try {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const k = sessionStorage.key(i);
          if (k && (k.startsWith("parsed:") || k.startsWith("chat:"))) {
            sessionStorage.removeItem(k);
          }
        }
      } catch {
        // ignore
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
        <div className="flex items-center gap-2">
          {loaded && deals.length > 0 && (
            <Tooltip label="Wipe all your projects, clients, subs, milestones, and photos — then reload a fresh set of demo fixtures. Useful for resetting a sales demo.">
              <button
                onClick={onResetAndSeed}
                disabled={seeding}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                {seeding ? "Resetting…" : "Reset to demo data"}
              </button>
            </Tooltip>
          )}
          <Tooltip
            variant="directive"
            label="Start a new project. Capture the client + scope basics — you can add the floor plan and estimate from inside the project."
            placement="left"
          >
            <button
              onClick={() => setShowNewDeal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-800"
            >
              <PlusIcon className="h-4 w-4" />
              New Project
            </button>
          </Tooltip>
        </div>
      </div>

      {loaded && deals.length === 0 && (
        <EmptyPipeline
          onNew={() => setShowNewDeal(true)}
          onSeedDemo={onSeedDemo}
          seeding={seeding}
        />
      )}

      <div
        className="flex gap-3 overflow-x-auto pb-4"
        style={{ minHeight: "calc(100vh - 180px)" }}
      >
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
                {stageDeals.map((deal) => {
                  // Stage drives label: pre-contract = "estimate", post-contract = "contract"
                  const isPostContract = ["awarded", "po_sent", "partially_shipped", "closed_won"].includes(deal.stage);
                  const valueShown = isPostContract && deal.award_total > 0
                    ? deal.award_total
                    : deal.total_quote_value;
                  const valueLabel = isPostContract ? "Contract" : "Estimate";
                  return (
                    <Link
                      key={deal.id}
                      href={`/deals/${deal.id}`}
                      draggable
                      onDragStart={() => setDraggedDeal(deal.id)}
                      className={`block cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-sky-300 hover:shadow active:cursor-grabbing ${
                        draggedDeal === deal.id ? "opacity-50" : ""
                      }`}
                    >
                      <p className="truncate text-sm font-medium text-slate-900">{deal.name}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{deal.account_name}</p>
                      {valueShown > 0 && (
                        <p className="mt-1.5 text-xs font-semibold text-emerald-700">
                          {valueLabel}: ${valueShown.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </p>
                      )}
                      {deal.manufacturer && deal.manufacturer !== "Cisco" && (
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                          {deal.manufacturer}
                        </p>
                      )}
                      {deal.solicitation_number && (
                        <p className="mt-1 font-mono text-[10px] text-slate-400">
                          Job #{deal.solicitation_number}
                        </p>
                      )}
                    </Link>
                  );
                })}
                {stageDeals.length === 0 && loaded && (
                  <p className="py-8 text-center text-xs text-slate-400">No projects</p>
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
          className="rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800"
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
