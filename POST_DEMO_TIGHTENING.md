# Plan extractor — remaining tightening (post-demo)

Snapshot of where accuracy still has room, based on the Maddox
`Build Materials List.pdf` cross-check after the catalog/converter
rounds we shipped on 2026-05-28. Use this as the post-Barry punch
list. Each item has a priority based on dollar-impact on a typical
custom-home estimate.

## High priority (worth tracking down)

- [ ] **Second-floor joist count formula.** Architect spec on Maddox
  carries 160 second-floor I-joists vs. our 52 (~32% of spec). The
  architect bins joists by unique length (e.g., 6 ea 16', 14 ea
  14', 20 ea 12', …), so a uniform-length formula always undersells.
  Either: (a) generate joists per-length-bin using floor-shape
  heuristics, or (b) accept the gap and document it as "estimator
  must reconcile second-floor framing per plan."

- [ ] **Interior door count + pocket door handling.** Maddox spec
  has 41 interior doors including 8 pocket doors. Claude returns
  14-17 on most extractions. The extraction prompt currently asks
  for `interior_doors_estimated` but pocket-door schedules on
  framing plans are easy to misread. Options:
  1. Add explicit `pocket_doors_estimated` field to extraction.
  2. Tighten the prompt with explicit door-schedule reading rules
     (similar to the `exterior_doors_estimated` rules we already
     have).
  3. Catalog: add a "Pocket door rough opening + hardware" option
     to stub-door-interior that scales unit cost +50%.

- [ ] **Garage door count when ≥ 2 doors.** Plans with one 16'×7'
  AND one 8'×7' garage door (two separate openings) get counted
  as 1 garage door by the converter. Logic in from-plan.ts uses
  `garage_cars` to drive count, which Claude returns as a vehicle
  capacity, not a door count. Fix: add `garage_doors_estimated`
  field separate from `garage_cars`, OR derive door count from
  garage_sqft (16+ wide → 1 large, ≥ 600 SF garage → likely 2
  doors).

- [ ] **CMU foundation block overcount.** AI consistently runs
  1,500-1,700 blocks vs. architect's 1,191 + 73 piers = 1,264.
  The 5-blocks-per-pier formula may double up. Recalibrate against
  Maddox: 73 piers × ? blocks = 73 (1 each? 2 each?). Probably
  reduce pier block multiplier from 5 → 2-3.

## Medium priority

- [ ] **Roof sheathing geometric overshoot.** AI runs ~25-30% over
  on roof sheet count even with the 1.20 pitch multiplier. Likely
  cause: when Claude returns the OVERALL building envelope as
  footprint AND the roof multiplier covers porch eaves, we're
  double-counting porch area. Fix idea: when `porch_sqft > 0`,
  reduce the roof multiplier back to 1.15 (pure pitch) since porch
  is already in the envelope.

- [ ] **Garage slab as separate concrete pour.** Architect spec
  for Maddox: 16 CY garage slab + 4 CY pad footings = 20 CY
  separate from continuous footing. Our converter only generates
  strip footing. Add a generator step: when `garage_sqft > 100`,
  emit a `stub-slab-on-grade` instance sized for the garage.

- [ ] **Sill plate + termite shield + sand fill** are line items
  in any crawl-space foundation. Architect spec: 16 ea PT 2×8×16'
  sill plate, 250 LF termite shield, 4,079 SF compacted sand fill.
  These are small dollars individually but show up as "missing"
  on every comparison. Add to the strip footing / CMU foundation
  generator step.

- [ ] **Fascia / soffit / drip edge / ridge vent** — exterior
  trim items missing entirely from converter output. Architect
  spec: 663 LF drip edge + 659 LF 1×8 fascia + 975 SF vented
  soffit + 184 LF continuous ridge vent. New `stub-exterior-trim`
  assembly OR add to siding flow.

- [ ] **Gable wall framing as a distinct quantity.** Maddox spec
  has 741 LF 2×6 gable studs + 27 plates + 32 sheets of OSB gable
  sheathing. Our exterior wall stud formula adds +15% buffer that
  partially covers this, but a distinct line would be more
  accurate and visible in the quote.

- [ ] **Stone veneer accent.** Most custom plans have 50-300 SF
  of stone veneer somewhere (chimney, column wraps, foundation
  accent). Architect Maddox spec: 69 SF. Add a stone veneer
  option to the siding assembly, OR ask Claude to surface
  `stone_veneer_sqft` in the extraction.

## Lower priority (small dollars / edge cases)

- [ ] **Drywall tape as standalone line.** Architects spell out
  total joint tape footage; our catalog bundles it into the
  drywall sheet line. Cosmetic, not a real cost gap.

- [ ] **Floor insulation under first-floor I-joists** (R-19,
  ~3,000 SF on a crawl-space plan). Currently missing entirely.
  Could add as a property to stub-floor-2x10-16oc.

- [ ] **Drywall sheet size: 4×8 vs 4×12.** Architects use 4×12
  for 9'+ ceilings. Sheet counts differ but cost per SF is the
  same. Mostly visual mismatch in cross-checks; doesn't change
  $.

- [ ] **PSL beams as distinct material from LVL.** Porch beams
  are often PSL (parallel strand) which costs ~10-15% more than
  LVL. Catalog has a PSL preset on stub-lvl-beam-package; the
  porch-system generator could use it instead of LVL for porch
  beams.

- [ ] **Column corbels.** Maddox spec: 16 ea decorative column
  corbels. Lower-volume item; only on plans with substantial
  porches.

- [ ] **Window count on grouped units.** Architect lists like
  "(2) 2'-8"×5'-0"" mean 2 sashes; Claude sometimes counts as 1.
  Adjust the extraction prompt with a "count grouped units"
  reminder similar to door counting.

## Schema additions (would help all of the above)

- [ ] `pocket_doors_estimated: number | null`
- [ ] `garage_doors_estimated: number | null` (separate from cars)
- [ ] `stone_veneer_sqft: number | null`
- [ ] `roof_type: "gable" | "hip" | "gable+hip" | "complex" | null`
  — for smarter gutter / eave LF calc
- [ ] `roof_pitch_in_12: number | null` — for accurate slope factor
  instead of generic 1.15-1.20 multiplier

## Catalog / pricing tightening

- [ ] **Regional pricing multipliers.** All unit prices in
  stub-catalog.ts are 2024 national-average ballpark. Builders
  in HCOL markets need 1.3-1.6x; LCOL builders need 0.8x. The
  `cost_overrides` in OrgSettings supports this but isn't
  exposed in the demo flow. Consider a "Set your market" step
  in onboarding.

- [ ] **Live pricing source.** Still no 1build / RSMeans / Stackct
  integration. The catalog is hardcoded and goes stale. Track
  the price-source pill we shipped earlier — when "market"
  source is implemented, those lines update from live data.

## Methodology notes (for the inevitable Brennan question)

- Accuracy was measured by a single dataset: `Maddox Build
  Materials List.pdf` (architect Plan 46354LA / 83018, 2-story
  custom + crawl + porch + 2-car garage).
- Comparison ran via `scripts/compare-estimate-to-materials.mjs`
  which sends both the AI-generated CSV and the architect's PDF
  to Claude with a structured prompt asking for matched / missing
  / quantity-delta / extras buckets.
- Single-dataset = no statistical confidence. To get a real
  accuracy number we'd need 5-10 paired (plan, materials list)
  bundles across plan types. Brennan can supply this — see
  `POST_DEMO_TIGHTENING.md` (this file) ToDo list above plus
  the eval-corpus discussion from the late-night session.
