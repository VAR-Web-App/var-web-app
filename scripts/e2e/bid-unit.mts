// Unit tests for the pure bid-intelligence logic (type-only import → runnable).
import { benchmarkForPhase, classifyBids, analyzeDealBids } from "../../src/lib/bids/intelligence.ts";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`); }
};

const H1 = { id: "H1", phase: "Framing", scope_title: "Framing", invitees: [{ sub_name: "a", bid_amount: 70000 }, { sub_name: "b", bid_amount: 72000 }] };
const H2 = { id: "H2", phase: "Framing", scope_title: "Framing", invitees: [{ sub_name: "c", bid_amount: 68000 }, { sub_name: "d", bid_amount: 74000 }] };
const T = { id: "T", phase: "Framing", scope_title: "Framing rough", invitees: [
  { sub_name: "Acme", bid_amount: 62000 },
  { sub_name: "Bay", bid_amount: 71000 },
  { sub_name: "Quick", bid_amount: 84000 },
] };
const all = [H1, H2, T] as never[];

console.log("— benchmarkForPhase —");
const bm = benchmarkForPhase(all, "Framing", "T");
eq("median 71000", bm?.median, 71000);
eq("count 4 (excludes target)", bm?.count, 4);
eq("range 68000–74000", [bm?.min, bm?.max], [68000, 74000]);
eq("null when <2 history", benchmarkForPhase([T] as never[], "Framing", "T"), null);

console.log("\n— classifyBids —");
const bids = classifyBids(T as never, bm);
eq("sorted ascending, lowest tagged", [bids[0].subName, bids[0].isLowest], ["Acme", true]);
eq("Acme is Low", bids[0].verdict, "low");
eq("Bay is Fair", bids[1].verdict, "fair");
eq("Quick is High", bids[2].verdict, "high");
eq("Quick delta ~+18%", Math.round((bids[2].deltaPct ?? 0) * 100), 18);

console.log("\n— analyzeDealBids —");
const intel = analyzeDealBids([T] as never[], all);
eq("one analyzed RFQ", intel.length, 1);
eq("carries benchmark + 3 bids", [intel[0].benchmark?.median, intel[0].bids.length], [71000, 3]);
eq("no-history RFQs excluded", analyzeDealBids([{ id: "X", phase: "Finishes", scope_title: "x", invitees: [] }] as never[], all).length, 0);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
