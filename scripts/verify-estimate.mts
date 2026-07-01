// One-off: run the plan→assemblies converter on a representative custom home
// and print the per-line breakdown + total, to sanity-check the wired MEP/
// finishes/site trades (no double-count, believable magnitudes).
import { instancesAndLinesFromPlan } from "@/lib/assemblies/from-plan";

const extraction = {
  total_sqft: 3200, first_floor_sqft: 2200, second_floor_sqft: 1000,
  bonus_sqft: 0, porch_sqft: 400, garage_sqft: 600, garage_cars: 2,
  bedrooms: 4, full_baths: 3, half_baths: 1,
  footprint_dimensions: "68 x 42", roof_type: "gable+hip", roof_pitch_in_12: 8,
  stories: 2, foundation_type: "crawl space", exterior_wall_type: "2x6",
  ceiling_heights: "10' main, 9' second",
  doors_windows: {
    exterior_doors_estimated: 4, interior_doors_estimated: 22,
    pocket_doors_estimated: 2, windows_estimated: 24,
  },
  notable_features: [],
};

let n = 0;
const newId = () => `x${n++}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { instances, lines } = instancesAndLinesFromPlan(extraction as any, 18, 1, newId);

const byInst: Record<string, number> = {};
for (const l of lines)
  byInst[l.product_code] = (byInst[l.product_code] ?? 0) + l.customer_extended;
const total = lines.reduce((s, l) => s + l.customer_extended, 0);
const dups = Object.keys(byInst).length !== new Set(instances.map((i) => i.instanceLabel)).size;

console.log(`instances: ${instances.length} | lines: ${lines.length} | label collisions: ${dups}\n`);
for (const [k, v] of Object.entries(byInst).sort((a, b) => b[1] - a[1]))
  console.log(`  ${Math.round(v).toLocaleString().padStart(9)}  ${k}`);
console.log(`\n  GRAND TOTAL (18% markup): $${Math.round(total).toLocaleString()}`);
