"use client";

// Public sub portal. The token in the URL path is the doc ID of a
// sub_schedule_links record (see firestore.rules — anyone with the
// token can read it). Three tabs:
//   - Schedule:  upcoming + completed phases; Confirm / Flag-conflict
//                actions go through /api/sub/acknowledge.
//   - Payments:  outgoing payments the GC has recorded to this sub,
//                plus awarded RFQ totals and outstanding balance.
//   - Documents: awarded RFQ scope summaries (read-only).
//
// Payments + Documents data lives in auth-gated collections, so it's
// loaded via /api/sub/portal-data (server-mediated through admin SDK).
// NO auth required.

import { use, useEffect, useState } from "react";
import { getSubScheduleLink } from "@/lib/store";
import PushOptIn from "@/components/push-opt-in";
import {
  SubScheduleLink,
  SubScheduleAssignment,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_STYLES,
} from "@/types/builder";

interface PaymentView {
  id: string;
  amount: number;
  date: string;
  method: "check" | "cc" | "ach" | "cash" | "other";
  check_number?: string;
  deal_name: string;
  milestone_name?: string;
  notes?: string;
}

interface AwardedRfqView {
  id: string;
  deal_id: string;
  scope_title: string;
  scope_description: string;
  phase: string;
  project_name: string;
  bid_amount: number;
  bid_notes?: string;
  awarded_at?: string;
}

interface PortalData {
  payments: PaymentView[];
  awarded_rfqs: AwardedRfqView[];
  totals: { paid: number; awarded: number; pending: number };
}

const fmtMoney = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

type Tab = "schedule" | "payments" | "documents";

/** YYYY-MM-DD → "Mon, Jun 2". Returns "TBD" for missing/invalid input. */
function fmtDate(iso?: string): string {
  if (!iso) return "TBD";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function SubSchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [link, setLink] = useState<SubScheduleLink | null>(null);
  const [portal, setPortal] = useState<PortalData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("schedule");

  useEffect(() => {
    let active = true;
    // Schedule is public-read direct from Firestore; payments + RFQs go
    // through the server because those collections are auth-gated.
    Promise.all([
      getSubScheduleLink(token),
      fetch(`/api/sub/portal-data?token=${encodeURIComponent(token)}`)
        .then((r) =>
          r.ok ? (r.json() as Promise<{ ok: boolean; data?: PortalData }>) : null,
        )
        .catch(() => null),
    ])
      .then(([l, portalRes]) => {
        if (!active) return;
        if (!l) setMissing(true);
        else setLink(l);
        // Always populate `portal` once the fetch resolves — even on
        // error — so the tabs render their empty states instead of
        // perpetual "Loading…". The 503 case (admin SDK not set in
        // env) is the most common reason this falls through.
        if (portalRes?.ok && portalRes.data) {
          setPortal(portalRes.data);
        } else {
          setPortal({
            payments: [],
            awarded_rfqs: [],
            totals: { paid: 0, awarded: 0, pending: 0 },
          });
        }
        setLoaded(true);
      })
      .catch((e) => {
        console.warn("[sub-schedule] load failed", e);
        if (active) {
          setMissing(true);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  // Optimistic patch — when the server confirms an ack, splice the new
  // state into the local snapshot so the user sees instant feedback
  // without a reload.
  function patchAssignment(
    milestoneRef: string,
    patch: SubScheduleAssignment["acknowledgment"],
  ) {
    setLink((prev) =>
      prev
        ? {
            ...prev,
            assignments: prev.assignments.map((a) =>
              a.milestone_ref === milestoneRef
                ? { ...a, acknowledgment: patch }
                : a,
            ),
          }
        : prev,
    );
  }

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="text-sm text-slate-500">Loading schedule…</div>
      </main>
    );
  }

  if (missing || !link) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <p className="text-4xl">📅</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">
          Schedule not available
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          This link may have expired. Reach out to your builder for an
          updated one.
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky header so the tab strip stays visible while scrolling
       *  long payment lists or awarded scopes. Backdrop blur softens
       *  the underlying content as it slides past. */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 pt-4 sm:px-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
            Your portal
          </div>
          <div className="mt-0.5 text-base font-semibold text-slate-900 sm:text-sm">
            {link.sub_name}
          </div>
          <div className="text-xs text-slate-500">
            from {link.builder_name || "your builder"}
          </div>
          <nav
            role="tablist"
            className="mt-3 -mb-px flex gap-1 overflow-x-auto border-b border-slate-200"
          >
            <TabBtn label="Schedule" active={tab === "schedule"} onClick={() => setTab("schedule")} />
            <TabBtn
              label="Payments"
              badge={portal?.payments.length}
              active={tab === "payments"}
              onClick={() => setTab("payments")}
            />
            <TabBtn
              label="Documents"
              badge={portal?.awarded_rfqs.length}
              active={tab === "documents"}
              onClick={() => setTab("documents")}
            />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <PushOptIn token={token} />
        {tab === "schedule" && (
          <ScheduleTab link={link} token={token} onPatch={patchAssignment} />
        )}
        {tab === "payments" && <PaymentsTab portal={portal} />}
        {tab === "documents" && <DocumentsTab portal={portal} />}

        <footer className="mt-8 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] text-center text-xs text-slate-400">
          Updated {new Date(link.updated_at).toLocaleDateString()}. Questions?
          Contact {link.builder_name || "your builder"}.
        </footer>
      </main>
    </div>
  );
}

function TabBtn({
  label,
  badge,
  active,
  onClick,
}: {
  label: string;
  badge?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
        active
          ? "border-sky-600 text-sky-700"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            active ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function ScheduleTab({
  link,
  token,
  onPatch,
}: {
  link: SubScheduleLink;
  token: string;
  onPatch: (
    milestoneRef: string,
    patch: SubScheduleAssignment["acknowledgment"],
  ) => void;
}) {
  const upcoming = link.assignments.filter((a) => a.status !== "released");
  const done = link.assignments.filter((a) => a.status === "released");

  if (link.assignments.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm font-medium text-slate-700">
          No phases scheduled yet
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {link.builder_name || "Your builder"} will text you when
          you&apos;re scheduled.
        </p>
      </div>
    );
  }
  return (
    <>
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Upcoming
          </h2>
          <ul className="space-y-2">
            {upcoming.map((a, i) => (
              <AssignmentCard
                key={a.milestone_ref ?? `u${i}`}
                a={a}
                token={token}
                onPatch={onPatch}
              />
            ))}
          </ul>
        </section>
      )}
      {done.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Completed
          </h2>
          <ul className="space-y-2">
            {done.map((a, i) => (
              <AssignmentCard
                key={a.milestone_ref ?? `d${i}`}
                a={a}
                token={token}
                onPatch={onPatch}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function PaymentsTab({ portal }: { portal: PortalData | null }) {
  if (!portal) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Loading payment history…
      </p>
    );
  }
  const { totals, payments } = portal;
  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-3 divide-x divide-slate-200 text-center">
          <Stat label="Paid" value={fmtMoney(totals.paid)} tone="emerald" />
          <Stat label="Awarded" value={fmtMoney(totals.awarded)} tone="sky" />
          <Stat
            label="Outstanding"
            value={fmtMoney(totals.pending)}
            tone={totals.pending > 0 ? "amber" : "slate"}
          />
        </div>
      </section>

      <section className="mt-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Payments received
        </h2>
        {payments.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No payments recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {p.deal_name}
                    </p>
                    {p.milestone_name && (
                      <p className="text-xs text-slate-500">
                        {p.milestone_name}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700">
                    +{fmtMoney(p.amount)}
                  </p>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                  <span>
                    {p.date} ·{" "}
                    {p.method === "check" && p.check_number
                      ? `Check #${p.check_number}`
                      : p.method.toUpperCase()}
                  </span>
                </div>
                {p.notes && (
                  <p className="mt-2 text-xs italic text-slate-600">
                    {p.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function DocumentsTab({ portal }: { portal: PortalData | null }) {
  if (!portal) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Loading documents…
      </p>
    );
  }
  const { awarded_rfqs } = portal;
  if (awarded_rfqs.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm font-medium text-slate-700">
          No awarded scopes yet
        </p>
        <p className="mt-1 text-xs text-slate-500">
          When you win a bid, the scope of work shows up here for reference.
        </p>
      </div>
    );
  }
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Awarded scopes
      </h2>
      <ul className="space-y-3">
        {awarded_rfqs.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {r.scope_title}
                </p>
                <p className="text-xs text-slate-600">
                  {r.project_name} · {r.phase}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                {fmtMoney(r.bid_amount)}
              </p>
            </div>
            {r.scope_description && (
              <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">
                {r.scope_description}
              </p>
            )}
            {r.bid_notes && (
              <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                <span className="font-semibold">Your bid notes:</span>{" "}
                {r.bid_notes}
              </div>
            )}
            {r.awarded_at && (
              <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-400">
                Awarded {new Date(r.awarded_at).toLocaleDateString()}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "sky" | "amber" | "slate";
}) {
  const colorClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "sky"
        ? "text-sky-700"
        : tone === "amber"
          ? "text-amber-700"
          : "text-slate-700";
  return (
    <div className="px-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}

function AssignmentCard({
  a,
  token,
  onPatch,
}: {
  a: SubScheduleAssignment;
  token: string;
  onPatch: (
    milestoneRef: string,
    patch: SubScheduleAssignment["acknowledgment"],
  ) => void;
}) {
  const [busy, setBusy] = useState<"confirmed" | "conflict" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConflict, setShowConflict] = useState(false);
  const [conflictReason, setConflictReason] = useState("");

  // Hide action buttons once the phase is past the point where the
  // sub's confirmation is meaningful. They still see the historical
  // ack state if one exists.
  const actionable =
    !!a.milestone_ref &&
    (a.status === "pending" || a.status === "in_progress");

  async function submit(status: "confirmed" | "conflict", reason?: string) {
    if (!a.milestone_ref) return;
    setBusy(status);
    setError(null);
    try {
      const res = await fetch("/api/sub/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          milestone_ref: a.milestone_ref,
          status,
          reason,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(humanError(data.error));
        return;
      }
      onPatch(a.milestone_ref, {
        status,
        ...(reason ? { reason } : {}),
        created_at: new Date().toISOString(),
      });
      setShowConflict(false);
      setConflictReason("");
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {a.phase_name}
          </p>
          <p className="text-xs text-slate-600">{a.project_name}</p>
          {a.project_address && (
            <p className="mt-0.5 text-xs text-slate-500">
              {a.project_address.split("\n")[0]}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${MILESTONE_STATUS_STYLES[a.status]}`}
        >
          {MILESTONE_STATUS_LABELS[a.status]}
        </span>
      </div>
      <div className="mt-2 text-sm font-medium tabular-nums text-slate-700">
        {fmtDate(a.start_date)} – {fmtDate(a.end_date)}
      </div>

      {a.acknowledgment && (
        <div
          className={`mt-3 rounded-md px-3 py-2 text-xs ring-1 ${
            a.acknowledgment.status === "confirmed"
              ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
              : "bg-amber-50 text-amber-800 ring-amber-200"
          }`}
        >
          <div className="font-semibold">
            {a.acknowledgment.status === "confirmed"
              ? "✓ You confirmed this phase"
              : "⚠ You flagged a conflict"}
          </div>
          {a.acknowledgment.reason && (
            <div className="mt-0.5 text-slate-700">
              &ldquo;{a.acknowledgment.reason}&rdquo;
            </div>
          )}
        </div>
      )}

      {actionable && !showConflict && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => submit("confirmed")}
            disabled={busy !== null}
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50"
          >
            {busy === "confirmed"
              ? "Saving…"
              : a.acknowledgment?.status === "confirmed"
                ? "Re-confirm"
                : "Confirm"}
          </button>
          <button
            onClick={() => setShowConflict(true)}
            disabled={busy !== null}
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-md bg-white px-3 text-sm font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-50 active:bg-amber-100 disabled:opacity-50"
          >
            Flag conflict
          </button>
        </div>
      )}

      {actionable && showConflict && (
        <div className="mt-3 space-y-2">
          <textarea
            value={conflictReason}
            onChange={(e) => setConflictReason(e.target.value)}
            placeholder="What's the conflict? (e.g. already booked, materials delayed)"
            rows={3}
            className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"
            maxLength={500}
          />
          <div className="flex gap-2">
            <button
              onClick={() => submit("conflict", conflictReason.trim())}
              disabled={!conflictReason.trim() || busy !== null}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-md bg-amber-600 px-3 text-sm font-semibold text-white hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50"
            >
              {busy === "conflict" ? "Sending…" : "Send to builder"}
            </button>
            <button
              onClick={() => {
                setShowConflict(false);
                setConflictReason("");
              }}
              disabled={busy !== null}
              className="flex min-h-[44px] items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 active:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs text-red-600">{error}</div>
      )}
    </li>
  );
}

function humanError(code?: string): string {
  switch (code) {
    case "token_not_found":
      return "This link has expired. Reach out to your builder.";
    case "milestone_not_assigned":
      return "This phase is no longer assigned to you.";
    case "reason_required":
      return "Please add a brief note about the conflict.";
    case "not_configured":
      return "Action temporarily unavailable. Try again later.";
    default:
      return "Couldn't save — try again.";
  }
}
