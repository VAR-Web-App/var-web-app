"use client";

import { use, useEffect, useState } from "react";
import NextActionCard from "@/components/next-action-card";
import ProjectAIChat from "@/components/project-ai-chat";
import DealPageShell, {
  DealLoadingShell,
  DealNotFoundShell,
} from "@/components/deal-page-shell";
import { useDeal } from "@/lib/use-deal";
import { getClientSignLink, markSignLinkSynced } from "@/lib/store";
import type { Deal } from "@/types";
import { BUILDER_STAGES } from "@/types/builder";

export default function DealOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { deal, loaded, updateDeal } = useDeal(id);

  // Auto-advance the stage Estimate Sent → Contract Signed when a client
  // signs the proposal via the public sign link. Runs once on each visit
  // to the Overview, closing the loop without any GC action.
  useEffect(() => {
    if (!deal || deal.stage !== "quoted" || !deal.client_sign_token) return;
    let active = true;
    void (async () => {
      try {
        const link = await getClientSignLink(deal.client_sign_token!);
        if (!active) return;
        if (
          !link ||
          !link.signed_at ||
          !link.signed_by_name ||
          link.synced_to_deal
        )
          return;
        const signedDate = new Date(link.signed_at).toLocaleDateString();
        await updateDeal({
          stage: "awarded",
          award_total: deal.total_quote_value || deal.award_total,
          award_date: link.signed_at,
          notes: deal.notes
            ? `${deal.notes}\n\nAccepted by ${link.signed_by_name} on ${signedDate} via portal sign link.`
            : `Accepted by ${link.signed_by_name} on ${signedDate} via portal sign link.`,
        });
        await markSignLinkSynced(deal.client_sign_token!);
      } catch (e) {
        console.warn("[overview] sign-link sync failed", e);
      }
    })();
    return () => {
      active = false;
    };
  }, [deal, updateDeal]);

  if (!loaded) return <DealLoadingShell />;
  if (!deal) return <DealNotFoundShell />;

  const stage = BUILDER_STAGES.find((s) => s.key === deal.stage);

  return (
    <DealPageShell deal={deal} active="overview">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <NextActionCard deal={deal} />
          <ProjectAIChat deal={deal} />
        </div>
        <div className="space-y-6">
          <DealMetadataCard deal={deal} stageColor={stage?.color ?? ""} />
          <NotesCard
            deal={deal}
            onUpdate={(notes) => void updateDeal({ notes })}
          />
        </div>
      </div>
    </DealPageShell>
  );
}

function DealMetadataCard({
  deal,
  stageColor,
}: {
  deal: Deal;
  stageColor: string;
}) {
  const fmtMoney = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString() : "—");
  const stage = BUILDER_STAGES.find((x) => x.key === deal.stage);

  const items: Array<[string, React.ReactNode]> = [
    [
      "Stage",
      <span
        key="s"
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stageColor}`}
      >
        {stage?.label}
      </span>,
    ],
    ["Client", deal.account_name || "—"],
    ["Project Type", deal.manufacturer || "—"],
    ["Lead Contractor", deal.distributor_name || "—"],
    ["Job #", deal.solicitation_number || "—"],
    ["Contract / PO #", deal.customer_po || "—"],
    ["Schedule", deal.lead_time || "—"],
    ["Target Start", fmtDate(deal.due_date)],
    ["Contract Signed", fmtDate(deal.award_date)],
    [
      "Estimate Total",
      deal.total_quote_value ? fmtMoney(deal.total_quote_value) : "—",
    ],
    ["Contract Total", deal.award_total ? fmtMoney(deal.award_total) : "—"],
    [
      "Margin",
      deal.margin_percent ? `${deal.margin_percent.toFixed(1)}%` : "—",
    ],
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Project Details
        </h2>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 p-4 text-sm sm:p-6">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[120px_1fr] items-baseline gap-3"
          >
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              {label}
            </dt>
            <dd className="text-slate-900">{value}</dd>
          </div>
        ))}
        {deal.ship_to_address && (
          <div className="grid grid-cols-[120px_1fr] items-baseline gap-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Project Address
            </dt>
            <dd className="whitespace-pre-line text-slate-900">
              {deal.ship_to_address}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function NotesCard({
  deal,
  onUpdate,
}: {
  deal: Deal;
  onUpdate: (notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(deal.notes);
  useEffect(() => setDraft(deal.notes), [deal.notes]);
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-sm font-semibold text-slate-900">Notes</h2>
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setDraft(deal.notes);
                setEditing(false);
              }}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onUpdate(draft);
                setEditing(false);
              }}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Edit
          </button>
        )}
      </div>
      <div className="p-4 text-sm sm:p-6">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="block min-h-[100px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <p className="whitespace-pre-line text-slate-700">
            {deal.notes || (
              <span className="italic text-slate-400">No notes yet.</span>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
