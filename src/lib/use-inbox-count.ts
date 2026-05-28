"use client";

import { useEffect, useState } from "react";
import { listDeals, listMilestones, listRFQs, listChangeOrders } from "@/lib/store";

// Same localStorage key the /inbox page writes. We read it here so
// dismissed weather watches don't keep inflating the sidebar badge.
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

/**
 * Fetches the count of items needing the GC's attention across all
 * projects. Drives the badge on the Inbox nav row and the page-header
 * count on /inbox. Re-queries every 2 minutes so the badge stays
 * roughly current without a manual refresh.
 *
 * Counted buckets (must stay in sync with /inbox page logic):
 *   1. Bids waiting to be awarded — RFQs with at least one submitted
 *      bid and no awarded_to_sub_ref set yet.
 *   2. Draws pending client signature — milestones with status
 *      "awaiting_approval" (work marked complete, client hasn't
 *      signed).
 *   3. Change orders out for client approval — CO status === "sent".
 *
 * Returns 0 while loading so we don't flash a fake high number.
 */
export function useInboxCount(orgRef: string | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!orgRef) return;
    let active = true;
    async function refresh() {
      try {
        const deals = await listDeals(orgRef!);
        const dealIds = deals.map((d) => d.id);

        // Per-deal milestone queries — see /inbox page for why
        // (orphan milestones can fail org-wide queries via Firestore
        // rules). Each per-deal call is wrapped to degrade to []
        // on failure.
        const safeList = async <T,>(fn: () => Promise<T[]>): Promise<T[]> => {
          try {
            return await fn();
          } catch {
            return [];
          }
        };
        const [milestoneLists, rfqLists, coLists] = await Promise.all([
          Promise.all(dealIds.map((id) => safeList(() => listMilestones(id)))),
          Promise.all(dealIds.map((id) => safeList(() => listRFQs(id)))),
          Promise.all(dealIds.map((id) => safeList(() => listChangeOrders(id)))),
        ]);

        const drawsPending = milestoneLists
          .flat()
          .filter((m) => m.status === "awaiting_approval").length;

        const bidsToAward = rfqLists
          .flat()
          .filter(
            (r) =>
              !r.awarded_to_sub_ref &&
              r.invitees.some((i) => typeof i.bid_amount === "number" && i.bid_amount > 0),
          ).length;

        const cosPending = coLists
          .flat()
          .filter((c) => c.status === "sent").length;

        // Weather watches counted from each deal's demo_weather_alert
        // override. Live-forecast alerts could be added here later.
        // Dismissed ones are filtered out so the badge respects the
        // user's "I've seen it" clicks.
        const dismissed = loadDismissed();
        const weatherCount = deals.filter((d) => {
          if (!d.demo_weather_alert) return false;
          const id = `weather-${d.id}-${d.demo_weather_alert.date}`;
          return !dismissed.has(id);
        }).length;

        if (active) {
          setCount(drawsPending + bidsToAward + cosPending + weatherCount);
        }
      } catch (e) {
        console.warn("[inbox-count] refresh failed", e);
      }
    }
    void refresh();
    const id = window.setInterval(refresh, 2 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [orgRef]);

  return count;
}
