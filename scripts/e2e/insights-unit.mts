// Unit tests for the pure scheduling-insights logic. insights.ts has only a
// type-only import, so Node can strip types and run it directly.
import { conflictPairs, scoreSubs, weatherAdvisories, isOutdoorPhase } from "../../src/lib/scheduling/insights.ts";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`); }
};

console.log("— conflictPairs —");
const cp = conflictPairs([
  { subId: "A", subName: "Hill Country Framing", dealId: "d1", dealName: "Maddox", milestoneId: "m1", phase: "Framing", start: "2026-08-11", end: "2026-08-25" },
  { subId: "A", subName: "Hill Country Framing", dealId: "d2", dealName: "Reyes", milestoneId: "m2", phase: "Framing", start: "2026-08-11", end: "2026-08-25" },
  { subId: "A", subName: "Hill Country Framing", dealId: "d1", dealName: "Maddox", milestoneId: "m3", phase: "Roofing", start: "2026-09-01", end: "2026-09-05" }, // same deal as m1? no — different phase, no overlap anyway
]);
eq("one cross-project conflict", cp.length, 1);
eq("subName", cp[0]?.subName, "Hill Country Framing");
eq("overlap days", cp[0]?.overlapDays, 15);
eq("suggested new start = day after earlier ends", cp[0]?.suggestion.newStart, "2026-08-26");
eq("suggested shift days", cp[0]?.suggestedShiftDays, 15);

// Same-project overlap must NOT be flagged.
const cpSame = conflictPairs([
  { subId: "A", subName: "x", dealId: "d1", dealName: "M", milestoneId: "m1", phase: "Framing", start: "2026-08-11", end: "2026-08-25" },
  { subId: "A", subName: "x", dealId: "d1", dealName: "M", milestoneId: "m2", phase: "Roofing", start: "2026-08-20", end: "2026-08-30" },
]);
eq("same-project overlap ignored", cpSame.length, 0);

console.log("\n— scoreSubs —");
const ms = [
  { id: "a", deal_ref: "d1", name: "Foundation", status: "approved", planned_end_date: "2026-06-10", approved_at: "2026-06-08T10:00:00Z", assigned_subs: ["B"] },
  { id: "b", deal_ref: "d1", name: "Roofing", status: "approved", planned_end_date: "2026-06-20", approved_at: "2026-06-25T10:00:00Z", assigned_subs: ["B"] },
  { id: "c", deal_ref: "d1", name: "Drywall", status: "pending", planned_end_date: "2026-09-01", assigned_subs: ["B"] },
];
// deno-lint style: cast through unknown for the test doubles
const scores = scoreSubs(ms as never, [{ id: "B", name: "Cano Concrete" }]);
eq("one scored sub", scores.length, 1);
eq("completed count", scores[0]?.completed, 2);
eq("on-time count", scores[0]?.onTime, 1);
eq("on-time pct", scores[0]?.onTimePct, 0.5);
eq("avg variance days", scores[0]?.avgVarianceDays, 1.5);
eq("upcoming count", scores[0]?.upcoming, 1);

console.log("\n— weatherAdvisories —");
eq("Roofing is outdoor", isOutdoorPhase("Roofing"), true);
eq("Drywall is indoor", isOutdoorPhase("Drywall"), false);
const adv = weatherAdvisories(
  [{ id: "r", deal_ref: "d1", name: "Roofing", status: "pending", planned_start_date: "2026-07-28", planned_end_date: "2026-07-30", assigned_subs: [] }] as never,
  [
    { date: "2026-07-28", precipProbMax: 80, precipSum: 6 },
    { date: "2026-07-29", precipProbMax: 10, precipSum: 0 },
    { date: "2026-07-30", precipProbMax: 90, precipSum: 12 },
    { date: "2026-07-31", precipProbMax: 5, precipSum: 0 },
  ],
  "Maddox",
);
eq("one advisory", adv.length, 1);
eq("rain days", adv[0]?.rainDays, ["2026-07-28", "2026-07-30"]);
eq("worst prob", adv[0]?.worstProb, 90);
eq("suggested next dry start", adv[0]?.suggestedStart, "2026-07-29");

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
