# Plan extractor — remaining tightening (post-demo)

Snapshot of where accuracy still has room, based on the Maddox
`Build Materials List.pdf` cross-check after the catalog/converter
rounds we shipped on 2026-05-28. Use this as the post-Barry punch
list. Each item has a priority based on dollar-impact on a typical
custom-home estimate.

## CRITICAL — auto-generate MEP + finishes + site work assemblies

The converter (`instancesAndLinesFromPlan`) currently only generates
the structural shell (foundation, framing, openings, roof, ceiling,
gutters, paint, hardwood). The catalog HAS plumbing, electrical,
HVAC, kitchen, bath, site work, septic, appliance assemblies — they
just aren't called from the converter.

Result: AI estimate sums to ~$265K on Maddox vs. $1.45M contract.
Most of the gap is missing trade scope, not pricing accuracy.

Auto-generate these in the converter (each is bedrooms / sqft /
count-based, no new schema needed):

- [ ] `stub-plumbing-rough` — whole-house plumbing (total fixture
      count = baths × 3 + kitchen × 1 + laundry × 1)
- [ ] `stub-electrical-whole-home` — service + circuits + fixtures
      (drive off conditioned sqft + bedrooms)
- [ ] `stub-hvac-ducted` — single instance per system; size from
      conditioned sqft (tonnage = sqft / 500)
- [ ] `stub-kitchen-cabinetry` — one instance (linear feet from
      kitchen room dimensions if surfaced, fallback to ~25 LF)
- [ ] `stub-countertops` — kitchen + bath count, ~60 SF each
- [ ] `stub-bath-suite` — one instance per full bath + half bath
- [ ] `stub-appliance-allowance` — kitchen fixture count
- [ ] `stub-site-work` — perimeter × clearing factor
- [ ] `stub-septic-system` — only when foundation is rural / no
      municipal sewer flagged

Expected impact: estimate jumps from $265K → ~$900K-$1.1M, putting
us in the right zone (the rest is GC overhead + profit + soft
costs).

## High priority (worth tracking down)

- [x] **Second-floor joist count formula.** ✅ 2026-05-28 — new
  "Joist Buffer" property on stub-floor-2x10-16oc. Converter
  back-solves it from `floor_joist_count_estimated` when the
  architect schedule is surfaced (clamped 1.0–3.5 so misreads
  can't blow up the line); falls back to 1.5 for first floors
  and 1.8 for second floors when no architect count is available.
  Second-floor default raised from 1.5 → 1.8 to reflect bearing-
  wall pickup + stair-opening headers that custom plans
  consistently spec heavier than first-floor framing.

- [x] **Interior door count + pocket door handling.** ✅ 2026-05-28
  — added `interior_doors_estimated` + `pocket_doors_estimated`
  to the extraction prompt with explicit count rules and
  anti-rules; converter now uses the architect count when
  surfaced and falls back to the bedrooms+baths heuristic only
  when extraction is silent. Pocket doors split into their own
  instance via the new pocket-door variant on stub-door-interior
  (+50% on unit cost for in-wall frame + soft-close hardware).

- [x] **Garage door count when ≥ 2 doors.** ✅ 2026-05-28 — door
  count now derives from `garage_sqft` + `garage_cars`: 2-car
  plans with ≥ 600 SF garage produce 2 single openings (the
  common attached-garage layout), tight 2-car garages stay as
  one 16' double, 3+ cars get a double + single.

- [x] **CMU foundation block overcount.** ✅ 2026-05-28 — pier
  block multiplier dropped 5 → 2 to match residential
  crawl-space pier heights. Maddox cross-check: 73 piers × 5 =
  365 blocks vs architect 73; new 2× lands at 146 (splits the
  difference for taller mid-span piers).

## Medium priority

- [x] **Roof sheathing geometric overshoot.** ✅ 2026-05-28 —
  when `porch_sqft > 0`, run dimension trims 4.2% so the
  assembly's 1.20 multiplier lands at pure pitch (1.15). The
  eave-overhang portion of 1.20 was double-counting porch area.

- [x] **Garage slab as separate concrete pour.** ✅ 2026-05-28
  — converter emits a separate `stub-slab-on-grade` instance
  sized for the garage (1.2:1 from `garage_sqft`) on crawl /
  basement plans when `garage_sqft > 100`.

- [x] **Sill plate + termite shield + sand fill.** ✅ 2026-05-28
  — added as perimeter-scaled (sill + shield) and floor-area-
  scaled (sand) materials on `stub-cmu-foundation-wall`. Sand
  fill gated on a new Crawl Floor Area property; the converter
  sets it only when foundation type is crawl.

- [x] **Fascia / soffit / drip edge / ridge vent.** ✅ 2026-05-28
  — new `stub-exterior-trim` assembly emitting fascia (LF),
  vented soffit (SF), drip edge (LF), and continuous ridge vent
  (LF). Converter sets Eave LF = perimeter × 1.5 (median custom
  roof) and Ridge LF = perimeter × 0.5 by default. Builders edit
  per project; the assembly rolls up to Barry's #44 EXTERIOR
  DETAILS. Maddox cross-check: previous gap = ~$8K missing
  scope, now within architect tolerance after builder edits the
  default Eave LF up to ~2.5× perimeter for hip-with-dormer
  plans.

- [x] **Gable wall framing as a distinct quantity.** ✅ 2026-05-28
  — new "Gable Wall LF" property on `stub-ext-wall-2x6-16oc`
  drives gable studs (LF-sold because lengths taper), rake
  plates, and gable sheathing. Converter sets it from
  short-side width × 6/12-pitch height × 2 gable ends on the
  top story; builders adjust per project. Removes the +15%
  fudge factor that was previously baked into the main OSB
  formula.

- [x] **Stone veneer accent.** ✅ 2026-05-28 — new "Stone Veneer
  Accent Area" property on `stub-siding` with a dedicated $14/SF
  material + $12/SF labor line, gated to roll up to Barry's #42
  STONE category instead of the parent siding's #43. Converter
  scans `notable_features` for "stone" and sets a 80 SF baseline
  when flagged; builders adjust per project.

## Lower priority (small dollars / edge cases)

- [ ] **Drywall tape as standalone line.** Architects spell out
  total joint tape footage; our catalog bundles it into the
  drywall sheet line. Cosmetic, not a real cost gap.

- [x] **Floor insulation under first-floor I-joists.** ✅ 2026-05-28
  — new "Floor Insulation Area" property on stub-floor-2x10-16oc
  with an R-19 batt material line gated on it. Converter sets the
  area to first-floor framing footprint when foundation is crawl;
  basements and slabs produce no insulation line.

- [ ] **Drywall sheet size: 4×8 vs 4×12.** Architects use 4×12
  for 9'+ ceilings. Sheet counts differ but cost per SF is the
  same. Mostly visual mismatch in cross-checks; doesn't change
  $.

- [ ] **PSL beams as distinct material from LVL.** Porch beams
  are often PSL (parallel strand) which costs ~10-15% more than
  LVL. Catalog has a PSL preset on stub-lvl-beam-package; the
  porch-system generator could use it instead of LVL for porch
  beams.

- [x] **Column corbels.** ✅ 2026-05-28 — added as a per-column
  material line on stub-porch-system. Defaults 1:1 with column
  count; builders zero out when the design is clean/contemporary.

- [x] **Window count on grouped units.** ✅ 2026-05-28 — extraction
  prompt now spells out grouped-callout rules ("(2) 2'-8"×5'-0"" =
  2 windows, count separate sashes in bay/bow units, don't count
  panes within a mullioned sash), prefers the schedule total over
  visual counting, and includes a "< 15 on a 3+ bedroom custom"
  sanity check.

## Schema additions (would help all of the above)

- [x] `pocket_doors_estimated: number | null` ✅ 2026-05-28
- [x] `garage_doors_estimated: number | null` ✅ 2026-05-28 —
      converter prefers the architect count when surfaced, falls
      back to the cars + garage footprint heuristic.
- [x] `stone_veneer_sqft: number | null` ✅ 2026-05-28 — converter
      prefers the labeled SF, falls back to the notable_features
      keyword scan + 80 SF default.
- [x] `floor_joist_count_estimated: number | null` ✅ 2026-05-28 —
      drives the Joist Buffer multiplier on stub-floor-2x10-16oc.
- [x] `roof_type: "gable" | "hip" | "gable+hip" | "complex" | null`
  ✅ 2026-05-28 — drives eave/ridge LF scaling for drainage + trim
- [x] `roof_pitch_in_12: number | null` ✅ 2026-05-28 — drives
  gable-wall height + (future) roof-area scaling

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
