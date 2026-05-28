"use client";

import { useEffect, useState } from "react";
import { listDeals, listAllMilestonesForOrg, listRFQs, listChangeOrders } from "@/lib/store";

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

        const [milestones, rfqLists, coLists] = await Promise.all([
          listAllMilestonesForOrg(orgRef!),
          Promise.all(dealIds.map((id) => listRFQs(id))),
          Promise.all(dealIds.map((id) => listChangeOrders(id))),
        ]);

        const drawsPending = milestones.filter(
          (m) => m.status === "awaiting_approval",
        ).length;

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

        if (active) setCount(drawsPending + bidsToAward + cosPending);
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
