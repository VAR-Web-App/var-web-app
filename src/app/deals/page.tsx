"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusIcon, ArrowPathIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
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
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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

  async function confirmResetAndSeed() {
    if (!profile || seeding) return;
    setShowResetConfirm(false);
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
            <Tooltip label="Wipe everything in your pipeline (projects, clients, subs, milestones, photos, RFQs) and reload the sample fixtures. Use it to reset a demo — NOT on real data.">
              <button
                onClick={() => setShowResetConfirm(true)}
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

      {showResetConfirm && (
        <ResetConfirmModal
          dealCount={deals.length}
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={() => void confirmResetAndSeed()}
        />
      )}
    </AppShell>
  );
}

function ResetConfirmModal({
  dealCount,
  onCancel,
  onConfirm,
}: {
  dealCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const armed = typed.trim().toUpperCase() === "RESET";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Reset to demo data?</h2>
              <p className="mt-0.5 text-xs text-slate-500">This cannot be undone.</p>
            </div>
          </div>
          <button onClick={onCancel} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-6 py-5 text-sm text-slate-700">
          <p>
            This will permanently delete <strong>everything</strong> in your account and replace
            it with the demo fixtures:
          </p>
          <ul className="space-y-1 rounded-md bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <li>• {dealCount} project{dealCount === 1 ? "" : "s"} + all milestones, draws, change orders, photos, RFQs</li>
            <li>• All clients, contacts, subs &amp; suppliers</li>
            <li>• All attachments and parsed floor-plan data</li>
          </ul>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            <strong>Only use this on a demo account.</strong> If you have real client work in here,
            cancel.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Type <span className="font-mono font-bold text-red-700">RESET</span> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm uppercase tracking-wider focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!armed}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Yes, wipe and reset
          </button>
        </div>
      </div>
    </div>
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
