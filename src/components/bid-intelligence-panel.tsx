"use client";

// Sub Bid Intelligence — for each RFQ on this project that has bids, compare
// them against the builder's own historical bids for the same phase and flag
// low / fair / high. Complements the RFQ panel's award flow.

import { useEffect, useMemo, useState } from "react";
import { ScaleIcon } from "@heroicons/react/24/outline";
import { listRFQs, listAllRFQsForOrg } from "@/lib/store";
import { analyzeDealBids } from "@/lib/bids/intelligence";
import type { Deal } from "@/types";
import type { ProjectRFQ } from "@/types/builder";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const VERDICT = {
  low: { label: "Low", cls: "bg-emerald-100 text-emerald-800" },
  fair: { label: "Fair", cls: "bg-slate-100 text-slate-700" },
  high: { label: "High", cls: "bg-amber-100 text-amber-800" },
  na: { label: "No history", cls: "bg-slate-100 text-slate-500" },
};

export default function BidIntelligencePanel({ deal }: { deal: Deal }) {
  const [dealRfqs, setDealRfqs] = useState<ProjectRFQ[]>([]);
  const [allRfqs, setAllRfqs] = useState<ProjectRFQ[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [d, all] = await Promise.allSettled([
        listRFQs(deal.id),
        listAllRFQsForOrg(deal.org_ref),
      ]);
      if (!active) return;
      if (d.status === "fulfilled") setDealRfqs(d.value);
      if (all.status === "fulfilled") setAllRfqs(all.value);
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [deal.id, deal.org_ref]);

  const intel = useMemo(() => analyzeDealBids(dealRfqs, allRfqs), [dealRfqs, allRfqs]);

  // Only surface once there are bids to analyze.
  if (!loaded || intel.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
        <ScaleIcon className="h-4 w-4 text-sky-700" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Bid intelligence</h2>
          <p className="mt-0.5 hidden text-xs text-slate-500 sm:block">
            Incoming bids vs your own history for the same phase.
          </p>
        </div>
        <span className="ml-auto rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700">
          Add-on
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {intel.map((r) => (
          <div key={r.rfqId} className="px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-800">{r.scopeTitle}</span>
              {r.benchmark ? (
                <span className="text-xs text-slate-500">
                  Your median for {r.phase}:{" "}
                  <span className="font-semibold text-slate-700">{money(r.benchmark.median)}</span>{" "}
                  ({money(r.benchmark.min)}–{money(r.benchmark.max)}, {r.benchmark.count} bids)
                </span>
              ) : (
                <span className="text-xs text-slate-400">Not enough history to benchmark yet</span>
              )}
            </div>
            <ul className="mt-2 space-y-1">
              {r.bids.map((b, i) => {
                const v = VERDICT[b.verdict];
                return (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {b.subName}
                      {b.isLowest && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase text-emerald-600">lowest</span>
                      )}
                    </span>
                    <span className="w-20 text-right font-semibold tabular-nums text-slate-900">
                      {money(b.amount)}
                    </span>
                    <span className={`w-24 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold ${v.cls}`}>
                      {v.label}
                      {b.deltaPct !== null && b.verdict !== "fair"
                        ? ` ${b.deltaPct > 0 ? "+" : ""}${Math.round(b.deltaPct * 100)}%`
                        : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
