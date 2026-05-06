"use client";

// Client-facing portal preview. Builder sees the homeowner's view of
// the project — read-only, simplified, no admin chrome. Same data as
// the project detail page (milestones, photos, draws, contract value)
// rearranged for a non-technical audience.
//
// In production this would live at a unique client-token URL with no
// authentication required (the homeowner just clicks the link from
// their welcome email). For the demo it sits inside the authed app
// behind the "View as client" button — same renderer either way.

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  CurrencyDollarIcon,
  HomeIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Deal } from "@/types";
import {
  ProjectMilestone,
  ProjectPhoto,
  PROJECT_PHASES,
  ProjectPhase,
  BUILDER_STAGE_LABELS,
} from "@/types/builder";
import { getDeal, listMilestones, listPhotos } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function ClientPortalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [photos, setPhotos] = useState<ProjectPhoto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [photoFilter, setPhotoFilter] = useState<"all" | ProjectPhase>("all");
  const [lightbox, setLightbox] = useState<ProjectPhoto | null>(null);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    async function load() {
      const d = await getDeal(id);
      if (!active) return;
      if (!d || d.org_ref !== profile!.org_ref) {
        router.replace("/deals");
        return;
      }
      const [m, p] = await Promise.all([
        listMilestones(id),
        listPhotos(id),
      ]);
      if (!active) return;
      setDeal(d);
      setMilestones(m);
      setPhotos(p);
      setLoaded(true);
    }
    void load();
    return () => { active = false; };
  }, [id, router, profile]);

  const summary = useMemo(() => {
    const total = milestones.reduce((s, m) => s + (m.amount || 0), 0);
    const released = milestones
      .filter((m) => m.status === "released")
      .reduce((s, m) => s + (m.released_amount || m.amount), 0);
    const completed = milestones.filter(
      (m) => m.status === "approved" || m.status === "released"
    ).length;
    const percentComplete = milestones.length === 0 ? 0 : Math.round((completed / milestones.length) * 100);
    const inProgress = milestones.find((m) => m.status === "in_progress");
    const awaitingApproval = milestones.find((m) => m.status === "awaiting_approval");
    const next = milestones.find((m) => m.status === "pending");
    return { total, released, completed, percentComplete, inProgress, awaitingApproval, next };
  }, [milestones]);

  const phaseCounts: Record<string, number> = {};
  for (const p of photos) phaseCounts[p.phase] = (phaseCounts[p.phase] || 0) + 1;
  const filteredPhotos = photoFilter === "all" ? photos : photos.filter((p) => p.phase === photoFilter);

  if (!deal || !loaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center text-sm text-slate-500">
          Loading your project…
        </div>
      </div>
    );
  }

  const contractValue = deal.award_total > 0 ? deal.award_total : deal.total_quote_value;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
      {/* GC preview banner — only the builder sees this. In production, the */}
      {/* portal page lives on a public token URL and skips this banner. */}
      <div className="border-b border-amber-200 bg-amber-100/70 px-6 py-2 text-center text-xs text-amber-900">
        <Link href={`/deals/${id}`} className="inline-flex items-center gap-1 font-medium hover:underline">
          <ArrowLeftIcon className="h-3 w-3" />
          Builder preview · back to project
        </Link>
        <span className="mx-2 text-amber-300">·</span>
        Your client sees the page below.
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Hero */}
        <header className="mb-10">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-800">
            <HomeIcon className="h-4 w-4" />
            Your project · {BUILDER_STAGE_LABELS[deal.stage]}
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {deal.name}
          </h1>
          {deal.ship_to_address && (
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
              {deal.ship_to_address}
            </p>
          )}
        </header>

        {/* Progress */}
        <section className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Progress</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {summary.completed} of {milestones.length} milestones complete
              </p>
            </div>
            <div className="text-2xl font-bold tabular-nums text-amber-700">
              {summary.percentComplete}%
            </div>
          </div>

          {/* Big progress bar */}
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
              style={{ width: `${summary.percentComplete}%` }}
            />
          </div>

          {/* Status messages */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {summary.inProgress && (
              <CardCallout
                icon={<ClockIcon className="h-5 w-5 text-amber-600" />}
                label="In progress"
                primary={summary.inProgress.name}
                secondary={summary.inProgress.description}
              />
            )}
            {summary.awaitingApproval && (
              <CardCallout
                icon={<CheckCircleIcon className="h-5 w-5 text-blue-600" />}
                label="Awaiting your review"
                primary={summary.awaitingApproval.name}
                secondary={`${fmtMoney(summary.awaitingApproval.amount)} draw — approve to release payment`}
                accent="blue"
              />
            )}
            {!summary.inProgress && !summary.awaitingApproval && summary.next && (
              <CardCallout
                icon={<ClockIcon className="h-5 w-5 text-slate-400" />}
                label="Up next"
                primary={summary.next.name}
                secondary={summary.next.description}
              />
            )}
          </div>
        </section>

        {/* Milestone list */}
        {milestones.length > 0 && (
          <section className="mt-8 rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
            <h2 className="text-base font-semibold text-slate-900">Build schedule</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Each phase has its own draw — you approve completion to release payment.
            </p>
            <ol className="mt-4 space-y-3">
              {milestones.map((m, i) => (
                <li key={m.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
                  <PhaseDot status={m.status} order={i + 1} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <p className="text-sm font-medium text-slate-900">{m.name}</p>
                      <ClientStatusBadge status={m.status} />
                      <span className="ml-auto text-xs tabular-nums text-slate-600">
                        {fmtMoney(m.amount)}
                      </span>
                    </div>
                    {m.description && (
                      <p className="mt-0.5 text-xs text-slate-500">{m.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Payments */}
        {milestones.length > 0 && (
          <section className="mt-8 grid grid-cols-3 gap-3">
            <PaymentStat label="Contract value" value={fmtMoney(contractValue)} />
            <PaymentStat label="Paid to date" value={fmtMoney(summary.released)} accent />
            <PaymentStat
              label="Remaining"
              value={fmtMoney(Math.max(0, contractValue - summary.released))}
            />
          </section>
        )}

        {/* Photos */}
        <section className="mt-8 rounded-2xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Build photos</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {photos.length} photo{photos.length === 1 ? "" : "s"} as your home comes together
              </p>
            </div>
          </div>

          {photos.length === 0 ? (
            <div className="mt-6 rounded-lg border-2 border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
              <PhotoIcon className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-600">
                Photos will appear here as construction begins.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <ChipFilter
                  label={`All · ${photos.length}`}
                  active={photoFilter === "all"}
                  onClick={() => setPhotoFilter("all")}
                />
                {PROJECT_PHASES.filter((ph) => phaseCounts[ph] > 0).map((ph) => (
                  <ChipFilter
                    key={ph}
                    label={`${ph} · ${phaseCounts[ph]}`}
                    active={photoFilter === ph}
                    onClick={() => setPhotoFilter(ph)}
                  />
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {filteredPhotos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setLightbox(p)}
                    className="group overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption || p.phase}
                      className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="bg-white/90 px-2 py-1.5">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                        {p.phase}
                      </span>
                      {p.caption && (
                        <p className="mt-0.5 truncate text-xs text-slate-600">{p.caption}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-10 rounded-2xl border border-white/60 bg-white/80 p-6 text-center shadow-sm backdrop-blur">
          <p className="text-sm text-slate-700">
            Questions about your build? Contact your builder.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Project ID: {deal.id} · Updated {new Date(deal.updated_at).toLocaleDateString()}
          </p>
        </footer>
      </div>

      {lightbox && <ClientLightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function CardCallout({
  icon,
  label,
  primary,
  secondary,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  accent?: "blue";
}) {
  const ring =
    accent === "blue"
      ? "ring-blue-200 bg-blue-50"
      : "ring-slate-200 bg-white";
  return (
    <div className={`flex items-start gap-3 rounded-lg p-3 ring-1 ${ring}`}>
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </div>
        <div className="text-sm font-medium text-slate-900">{primary}</div>
        {secondary && (
          <p className="mt-0.5 text-xs text-slate-500">{secondary}</p>
        )}
      </div>
    </div>
  );
}

function PaymentStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/80 p-4 text-center shadow-sm backdrop-blur">
      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <CurrencyDollarIcon className="h-3 w-3" />
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${accent ? "text-emerald-700" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function PhaseDot({
  status,
  order,
}: {
  status: ProjectMilestone["status"];
  order: number;
}) {
  const isDone = status === "approved" || status === "released";
  const isActive = status === "in_progress" || status === "awaiting_approval";
  const cls = isDone
    ? "bg-emerald-500 text-white"
    : isActive
    ? "bg-amber-500 text-white"
    : "bg-slate-200 text-slate-500";
  return (
    <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${cls}`}>
      {isDone ? <CheckCircleIcon className="h-4 w-4" /> : order}
    </div>
  );
}

function ClientStatusBadge({ status }: { status: ProjectMilestone["status"] }) {
  // Client-friendly relabeling — "released" reads as "Paid", "approved"
  // is omitted (the dot covers it), "in_progress" stays "In Progress".
  const label = status === "released" ? "Paid" :
                status === "in_progress" ? "In Progress" :
                status === "awaiting_approval" ? "Needs Your Approval" :
                status === "disputed" ? "Disputed" :
                status === "approved" ? "Complete" :
                "";
  if (!label) return null;
  const color =
    status === "released" || status === "approved"
      ? "bg-emerald-100 text-emerald-800"
      : status === "in_progress"
      ? "bg-amber-100 text-amber-800"
      : status === "awaiting_approval"
      ? "bg-blue-100 text-blue-800"
      : "bg-red-100 text-red-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
      {label}
    </span>
  );
}

function ChipFilter({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-amber-600 text-white"
          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function ClientLightbox({ photo, onClose }: { photo: ProjectPhoto; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <XMarkIcon className="h-6 w-6" />
      </button>
      <div className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption || photo.phase}
          className="max-h-[80vh] max-w-full rounded-lg object-contain"
        />
        <div className="mt-3 text-center text-sm text-white">
          <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            {photo.phase}
          </span>
          {photo.caption && <span className="ml-2">{photo.caption}</span>}
        </div>
      </div>
    </div>
  );
}
