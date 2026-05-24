"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChartBarIcon,
  ChevronLeftIcon,
  CurrencyDollarIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  HomeIcon,
  PaperAirplaneIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import Tooltip from "@/components/tooltip";
import { deleteDeal, saveDeal } from "@/lib/store";
import type { Deal } from "@/types";
import { BUILDER_STAGES } from "@/types/builder";

export type DealTabKey = "overview" | "schedule" | "finances" | "files";

const TABS: Array<{
  key: DealTabKey;
  label: string;
  href: (id: string) => string;
  icon: typeof HomeIcon;
}> = [
  { key: "overview", label: "Overview", href: (id) => `/deals/${id}`, icon: HomeIcon },
  { key: "schedule", label: "Schedule", href: (id) => `/deals/${id}/schedule`, icon: ChartBarIcon },
  { key: "finances", label: "Finances", href: (id) => `/deals/${id}/finances`, icon: CurrencyDollarIcon },
  { key: "files", label: "Files", href: (id) => `/deals/${id}/files`, icon: DocumentIcon },
];

/**
 * Shared chrome for every per-deal sub-route: back link, header,
 * tab nav. Children render under the tab strip in the main column.
 * The per-deal sidebar (project details + AI + notes) lives only on
 * the Overview tab so the deeper pages can use the full width.
 */
export default function DealPageShell({
  deal,
  active,
  children,
}: {
  deal: Deal;
  active: DealTabKey;
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6 lg:p-8">
        <div>
          <Link
            href="/deals"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Pipeline
          </Link>
        </div>

        <DealHeader deal={deal} />

        <DealTabNav dealId={deal.id} active={active} />

        {children}
      </div>
    </AppShell>
  );
}

function DealHeader({ deal }: { deal: Deal }) {
  const router = useRouter();
  async function onChangeStage(s: Deal["stage"]) {
    const next = { ...deal, stage: s, updated_at: new Date().toISOString() };
    await saveDeal(next);
    router.refresh();
  }
  async function onDelete() {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await deleteDeal(deal.id);
    router.replace("/deals");
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{deal.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {deal.account_name || "No client"} · {deal.manufacturer || "—"} ·{" "}
          {deal.deal_type === "quotation" ? "Detailed Estimate" : "Ballpark / Budget"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Tooltip
          variant="directive"
          label="Build the document your client signs."
        >
          <Link
            href={`/deals/${deal.id}/proposal`}
            className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            Proposal
          </Link>
        </Tooltip>
        <Tooltip label="Preview the client portal exactly as your client will see it — no login required on their end.">
          <Link
            href={`/deals/${deal.id}/portal`}
            className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100"
          >
            <EyeIcon className="h-4 w-4" />
            View as client
          </Link>
        </Tooltip>
        <Tooltip label="Move the project through your pipeline.">
          <select
            value={deal.stage}
            onChange={(e) => void onChangeStage(e.target.value as Deal["stage"])}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {BUILDER_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Tooltip>
        <Tooltip label="Permanently delete this project and all attached docs, photos, and history. Cannot be undone.">
          <button
            onClick={() => void onDelete()}
            className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function DealTabNav({
  dealId,
  active,
}: {
  dealId: string;
  active: DealTabKey;
}) {
  return (
    <nav
      aria-label="Project sections"
      className="-mx-1 flex flex-wrap gap-1 border-b border-slate-200"
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href(dealId)}
            className={
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
              (isActive
                ? "border-sky-600 text-sky-700"
                : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900")
            }
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
      <Link
        href={`/deals/${dealId}/quote`}
        className="ml-auto inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
      >
        Quote editor →
      </Link>
    </nav>
  );
}

export function DealLoadingShell() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">
          Loading project…
        </div>
      </div>
    </AppShell>
  );
}

export function DealNotFoundShell() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-12 text-center text-sm text-amber-900 shadow-sm">
          <ExclamationTriangleIcon className="mx-auto mb-3 h-6 w-6 text-amber-500" />
          Project not found, or it belongs to a different organization.
          <div className="mt-4">
            <Link
              href="/deals"
              className="inline-flex items-center gap-1 text-sky-700 hover:underline"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Back to pipeline
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
