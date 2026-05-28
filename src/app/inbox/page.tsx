"use client";

// /inbox — app-wide attention center. Aggregates "things waiting on
// you" across every active project, so the GC doesn't have to dig
// through individual project pages to find what needs their decision.
//
// Sources (must stay in sync with use-inbox-count.ts):
//   1. Bids ready to award — RFQs with submitted bids but no winner picked
//   2. Draws pending client signature — milestones status = awaiting_approval
//   3. Change orders out for client approval — CO status = sent
//
// Each row links straight to the relevant page on the project so the
// GC can act in two clicks: open Inbox → tap the row.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  InboxIcon,
  BanknotesIcon,
  DocumentCheckIcon,
  CheckCircleIcon,
  CloudIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import { useAuth } from "@/lib/auth-context";
import {
  listDeals,
  listMilestones,
  listRFQs,
  listChangeOrders,
} from "@/lib/store";
import type { Deal } from "@/types";
import type {
  ProjectMilestone,
  ProjectChangeOrder,
  ProjectRFQ,
} from "@/types/builder";

interface InboxItem {
  id: string;
  kind: "bid" | "draw" | "co" | "weather";
  dealId: string;
  dealName: string;
  title: string;
  subtitle: string;
  href: string;
  amount?: number;
  /** Weather items are dismissable. Other kinds clear by action
   *  (award the bid, sign the draw, approve the CO). */
  dismissable?: boolean;
  // Lower = more urgent visually (used for sort + section ordering).
  priority: number;
}

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const DISMISSED_KEY = "inbox.dismissed_alerts";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage full / disabled — silently ignore.
  }
}

export default function InboxPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Dismissed alert IDs persist in localStorage so the user can clear
  // a weather watch and have it stay cleared across reloads. Only
  // weather items are dismissable today; bids / draws / COs clear
  // automatically when the GC takes action.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }

  useEffect(() => {
    if (!profile?.org_ref) return;
    let active = true;
    async function load() {
      // Defensive everywhere — one bad deal's RFQ/CO query shouldn't
      // strand the whole inbox at "Loading…". Each per-deal fetch is
      // wrapped so its failure becomes an empty array, and the outer
      // try/catch keeps loaded=true firing regardless.
      try {
        const deals = await listDeals(profile!.org_ref);
        const dealById = new Map<string, Deal>(deals.map((d) => [d.id, d]));
        const dealIds = deals.map((d) => d.id);

        const safeList = async <T,>(
          fetcher: () => Promise<T[]>,
          label: string,
        ): Promise<T[]> => {
          try {
            return await fetcher();
          } catch (e) {
            console.warn(`[inbox] ${label} failed`, e);
            return [];
          }
        };

        // Per-deal milestone queries instead of one big org-wide
        // listAllMilestonesForOrg() — the org-wide path goes through
        // a Firestore rule that does a get() on the parent deal per
        // milestone, so ONE orphan milestone (deal deleted, milestone
        // not cleaned up) fails the whole query. Per-deal queries
        // scope to known-existing deals and degrade per-deal on
        // failure instead of killing every draw row.
        const [milestoneLists, rfqLists, coLists] = await Promise.all([
          Promise.all(
            dealIds.map((id) =>
              safeList(() => listMilestones(id), `listMilestones(${id})`),
            ),
          ),
          Promise.all(
            dealIds.map((id) => safeList(() => listRFQs(id), `listRFQs(${id})`)),
          ),
          Promise.all(
            dealIds.map((id) =>
              safeList(() => listChangeOrders(id), `listChangeOrders(${id})`),
            ),
          ),
        ]);
        const milestones = milestoneLists.flat();

      const all: InboxItem[] = [];

      // 1. Draws pending client signature
      for (const m of milestones as ProjectMilestone[]) {
        if (m.status !== "awaiting_approval") continue;
        const d = dealById.get(m.deal_ref);
        if (!d) continue;
        all.push({
          id: `draw-${m.id}`,
          kind: "draw",
          dealId: d.id,
          dealName: d.name,
          title: `Draw pending: ${m.name}`,
          subtitle: `${m.percentage}% of contract • ${fmtMoney(m.amount)} • waiting on owner approval`,
          href: `/deals/${d.id}/draw/${m.id}`,
          amount: m.amount,
          priority: 1,
        });
      }

      // 2. Bids ready to award
      for (const rfqs of rfqLists) {
        for (const r of rfqs as ProjectRFQ[]) {
          if (r.awarded_to_sub_ref) continue;
          const bids = r.invitees.filter(
            (i) => typeof i.bid_amount === "number" && i.bid_amount > 0,
          );
          if (bids.length === 0) continue;
          const d = dealById.get(r.deal_ref);
          if (!d) continue;
          const low = Math.min(...bids.map((b) => b.bid_amount!));
          const high = Math.max(...bids.map((b) => b.bid_amount!));
          const range =
            low === high ? fmtMoney(low) : `${fmtMoney(low)}–${fmtMoney(high)}`;
          all.push({
            id: `bid-${r.id}`,
            kind: "bid",
            dealId: d.id,
            dealName: d.name,
            title: `${bids.length} bid${bids.length === 1 ? "" : "s"} in on ${r.scope_title}`,
            subtitle: `Range ${range} • award to lock the sub`,
            href: `/deals/${d.id}/finances`,
            amount: low,
            priority: 2,
          });
        }
      }

      // 3. Change orders pending client approval
      for (const cos of coLists) {
        for (const c of cos as ProjectChangeOrder[]) {
          if (c.status !== "sent") continue;
          const d = dealById.get(c.deal_ref);
          if (!d) continue;
          const sign = c.amount_delta >= 0 ? "+" : "−";
          all.push({
            id: `co-${c.id}`,
            kind: "co",
            dealId: d.id,
            dealName: d.name,
            title: `Change order out for signature: ${c.title}`,
            subtitle: `${c.number} • ${sign}${fmtMoney(Math.abs(c.amount_delta))} • awaiting client`,
            href: `/deals/${d.id}/finances`,
            amount: Math.abs(c.amount_delta),
            priority: 3,
          });
        }
      }

      // 4. Weather watches — surface the demo override alerts so the
      // GC sees them in the same place they see bids/draws/COs. Each
      // is dismissable via the X button (state lives in localStorage).
      // Live-forecast alerts can be added here later by querying the
      // same Open-Meteo path the schedule banner uses; for now the
      // demo_weather_alert override is the source of truth.
      for (const d of deals) {
        if (!d.demo_weather_alert) continue;
        const id = `weather-${d.id}-${d.demo_weather_alert.date}`;
        all.push({
          id,
          kind: "weather",
          dealId: d.id,
          dealName: d.name,
          title: `Weather watch: ${d.demo_weather_alert.reason}`,
          subtitle: `Forecast ${d.demo_weather_alert.date} • check the schedule for affected phases`,
          href: `/deals/${d.id}/schedule`,
          dismissable: true,
          priority: 4,
        });
      }

      all.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.dealName.localeCompare(b.dealName);
      });

        if (active) {
          setItems(all);
          setLoaded(true);
        }
      } catch (e) {
        console.error("[inbox] load failed", e);
        if (active) {
          setLoadError(e instanceof Error ? e.message : String(e));
          setLoaded(true);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [profile]);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Inbox
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Things waiting on you across every project. One screen, one
              decision per row.
            </p>
          </div>
          {loaded && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {items.filter((i) => !dismissed.has(i.id)).length}{" "}
              {items.filter((i) => !dismissed.has(i.id)).length === 1
                ? "item"
                : "items"}
            </span>
          )}
        </header>

        {!loaded && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading…
          </div>
        )}

        {loaded && loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">Couldn&apos;t load the inbox.</p>
            <p className="mt-1 text-xs text-red-700">{loadError}</p>
            <p className="mt-1 text-xs text-red-600">
              Check the browser console for details. Items with read errors
              were skipped — what you see below is the partial set.
            </p>
          </div>
        )}

        {(() => {
          const visibleItems = items.filter((i) => !dismissed.has(i.id));
          return (
            <>
              {loaded && !loadError && visibleItems.length === 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center">
                  <CheckCircleIcon className="mx-auto h-10 w-10 text-emerald-600" />
                  <h2 className="mt-3 text-base font-semibold text-emerald-900">
                    All clear
                  </h2>
                  <p className="mt-1 text-sm text-emerald-700">
                    No bids waiting to be awarded, no draws pending client
                    signature, no change orders out for approval. Get
                    yourself a coffee.
                  </p>
                </div>
              )}

              {loaded && visibleItems.length > 0 && (
                <ul className="space-y-2">
                  {visibleItems.map((it) => (
                    <li key={it.id} className="relative">
                      <Link
                        href={it.href}
                        className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow"
                      >
                        <div className="flex items-start gap-3">
                          <KindIcon kind={it.kind} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3 pr-6">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {it.title}
                              </p>
                              <span className="shrink-0 text-xs text-slate-500">
                                {it.dealName}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-600">
                              {it.subtitle}
                            </p>
                          </div>
                        </div>
                      </Link>
                      {it.dismissable && (
                        <button
                          type="button"
                          aria-label="Dismiss"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dismiss(it.id);
                          }}
                          className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {loaded && visibleItems.length > 0 && (
                <footer className="mt-6 flex items-center gap-2 text-xs text-slate-500">
                  <InboxIcon className="h-4 w-4" />
                  Items clear automatically when you take action — award a
                  bid, sign a draw, approve a change order. Weather watches
                  dismiss via the × button.
                </footer>
              )}
            </>
          );
        })()}
      </div>
    </AppShell>
  );
}

function KindIcon({ kind }: { kind: InboxItem["kind"] }) {
  // Color-code by action category so the eye can scan: amber = bid
  // (your decision), sky = draw (client decision pending), violet = CO,
  // slate cloud = weather watch (informational, dismissable).
  const className = "h-5 w-5 flex-shrink-0";
  switch (kind) {
    case "bid":
      return (
        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <BanknotesIcon className={className} />
        </span>
      );
    case "draw":
      return (
        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700">
          <DocumentCheckIcon className={className} />
        </span>
      );
    case "co":
      return (
        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <DocumentCheckIcon className={className} />
        </span>
      );
    case "weather":
      return (
        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <CloudIcon className={className} />
        </span>
      );
  }
}
