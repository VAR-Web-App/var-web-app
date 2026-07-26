// Sub Bid Intelligence — benchmark incoming bids against the builder's OWN
// historical bids for the same phase, and flag each as low / fair / high.
//
// The "your own history" half of the roadmap add-on, built purely on RFQ data
// already in the app. (An external RSMeans-style industry benchmark is the
// future paid-data seam — it slots in as an additional benchmark source.)
//
// Pure — no I/O.

import type { ProjectRFQ } from "@/types/builder";

export interface BidBenchmark {
  phase: string;
  /** Number of historical bids the benchmark is built from. */
  count: number;
  median: number;
  min: number;
  max: number;
}

export interface ClassifiedBid {
  subName: string;
  amount: number;
  /** vs the historical median; "na" when there's no benchmark yet. */
  verdict: "low" | "fair" | "high" | "na";
  /** Fractional delta from median (e.g. -0.12), null when no benchmark. */
  deltaPct: number | null;
  /** True for the lowest bid on this RFQ. */
  isLowest: boolean;
}

export interface RfqIntel {
  rfqId: string;
  scopeTitle: string;
  phase: string;
  benchmark: BidBenchmark | null;
  bids: ClassifiedBid[];
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median/min/max of every historical bid for a phase, excluding one RFQ
 *  (the one being judged). Needs ≥2 historical bids to be meaningful. */
export function benchmarkForPhase(
  allRfqs: ProjectRFQ[],
  phase: string,
  excludeRfqId: string,
): BidBenchmark | null {
  const amounts: number[] = [];
  for (const r of allRfqs) {
    if (r.id === excludeRfqId || r.phase !== phase) continue;
    for (const inv of r.invitees) {
      if (inv.bid_amount && inv.bid_amount > 0) amounts.push(inv.bid_amount);
    }
  }
  if (amounts.length < 2) return null;
  amounts.sort((a, b) => a - b);
  return {
    phase,
    count: amounts.length,
    median: median(amounts),
    min: amounts[0],
    max: amounts[amounts.length - 1],
  };
}

const THRESHOLD = 0.1; // ±10% around the median reads as "fair"

/** Classify each real bid on an RFQ against the benchmark. */
export function classifyBids(
  rfq: ProjectRFQ,
  benchmark: BidBenchmark | null,
): ClassifiedBid[] {
  const real = rfq.invitees
    .filter((i) => i.bid_amount && i.bid_amount > 0)
    .sort((a, b) => (a.bid_amount || 0) - (b.bid_amount || 0));
  return real.map((i, idx) => {
    const amount = i.bid_amount!;
    if (!benchmark) {
      return { subName: i.sub_name, amount, verdict: "na" as const, deltaPct: null, isLowest: idx === 0 };
    }
    const deltaPct = (amount - benchmark.median) / benchmark.median;
    const verdict = deltaPct > THRESHOLD ? "high" : deltaPct < -THRESHOLD ? "low" : "fair";
    return { subName: i.sub_name, amount, verdict, deltaPct, isLowest: idx === 0 };
  });
}

/** For each of a deal's RFQs that has bids, benchmark against the rest of the
 *  org's history and classify the bids. */
export function analyzeDealBids(
  dealRfqs: ProjectRFQ[],
  allRfqs: ProjectRFQ[],
): RfqIntel[] {
  return dealRfqs
    .filter((r) => r.invitees.some((i) => i.bid_amount && i.bid_amount > 0))
    .map((r) => {
      const benchmark = benchmarkForPhase(allRfqs, r.phase, r.id);
      return {
        rfqId: r.id,
        scopeTitle: r.scope_title,
        phase: r.phase,
        benchmark,
        bids: classifyBids(r, benchmark),
      };
    });
}
