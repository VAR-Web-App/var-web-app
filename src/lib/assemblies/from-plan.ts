/**
 * Convert a PlanExtraction into a starter set of AssemblyInstance
 * records. Each instance ships with property values filled from the
 * extraction so the builder lands on a working estimate in one click —
 * then live-edits properties at the kitchen table as decisions firm up.
 *
 * Heuristics (kept transparent so they're easy to tune later):
 *   - Footprint perimeter ≈ 2*(length + width) — drives wall LF, eave LF,
 *     siding area, gutter run.
 *   - Wall height parsed from ceiling_heights string; defaults to 9'.
 *   - Foundation type string → slab vs strip footing assembly.
 *   - Window/door counts straight from the extraction; sizes default.
 *   - Interior door count = bedrooms*2 + baths + 3 (closets, mech, laundry).
 *   - Stairs created when stories > 1.
 *   - Garage door created when garage_cars > 0 (1 door for 1-2 cars; 2 for 3+).
 *   - Hardwood flooring assumes total - garage - porch - baths (rough).
 *
 * Output is *suggestions*. Builder reviews + edits in the panel; the
 * extractor button calls this and the panel handles the rest.
 */

import { activeVariantOf, type AssemblyInstance } from "@/types/assembly";
import type { QuoteLine } from "@/types";
import { findStubAssembly } from "./stub-catalog";
import { computeMaterials } from "./compute";

interface PlanInput {
  total_sqft: number | null;
  first_floor_sqft: number | null;
  second_floor_sqft: number | null;
  bonus_sqft: number | null;
  porch_sqft: number | null;
  garage_sqft: number | null;
  garage_cars: number | null;
  /** Overhead garage door count when the architect labels it.
   *  Drives the garage door instance directly when present — the
   *  car-count + footprint heuristic is the fallback. */
  garage_doors_estimated?: number | null;
  /** Architect-labeled stone-veneer accent area, in SF. When
   *  present, fed straight into the siding assembly's Stone
   *  Veneer Accent Area property. */
  stone_veneer_sqft?: number | null;
  /** Architect-listed total floor joist count, when surfaced from
   *  the framing schedule. Custom plans bin joists by length so a
   *  uniform-length formula always undersells — using the printed
   *  count when available is far more reliable. */
  floor_joist_count_estimated?: number | null;
  bedrooms: number | null;
  full_baths: number | null;
  half_baths: number | null;
  footprint_dimensions: string | null;
  /** First-floor heated/cooled dimensions, no porch/garage. Used for
   *  floor framing + interior partition LF instead of the overall
   *  envelope. Optional — falls back to first_floor_sqft synthesis. */
  conditioned_footprint_dimensions?: string | null;
  /** Architect-labeled total roof finish area. Used directly when
   *  present; falls back to footprint × pitch math otherwise. */
  roof_area_sqft?: number | null;
  /** Primary roof shape. Drives eave/ridge LF scaling for the trim
   *  + drainage assemblies; null falls back to "complex" (safer
   *  default for unknown custom plans). */
  roof_type?: "gable" | "hip" | "gable+hip" | "complex" | null;
  /** Primary pitch in 12ths (e.g. 8 for "8/12"). When present, the
   *  converter uses it for gable-wall height + roof-area scaling
   *  instead of the 6/12 fallback. */
  roof_pitch_in_12?: number | null;
  stories: number | null;
  foundation_type: string | null;
  exterior_wall_type: string | null;
  ceiling_heights: string | null;
  doors_windows: {
    exterior_doors_estimated: number | null;
    /** All interior doors including pocket doors. When present, the
     *  converter uses it directly instead of the rooms heuristic
     *  (which has historically undercounted by 50-70% on custom
     *  plans because architects spec closet, mech, and utility
     *  doors that don't fall out of bedroom/bath math). */
    interior_doors_estimated?: number | null;
    /** Subset of interior_doors_estimated representing pocket /
     *  sliding-into-wall doors. Triggers the pocket-door variant on
     *  the interior door assembly so the cost surcharge applies. */
    pocket_doors_estimated?: number | null;
    windows_estimated: number | null;
  };
  /** Plain-English flags Claude surfaces (e.g. "metal roof", "vaulted
   *  living room ceiling"). The converter scans these to set roof
   *  finish defaults — the only programmatic use today, but more
   *  feature-detection can hang off this without schema changes. */
  notable_features?: string[];
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `inst_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/** Parse "68' × 42'" or "68 x 42" → { length: 68, width: 42 }. */
function parseFootprint(s: string | null): { length: number; width: number } | null {
  if (!s) return null;

  // Two forms come up in extractions:
  //   1. Plain decimal:  "72 x 82"  /  "72.5 × 82.5"  /  "72' × 82'"
  //   2. Architect feet-and-inches: "72'-9\" × 82'-7\""  (or curly quotes,
  //      em-dash variants, etc.)
  //
  // The old regex stopped at the first foot mark and couldn't reach the
  // × separator when inches were present, so it returned null on the
  // architect form. That silently killed roof/gutters/floor-framing
  // generation downstream (all gated on a non-null footprint).

  // Try the rich form first: capture feet AND optional inches on both sides.
  const richMatch = s.match(
    /(\d+(?:\.\d+)?)\s*['′]?\s*(?:[-–]?\s*(\d+(?:\.\d+)?)\s*["″])?\s*[x×]\s*(\d+(?:\.\d+)?)\s*['′]?\s*(?:[-–]?\s*(\d+(?:\.\d+)?)\s*["″])?/i,
  );
  if (richMatch) {
    const lFeet = parseFloat(richMatch[1]);
    const lInches = richMatch[2] ? parseFloat(richMatch[2]) : 0;
    const wFeet = parseFloat(richMatch[3]);
    const wInches = richMatch[4] ? parseFloat(richMatch[4]) : 0;
    const length = lFeet + lInches / 12;
    const width = wFeet + wInches / 12;
    if (Number.isFinite(length) && Number.isFinite(width) && length > 0 && width > 0) {
      return { length, width };
    }
  }

  // Fall back to the simple form (also catches edge cases the rich regex
  // might miss if Claude returns something unusual).
  const simple = s.match(/(\d+(?:\.\d+)?)\s*['′]?\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!simple) return null;
  const length = parseFloat(simple[1]);
  const width = parseFloat(simple[2]);
  if (!Number.isFinite(length) || !Number.isFinite(width)) return null;
  return { length, width };
}

/** Parse "10' main, 9' second" → { firstFloor: 10, secondFloor: 9 }. */
function parseCeilingHeights(s: string | null): {
  firstFloor: number;
  secondFloor: number;
} {
  const fallback = { firstFloor: 9, secondFloor: 9 };
  if (!s) return fallback;
  // Look for the first number — that's the main/first floor height.
  const allNums = Array.from(s.matchAll(/(\d+(?:\.\d+)?)/g)).map((m) =>
    parseFloat(m[1]),
  );
  const first = allNums[0];
  const second = allNums[1] ?? first;
  return {
    firstFloor: Number.isFinite(first) && first > 6 ? first : 9,
    secondFloor: Number.isFinite(second) && second > 6 ? second : 9,
  };
}

/** Pick foundation assembly id from the free-text foundation type. */
function detectFoundationAssemblyId(s: string | null): string {
  const lower = (s ?? "").toLowerCase();
  if (lower.includes("slab")) return "stub-slab-on-grade";
  // Basement and crawl both use strip footings (CMU foundation wall sits
  // on top — generated as a separate assembly below).
  return "stub-footing-strip";
}

/** True when the foundation has a CMU stem wall / basement wall sitting
 *  on the strip footing. Crawl spaces and full basements both use CMU
 *  in this region; slab-on-grade doesn't. */
function hasCmuFoundationWall(s: string | null): boolean {
  const lower = (s ?? "").toLowerCase();
  return (
    !lower.includes("slab") &&
    (lower.includes("crawl") ||
      lower.includes("basement") ||
      lower.includes("cmu") ||
      lower.includes("block"))
  );
}

/** Approximate CMU foundation wall height by foundation type. Crawls are
 *  typically 4'; basements run 8' standard. We accept the architect's
 *  printed value when Claude surfaces it via foundation_type. */
function inferFoundationWallHeight(s: string | null): number {
  const lower = (s ?? "").toLowerCase();
  if (lower.includes("basement")) return 8;
  if (lower.includes("crawl")) return 4;
  return 4; // safest default for residential
}

/** Detect 2×6 vs 2×4 from the free-text exterior wall description. */
function detectExteriorWallAssemblyId(s: string | null): string {
  const lower = (s ?? "").toLowerCase();
  if (lower.includes("2x4") || lower.includes("2×4")) {
    // Catalog doesn't ship an exterior 2×4 today; fall back to 2×6.
    return "stub-ext-wall-2x6-16oc";
  }
  return "stub-ext-wall-2x6-16oc";
}

/** Pull the default value off the catalog for a given property name. */
function catalogDefault(assemblyId: string, propName: string): number {
  const a = findStubAssembly(assemblyId);
  if (!a) return 0;
  const p = a.properties.find((x) => x.name === propName);
  return p?.defaultValue ?? 0;
}

/** Round a property value to the precision a builder actually reads.
 *  Dimensional / count properties round to whole units; cubic / time /
 *  liquid UoMs keep 1 decimal; option-multiplier properties (unitless)
 *  pass through unchanged. Mirrors the rounding rules computeMaterials
 *  applies to formula output — the synthesizer was leaving long
 *  decimals like "60.84738095..." in property bags it generated. */
function roundPropertyValue(uom: string, value: number): number {
  if (!Number.isFinite(value)) return 0;
  const upper = (uom || "").toUpperCase();
  if (upper === "" || upper === "%") {
    // Multiplier / unitless property — likely a 1.0 / 1.4 / 2.2 option
    // value. Don't touch.
    return value;
  }
  if (
    upper === "CY" ||
    upper === "GAL" ||
    upper === "TON" ||
    upper === "HR" ||
    // FT preserves fractional feet for properties like Soffit Width
    // (typical residential is 1.5 ft = 18" overhang). Rounding 1.5 to
    // 2 was overshooting soffit by 33% on the Cnadd cross-check.
    upper === "FT"
  ) {
    return Math.round(value * 10) / 10;
  }
  return Math.round(value);
}

/** Build a property bag with overrides on top of the assembly defaults. */
function propValues(
  assemblyId: string,
  overrides: Record<string, number>,
): { name: string; value: number }[] {
  const a = findStubAssembly(assemblyId);
  if (!a) return [];
  return a.properties.map((p) => {
    const raw =
      overrides[p.name] != null ? overrides[p.name] : (p.defaultValue ?? 0);
    return {
      name: p.name,
      value: roundPropertyValue(p.uom, raw),
    };
  });
}

function makeInstance(
  assemblyId: string,
  instanceLabel: string,
  overrides: Record<string, number>,
): AssemblyInstance | null {
  const a = findStubAssembly(assemblyId);
  if (!a) return null;
  // Plan-extraction-generated instances start with a single variant — the
  // builder can add alternatives from the card UI later. The variant's
  // label defaults to the assembly's name so the chip looks meaningful
  // out of the gate. source: "plan" tags this instance so a future
  // smart-replace knows to wipe it (vs. preserving manual additions).
  const variantId = newId();
  return {
    id: newId(),
    instanceLabel,
    source: "plan",
    variants: [
      {
        id: variantId,
        label: a.name,
        assemblyId,
        propertyValues: propValues(assemblyId, overrides),
      },
    ],
    activeVariantId: variantId,
  };
}

export function instancesFromPlan(
  extraction: PlanInput,
): AssemblyInstance[] {
  const out: AssemblyInstance[] = [];

  const parsedFootprint = parseFootprint(extraction.footprint_dimensions);
  const stories = Math.max(1, extraction.stories ?? 1);
  const ceilings = parseCeilingHeights(extraction.ceiling_heights);

  // First-floor footprint area — fall back to total/stories if unparseable.
  const firstFloorSqft =
    extraction.first_floor_sqft ??
    (parsedFootprint ? parsedFootprint.length * parsedFootprint.width : null) ??
    (extraction.total_sqft ? extraction.total_sqft / stories : 1500);

  // Overall building footprint = first-floor heated area + porch slab
  // + garage pad. Same problem as the conditioned footprint: Claude's
  // footprint_dimensions reading is volatile — Cnadd cross-check
  // showed round 5 returning 295 LF perimeter and round 6 returning
  // 369 LF perimeter on the SAME plan, which made roof/wall/sheathing
  // quantities swing 64% between runs. Anchor area to the sum of the
  // authoritative sqft numbers (first floor + porch + garage), use
  // the parsed dimensions for the length:width RATIO only.
  //
  // When parsed area is within 20% of the expected envelope, trust
  // it as-is (Claude got both length and width right). Otherwise
  // re-derive the rectangle to match the expected area.
  const expectedEnvelopeArea =
    firstFloorSqft +
    (extraction.porch_sqft ?? 0) +
    (extraction.garage_sqft ?? 0);
  const parsedEnvelopeArea = parsedFootprint
    ? parsedFootprint.length * parsedFootprint.width
    : null;
  const envelopeAgrees =
    parsedEnvelopeArea != null &&
    expectedEnvelopeArea > 0 &&
    Math.abs(parsedEnvelopeArea - expectedEnvelopeArea) /
      expectedEnvelopeArea <
      0.2;
  const footprint = envelopeAgrees
    ? parsedFootprint!
    : (() => {
        const ratio = parsedFootprint
          ? parsedFootprint.length / parsedFootprint.width
          : 1.4;
        const safeArea = expectedEnvelopeArea > 0 ? expectedEnvelopeArea : firstFloorSqft;
        const width = Math.sqrt(safeArea / ratio);
        return { length: width * ratio, width };
      })();

  const perimeter = 2 * (footprint.length + footprint.width);

  // Foundation perimeter is DIFFERENT from building envelope perimeter
  // on most custom plans — the foundation wall wraps just the heated /
  // cooled space, while the building envelope adds porch slab + garage
  // pad that sit on their own footings.
  //
  // first_floor_sqft is the AUTHORITATIVE area number — Claude reads
  // it off the architect's printed sqft summary and gets it right ~95%
  // of the time. conditioned_footprint_dimensions is trickier because
  // Claude sometimes returns the OVERALL building dimensions when no
  // dedicated conditioned-area callout exists. Cnadd round 3 cross-
  // check: Claude returned "67' × 77'" (5159 SF) when the actual
  // conditioned first floor is ~3000 SF, blowing first-floor subfloor
  // 70% over.
  //
  // Fix: always anchor to first_floor_sqft for the AREA. Use the parsed
  // dimensions only for the length:width RATIO. When the parsed area
  // is within 20% of first_floor_sqft, trust the dimensions as-is.
  const conditionedParsed = parseFootprint(
    extraction.conditioned_footprint_dimensions ?? null,
  );
  const parsedArea = conditionedParsed
    ? conditionedParsed.length * conditionedParsed.width
    : null;
  const dimsAgreeWithSqft =
    parsedArea != null &&
    Math.abs(parsedArea - firstFloorSqft) / firstFloorSqft < 0.2;
  const conditionedFootprint = dimsAgreeWithSqft
    ? conditionedParsed!
    : (() => {
        // Use parsed ratio if available (rectangle shape hint), else
        // default to 1.4:1 — typical residential aspect ratio.
        const ratio = conditionedParsed
          ? conditionedParsed.length / conditionedParsed.width
          : 1.4;
        const width = Math.sqrt(firstFloorSqft / ratio);
        return { length: width * ratio, width };
      })();
  const foundationPerimeter =
    2 * (conditionedFootprint.length + conditionedFootprint.width);

  // ── Foundation ────────────────────────────────────────────────
  const fdnId = detectFoundationAssemblyId(extraction.foundation_type);
  const cmuWall = hasCmuFoundationWall(extraction.foundation_type);
  if (fdnId === "stub-slab-on-grade") {
    out.push(
      makeInstance(fdnId, "Foundation — slab on grade", {
        "Slab Length": conditionedFootprint.length,
        "Slab Width": conditionedFootprint.width,
        "Slab Thickness": catalogDefault(fdnId, "Slab Thickness"),
      })!,
    );
  } else {
    // Strip footing runs under exterior CMU walls AND under interior
    // bearing walls (center beam line, partition picking up second-
    // floor load), under porch slab edge, under garage perimeter, and
    // at every plumbing/mech room footing pad. Cnadd round 4 cross-
    // check vs Maddox: architect's effective footing perimeter is
    // ~2.0× the conditioned exterior perimeter. 1.6× is the working
    // middle ground — matches Maddox's 26 CY when applied to a 229 LF
    // conditioned perimeter, while staying within reason on simpler
    // single-story slab plans.
    //
    // Heavier footing dims when a CMU wall (and pier loads) sit on
    // top: default 16×8 is sized for stick-frame on slab; CMU +
    // 2-story stick framing needs 24×12 to hit typical residential
    // bearing capacity.
    const footingLength = Math.round(foundationPerimeter * 1.6);
    const footingWidth = cmuWall ? 24 : catalogDefault(fdnId, "Footing Width");
    const footingDepth = cmuWall ? 12 : catalogDefault(fdnId, "Footing Depth");
    out.push(
      makeInstance(fdnId, "Foundation — strip footing", {
        "Footing Length": footingLength,
        "Footing Width": footingWidth,
        "Footing Depth": footingDepth,
      })!,
    );
  }

  // Separate garage slab pour. On crawl-space / basement plans, the
  // main house sits on a foundation wall but the attached garage still
  // has a concrete slab floor — a distinct concrete pour that's almost
  // always missing from auto-generated estimates. Skip when the main
  // foundation IS slab-on-grade (the garage area is already in the
  // main slab) or when the garage is too small to matter.
  const garageSqftForSlab = extraction.garage_sqft ?? 0;
  if (fdnId !== "stub-slab-on-grade" && garageSqftForSlab > 100) {
    // Default garage proportions ~ 1.2:1 (wider than deep for a 2-car).
    const gWidth = Math.sqrt(garageSqftForSlab / 1.2);
    const gLength = gWidth * 1.2;
    out.push(
      makeInstance("stub-slab-on-grade", "Garage slab on grade", {
        "Slab Length": gLength,
        "Slab Width": gWidth,
        "Slab Thickness": catalogDefault("stub-slab-on-grade", "Slab Thickness"),
      })!,
    );
  }

  // CMU foundation wall on top of the strip footing — crawl spaces and
  // basements both have this and it's a large material line (1,000+
  // blocks on a typical 2,500 SF house). Slab-on-grade doesn't.
  if (cmuWall) {
    // Pier count scales with footprint area. The IRC ceiling is 8 LF
    // between piers on perimeter walls + similar spacing on center
    // beams, which works out to about 1 pier per 180 SF on a typical
    // crawl-space layout (was 1/250, which the Cnadd cross-check
    // showed was halving the architect count). 2-story plans get
    // +30% for second-story beam pickup.
    const piers = Math.max(
      4,
      Math.round((firstFloorSqft / 180) * (stories > 1 ? 1.3 : 1)),
    );
    // Sand fill applies only to crawl-space foundations — basements have
    // a slab floor instead. The assembly's sand fill line is gated on
    // this property being > 0, so basements naturally produce no sand
    // line. Approximate floor area = first-floor footprint.
    const isCrawl =
      (extraction.foundation_type ?? "").toLowerCase().includes("crawl");
    const crawlFloorArea = isCrawl ? Math.round(firstFloorSqft) : 0;
    // CMU wall length runs ~15% longer than the conditioned perimeter
    // alone — covers the slab-edge turn-down where the foundation
    // wraps under the garage / mudroom step-down + minor jogs at
    // attached masses. Cnadd round 7 cross-check: conditioned
    // perimeter = 229 LF, architect CMU blocks imply ~265 LF wall
    // length (×1.16). 1.15 closes the gap on CMU blocks (-13%),
    // sill plate (-10%), and termite shield (-8%) in one move.
    const cmuWallLength = Math.round(foundationPerimeter * 1.15);
    out.push(
      makeInstance("stub-cmu-foundation-wall", "Foundation wall — CMU block", {
        "Wall Length": cmuWallLength,
        "Wall Height": inferFoundationWallHeight(extraction.foundation_type),
        "Pier Count": piers,
        "Crawl Floor Area": crawlFloorArea,
      })!,
    );
  }

  // Floor framing dimensions: reuse the conditioned footprint we parsed
  // above for the foundation. Same rationale — first-floor framing
  // covers the heated/cooled space, not the porch slab or garage pad.
  const framingLength = conditionedFootprint.length;
  const framingWidth = conditionedFootprint.width;

  // Back-solve the Joist Buffer property from the architect joist
  // count when one is surfaced. The assembly formula is
  //   joist_count = Floor Length × (12 / Joist Spacing) × Joist Buffer
  // so Joist Buffer = arch_count / (Floor Length × 12 / Joist Spacing).
  // When no architect count is given, second floors get a higher
  // default buffer (1.8) than first floors (1.5) because second-
  // floor framing carries more bearing-wall pickup and stair
  // openings — Maddox cross-check showed architect-spec
  // second-floor counts run ~2× the first-floor / spacing math
  // while first-floor counts land near 1.5×.
  const archJoistCount = extraction.floor_joist_count_estimated;
  function joistBufferFor(floorLength: number, spacing: number, defaultBuffer: number): number {
    if (archJoistCount && archJoistCount > 0) {
      const implied = archJoistCount / ((floorLength * 12) / spacing);
      // Clamp between 1.0 and 3.5 so a misread architect number
      // can't blow up the line.
      return Math.min(3.5, Math.max(1.0, implied));
    }
    return defaultBuffer;
  }

  // ── First-floor framing (over any non-slab foundation) ──────────
  // Slab-on-grade IS the first floor, so no joists needed. Crawl spaces
  // and basements need full floor framing sitting on the foundation
  // wall — this is a large I-joist / dimensional lumber line item the
  // converter used to silently skip on single-story crawl-space builds.
  if (fdnId !== "stub-slab-on-grade") {
    // R-19 batt insulation between joists from below — only meaningful
    // on crawl-space foundations (no conditioned basement underneath).
    // Basements heat-bridge so the architect typically skips this line.
    const isCrawlFloor =
      (extraction.foundation_type ?? "").toLowerCase().includes("crawl");
    const floorInsulationArea = isCrawlFloor
      ? Math.round(framingLength * framingWidth)
      : 0;
    out.push(
      makeInstance("stub-floor-2x10-16oc", "Floor system — first floor", {
        "Floor Length": framingLength,
        "Floor Width": framingWidth,
        "Joist Spacing": 16,
        "Floor Insulation Area": floorInsulationArea,
        "Joist Buffer": joistBufferFor(framingLength, 16, 1.8),
      })!,
    );
  }

  // ── Second-floor framing (still gated on stories > 1) ─────────
  // Sanity check second_floor_sqft against the other extraction
  // numbers. Claude sometimes returns a too-small value when the
  // plan only labels first-floor sqft prominently — but if it got
  // total_sqft and first_floor_sqft right, we can back-derive a
  // floor that the architect's totals must imply:
  //   derived = total - first_floor - bonus
  // Take the max so we never UNDERSHOOT the architect's totals
  // (the formulas all scale linearly with area; overshoot is the
  // builder's friend, undershoot blows the build budget).
  // Cnadd cross-check: extraction returned ~1500 SF when totals
  // implied ~2400 SF, shorting the second-floor subfloor by 40%.
  if (stories > 1) {
    const totalSqftSurfaced = extraction.total_sqft ?? 0;
    const firstFloorSurfaced = extraction.first_floor_sqft ?? 0;
    const bonusSurfaced = extraction.bonus_sqft ?? 0;
    const derivedSecond = Math.max(
      0,
      totalSqftSurfaced - firstFloorSurfaced - bonusSurfaced,
    );
    const secondFloorSqft = Math.max(
      extraction.second_floor_sqft ?? 0,
      derivedSecond,
      // 0.80 fallback (was 0.60) — Maddox cross-check confirmed second
      // floors on Maddox-class custom plans run ~85% of first-floor
      // area. 0.60 was undershooting subfloor + framing by 25%+.
      firstFloorSqft * 0.8,
    );
    const w2 = Math.sqrt(secondFloorSqft / 1.4);
    const l2 = w2 * 1.4;
    out.push(
      makeInstance("stub-floor-2x10-16oc", "Floor system — second floor", {
        "Floor Length": l2,
        "Floor Width": w2,
        "Joist Spacing": 16,
        // 2.0 default for second floors — beam pickup + stair
        // openings + headers run higher than first-floor math.
        // First floor at 1.8, second at 2.0 — matches the architect-
        // count pattern on the Maddox cross-check after my heuristic
        // bumps.
        "Joist Buffer": joistBufferFor(l2, 16, 2.0),
      })!,
    );
  }

  // ── Exterior walls per story ──────────────────────────────────
  const extWallId = detectExteriorWallAssemblyId(extraction.exterior_wall_type);
  const wallHeights = [ceilings.firstFloor, ceilings.secondFloor].slice(
    0,
    stories,
  );
  // Gable wall framing lives only on the TOP story (the gable triangle
  // sits above the eave plate at every gable end). Architect-counted
  // pitch (when surfaced) drives gable height; falls back to 6/12.
  // Roof type drives the number of gable ends:
  //   - "gable" / "complex" → 2 (the two short-side ends)
  //   - "gable+hip" → 1 (only the gable-end portion)
  //   - "hip" → 0 (hip roofs have no gable ends)
  const shortSide = Math.min(footprint.length, footprint.width);
  const pitchRise = extraction.roof_pitch_in_12 ?? 6;
  const pitchFactor = pitchRise / 12; // 0.5 for 6/12, 0.67 for 8/12, 1.0 for 12/12
  const gableHeightPerEnd = (shortSide / 2) * pitchFactor;
  // When Claude doesn't surface roof_type, default to "gable+hip"
  // — that's the most common shape on custom residential plans
  // (a hip main mass with one or two gable accents over the great
  // room or porch). "complex" was too aggressive a default and
  // was overshooting eave/ridge LF by 30-50% on simpler plans.
  const roofType = extraction.roof_type ?? "gable+hip";
  const gableEndCount =
    roofType === "hip" ? 0
    : roofType === "gable+hip" ? 1
    : 2; // "gable" or "complex"
  const gableLfTotal = Math.round(shortSide * gableHeightPerEnd * gableEndCount);
  wallHeights.forEach((h, idx) => {
    const isTopStory = idx === wallHeights.length - 1;
    out.push(
      makeInstance(
        extWallId,
        stories > 1
          ? `Exterior walls — ${idx === 0 ? "first" : idx === 1 ? "second" : `floor ${idx + 1}`} floor`
          : "Exterior walls",
        {
          "Wall Length": perimeter,
          "Wall Height": h,
          "Stud Spacing": 16,
          // Only the top story gets gable framing — lower stories
          // are rectangular under the next floor system.
          "Gable Wall LF": isTopStory ? gableLfTotal : 0,
        },
      )!,
    );
  });

  // ── Interior walls (one bundled instance) ────────────────────
  // Rough heuristic: total interior wall LF × wall_height ≈ heated
  // sqft × interior_wall_density. Cnadd cross-check vs Maddox spec:
  // 0.9 density was undercounting interior 2×4 studs by 28% (401 vs
  // architect 560). 1.25 lands in the architect-tolerance band on
  // custom plans with more closets, en-suites, walk-ins, and powder
  // baths than tract builds. Builder still adjusts per project from
  // the assembly card.
  const totalSqft = extraction.total_sqft ?? firstFloorSqft * stories;
  const avgWallHeight =
    wallHeights.reduce((s, h) => s + h, 0) / Math.max(1, wallHeights.length);
  const interiorWallLF = Math.round((totalSqft * 1.25) / avgWallHeight);
  out.push(
    makeInstance("stub-int-wall-2x4-16oc", "Interior walls (estimated)", {
      "Wall Length": interiorWallLF,
      "Wall Height": avgWallHeight,
      "Stud Spacing": 16,
    })!,
  );

  // ── Roof (single instance covering the whole footprint) ──────
  // If the architect labeled total roof finish area on the plan,
  // honor it — back-derive Roof Run × Width that produce that area
  // after the assembly's pitch multiplier. Otherwise fall back to
  // footprint × built-in pitch math. The labeled-value path is the
  // most accurate read we can get; the calc path is the working
  // baseline when no label exists.
  let roofRun: number;
  let roofWidth: number;
  // The assembly's roof formula is hardcoded to area × 1.20 (which
  // approximates a 6/12 pitch + 5% eave buffer). Real geometry:
  //   pitch_factor = sqrt(1 + (rise/12)^2)
  // For 6/12: 1.118, 8/12: 1.20, 10/12: 1.30, 12/12: 1.41. Plus
  // ~10% for eave overhangs. Plus a roof-type bonus for complex
  // roofs where dormers / valleys / cross-gables add area the bare
  // footprint × pitch calc misses.
  //
  // Default pitch 8/12 = de facto modern custom standard.
  // Roof-type bonuses calibrated against Cnadd architect spec on
  // Maddox: anchored footprint × 1.65 lands at 248 sheets (exact).
  // With pitch factor 1.20 and eave buffer 1.10, that's a 1.25
  // bonus for "complex".
  const pitchForRoof = extraction.roof_pitch_in_12 ?? 8;
  const pitchFactorReal = Math.sqrt(1 + (pitchForRoof / 12) ** 2);
  let roofShapeBonus: number;
  switch (roofType) {
    case "gable":
      roofShapeBonus = 1.0;
      break;
    case "hip":
      roofShapeBonus = 1.08;
      break;
    case "gable+hip":
      roofShapeBonus = 1.18;
      break;
    case "complex":
    default:
      // Custom plans land here. Cnadd round 9 (proper overall
      // envelope anchor in place + Soffit Width rounding fix)
      // showed 1.40 bonus overshooting architect 248 by +20%.
      // 1.20 brings target multiplier to 1.20 × 1.10 × 1.20 = 1.58,
      // which lands near architect within ±5% on the anchored
      // envelope. Was 1.40, which was tuned against an under-
      // anchored envelope in round 7.
      roofShapeBonus = 1.20;
      break;
  }
  const targetRoofMultiplier = pitchFactorReal * 1.10 * roofShapeBonus;
  const roofScaleFactor = targetRoofMultiplier / 1.20;

  if (extraction.roof_area_sqft && extraction.roof_area_sqft > 0) {
    // Architect-labeled roof area — back-derive Run × Width that produces
    // it after the assembly's 1.20 multiplier (no further scaling needed,
    // architect's number is authoritative).
    const projectedRoofArea = extraction.roof_area_sqft / 1.20;
    roofWidth = Math.sqrt(projectedRoofArea / 1.4);
    roofRun = roofWidth * 1.4;
  } else {
    roofRun = Math.max(footprint.length, footprint.width);
    roofWidth = Math.min(footprint.length, footprint.width);
    // Apply the pitch correction. Roof Run × Roof Width × 1.20 in the
    // assembly = footprint area × 1.20 (hardcoded). We want footprint
    // area × targetRoofMultiplier instead, so scale Roof Run by ratio.
    roofRun = roofRun * roofScaleFactor;
  }
  // Detect metal-roof or tile spec from notable_features so the
  // unit cost matches the architect-spec'd finish rather than the
  // architectural-shingles default.
  const featuresJoined = (extraction.notable_features ?? []).join(" ").toLowerCase();
  let roofFinish = 1.4; // architectural shingles default
  if (featuresJoined.includes("standing seam") || featuresJoined.includes("metal roof") || featuresJoined.includes("metal panel")) {
    roofFinish = 3.2;
  } else if (featuresJoined.includes("concrete tile") || featuresJoined.includes("clay tile") || featuresJoined.includes("spanish tile")) {
    roofFinish = 4.5;
  }
  out.push(
    makeInstance("stub-roof-2x8-16oc", "Roof system", {
      "Roof Run": roofRun,
      "Roof Width": roofWidth,
      "Rafter Spacing": 16,
      "Roof Finish": roofFinish,
    })!,
  );

  // ── Ceiling drywall (top floor only — between floors is handled by
  // the floor-framing assembly's subfloor and the floor-below's wall
  // drywall). Single instance with Wall Area = 0 so only ceiling area
  // gets billed.
  //
  // Apply the same sanity check we use for second-floor framing:
  // Claude undershot second_floor_sqft on the Cnadd run, which would
  // short ceiling insulation by 40%+. Take the max of the surfaced
  // value, the value implied by total/first/bonus totals, and 85% of
  // first-floor area (most 2-story setbacks are at most 15%).
  const topCeilingSqft = stories > 1
    ? Math.max(
        extraction.second_floor_sqft ?? 0,
        Math.max(
          0,
          (extraction.total_sqft ?? 0) -
            (extraction.first_floor_sqft ?? 0) -
            (extraction.bonus_sqft ?? 0),
        ),
        firstFloorSqft * 0.85,
      )
    : firstFloorSqft;
  out.push(
    makeInstance("stub-drywall", "Ceiling drywall (top floor)", {
      "Wall Area": 0,
      "Ceiling Area": Math.round(topCeilingSqft),
      "Drywall Type": 1.0,
    })!,
  );

  // ── Ceiling insulation (R-38 batt over the top ceiling). Separate
  // from wall insulation, which the exterior-wall assembly already
  // includes. R-38 is the de facto custom-home standard (R-30 is the
  // IRC minimum but architects on Maddox-class plans consistently
  // spec R-38). Builder switches via the assembly card if a plan
  // genuinely calls for code-minimum.
  out.push(
    makeInstance("stub-insulation", "Ceiling insulation (R-38)", {
      "Insulated Area": Math.round(topCeilingSqft),
      "Insulation Type": 2.0, // R-38 ceiling preset
    })!,
  );

  // ── Siding ────────────────────────────────────────────────────
  const totalWallArea = perimeter * avgWallHeight * stories;
  // Stone-veneer accent area: prefer the architect-labeled SF when
  // Claude reads it off the finish schedule or elevation. Fall back
  // to a notable_features keyword scan with an 80 SF median when
  // stone is mentioned but not quantified, or zero when neither
  // signal is present.
  const labeledStoneSqft = extraction.stone_veneer_sqft;
  const stoneAccentArea =
    labeledStoneSqft && labeledStoneSqft > 0
      ? Math.round(labeledStoneSqft)
      : featuresJoined.includes("stone")
        ? 80
        : 0;
  out.push(
    makeInstance("stub-siding", "Exterior siding", {
      "Wall Area": Math.round(totalWallArea),
      "Siding Material": 1.0,
      "Stone Veneer Accent Area": stoneAccentArea,
    })!,
  );

  // ── Gutters & downspouts ─────────────────────────────────────
  // Eave LF ≈ full footprint perimeter × 1.2 buffer for porch eaves,
  // dormers, and offsets. The old 2×long-side calc only worked for
  // pure gable roofs with no porch — on hip roofs and any plan with
  // a covered porch (most custom homes), it ran ~50% short. Downspouts
  // every ~20 LF (one per 20 LF is closer to architect spec than the
  // older 25 LF heuristic, which was halving the count).
  // Eave/ridge LF scale with roof type. Pure gable has eaves only on
  // the two long sides. Hip wraps eaves around the whole building.
  // Mixed and complex roofs interpolate.
  const longSide = Math.max(footprint.length, footprint.width);
  const buildingPerimeter = 2 * (footprint.length + footprint.width);
  let eaveLfFactor: number;
  let ridgeLfFactor: number;
  switch (roofType) {
    case "gable":
      eaveLfFactor = (2 * longSide) / buildingPerimeter; // ~0.6 for 1.4:1
      ridgeLfFactor = longSide / buildingPerimeter;       // single primary ridge
      break;
    case "hip":
      eaveLfFactor = 1.0; // full perimeter
      ridgeLfFactor = (longSide - shortSide) / buildingPerimeter; // shorter
      break;
    case "gable+hip":
      eaveLfFactor = 1.0; // wraps ~3 sides + a bit
      ridgeLfFactor = longSide / buildingPerimeter;
      break;
    case "complex":
    default:
      // Custom plans with dormers / wings / cross-gables — eaves
      // exceed perimeter because every secondary mass adds its own
      // eaves. Cnadd round 5 cross-check vs Maddox: architect's
      // gutter LF / building perimeter = 1.36 (architect 402 LF on
      // ~295 LF perimeter). 1.35 is the working default; was 1.2.
      eaveLfFactor = 1.35;
      ridgeLfFactor = 0.55;
      break;
  }

  const eaveLf = Math.round(buildingPerimeter * eaveLfFactor);
  out.push(
    makeInstance("stub-drainage", "Gutters & downspouts", {
      "Eave Length": eaveLf,
      Downspouts: Math.max(4, Math.round(eaveLf / 20)),
      "Gutter Material": 1.0,
    })!,
  );

  // ── Exterior trim (fascia + soffit + drip edge + ridge vent) ──
  // Fascia/drip edge land at every eave AND every rake — bump the
  // gutter eave factor by ~65% to capture rakes. Cnadd cross-check
  // vs Maddox: architect's fascia:gutter ratio is 1.64. Was 1.5.
  // Ridge vent uses the dedicated ridge LF factor.
  const trimEaveLf = Math.round(eaveLf * 1.65);
  const ridgeLf = Math.round(buildingPerimeter * ridgeLfFactor);
  out.push(
    makeInstance("stub-exterior-trim", "Exterior trim (fascia + soffit + drip + ridge)", {
      "Eave Length": trimEaveLf,
      "Soffit Width": 1.5,
      "Ridge Length": ridgeLf,
      "Trim Style": 1.0,
    })!,
  );

  // ── Windows + exterior doors ─────────────────────────────────
  const windowCount =
    extraction.doors_windows.windows_estimated ??
    Math.round(totalSqft / 150);
  if (windowCount > 0) {
    out.push(
      makeInstance("stub-window-unit", `Windows (${windowCount})`, {
        Width: 30,
        Height: 48,
        "Frame Material": 1.0,
        "Window Style": 1.0,
        Quantity: windowCount,
      })!,
    );
  }
  const extDoorCount = extraction.doors_windows.exterior_doors_estimated ?? 3;
  if (extDoorCount > 0) {
    out.push(
      makeInstance(
        "stub-door-exterior",
        `Exterior doors (${extDoorCount})`,
        {
          Width: 36,
          Height: 80,
          "Door Material": 1.0,
          Quantity: extDoorCount,
        },
      )!,
    );
  }

  // ── Interior doors ────────────────────────────────────────────
  // Prefer the architect-counted value from extraction when Claude
  // surfaced it; that's the most reliable number we can get for
  // custom plans where bedroom/bath math undercounts closet, mech,
  // and utility doors. Heuristic kicks in only when extraction
  // didn't provide a count.
  const bedrooms = extraction.bedrooms ?? 0;
  const baths = (extraction.full_baths ?? 0) + (extraction.half_baths ?? 0);
  const extractedIntDoors = extraction.doors_windows.interior_doors_estimated;
  const heuristicIntDoors = bedrooms * 2 + baths + 3;
  const totalIntDoors = extractedIntDoors ?? heuristicIntDoors;
  const pocketDoors = extraction.doors_windows.pocket_doors_estimated ?? 0;
  // Pocket doors are a subset of the total interior count — split
  // them out so each gets its own instance with the pocket-door
  // cost variant (frame + soft-close hardware ≈ +50%).
  const standardIntDoors = Math.max(0, totalIntDoors - pocketDoors);
  if (standardIntDoors > 0) {
    out.push(
      makeInstance(
        "stub-door-interior",
        `Interior doors (${standardIntDoors})`,
        {
          Width: 30,
          Height: 80,
          "Door Type": 1.0,
          Quantity: standardIntDoors,
        },
      )!,
    );
  }
  if (pocketDoors > 0) {
    out.push(
      makeInstance(
        "stub-door-interior",
        `Pocket doors (${pocketDoors})`,
        {
          Width: 30,
          Height: 80,
          "Door Type": 1.5, // pocket-door variant — frame + soft-close hardware
          Quantity: pocketDoors,
        },
      )!,
    );
  }

  // ── Garage door ──────────────────────────────────────────────
  // Prefer the architect-counted overhead door count when Claude
  // surfaces it from the elevation. Otherwise fall back to the
  // car-bay + footprint heuristic (one 16' double for tight 2-car
  // garages, two singles for spacious 2-car or split 3-car).
  const cars = extraction.garage_cars ?? 0;
  const garageSqft = extraction.garage_sqft ?? 0;
  const extractedDoorCount = extraction.garage_doors_estimated;
  if (cars > 0 || (extractedDoorCount && extractedDoorCount > 0)) {
    let doorCount: number;
    let doorWidth: number;
    let label: string;
    if (extractedDoorCount && extractedDoorCount > 0) {
      // Architect count drives the instance directly. Width split:
      // a single door is 9-10' single, a pair is two 9' singles,
      // three or more land in the "wide + narrow" mix at 12'.
      doorCount = extractedDoorCount;
      if (doorCount === 1) {
        doorWidth = cars >= 2 ? 16 : 9; // single door for 2-car = 16' double
        label = doorWidth === 16 ? "Garage door (double)" : "Garage door";
      } else if (doorCount === 2) {
        doorWidth = 9;
        label = "Garage doors (two single)";
      } else {
        doorWidth = 12;
        label = `Garage doors (${doorCount})`;
      }
    } else if (cars === 1) {
      doorCount = 1;
      doorWidth = 9;
      label = "Garage door";
    } else if (cars === 2 && garageSqft >= 600) {
      doorCount = 2;
      doorWidth = 9;
      label = "Garage doors (two single)";
    } else if (cars === 2) {
      doorCount = 1;
      doorWidth = 16;
      label = "Garage door (double)";
    } else {
      doorCount = 2;
      doorWidth = 12;
      label = "Garage doors (double + single)";
    }
    out.push(
      makeInstance("stub-garage-door", label, {
        Width: doorWidth,
        Height: 7,
        Quantity: doorCount,
        "Door Style": 1.4, // insulated steel default
        Opener: 1.6, // belt drive default
      })!,
    );
  }

  // ── LVL beam package ─────────────────────────────────────────
  // Engineered LVL for girders, floor beams, and ceiling beams.
  // Conditioned area ÷ 12 = total LVL LF (rough rule that matched
  // architect spec on Maddox-class plans). Skipped on single-story
  // slab houses where the only beams are roof headers (already
  // bundled in the Headers assembly below).
  if (stories > 1 || fdnId !== "stub-slab-on-grade") {
    const conditionedSqft = totalSqft;
    const lvlLf = Math.round(conditionedSqft / 12);
    if (lvlLf > 0) {
      out.push(
        makeInstance("stub-lvl-beam-package", "LVL beam package", {
          "Total LVL LF": lvlLf,
          "Beam Grade": 1.0,
        })!,
      );
    }
  }

  // ── Structural headers ───────────────────────────────────────
  // One doubled-dimensional header per door + window opening; LVL
  // headers for garage doors + a baseline of 4 large interior openings
  // (great-room cased openings, kitchen island, hallway pass-throughs).
  const windowCountForHeaders =
    extraction.doors_windows.windows_estimated ??
    Math.round(totalSqft / 150);
  const extDoorsForHeaders = extraction.doors_windows.exterior_doors_estimated ?? 3;
  // Header count tracks the architect-counted total interior doors
  // when available; same fallback as the interior-doors instance.
  const intDoorsForHeaders = totalIntDoors;
  const standardOpenings = windowCountForHeaders + extDoorsForHeaders + intDoorsForHeaders;
  const lvlHeaderCount = Math.max(2, cars) + 4;
  out.push(
    makeInstance("stub-headers", "Structural headers (door + window openings)", {
      "Standard Openings": standardOpenings,
      "LVL Headers": lvlHeaderCount,
    })!,
  );

  // ── Porch / deck system ──────────────────────────────────────
  // Skipped when there's no porch in the extraction. Column count
  // estimated from porch perimeter (~1 column per 8 LF).
  const porchSqft = extraction.porch_sqft ?? 0;
  if (porchSqft > 50) {
    const porchPerim = 2 * (Math.sqrt(porchSqft * 1.4) + Math.sqrt(porchSqft / 1.4));
    // 1 column per 12 LF of porch perimeter. Cnadd cross-check vs
    // Maddox spec: 8 LF spacing produced 17 columns vs architect's
    // 11 (a 55% overshoot). 12 LF lands at ~11-12 columns — closer
    // to typical custom-porch spacing (8'-12' between posts is the
    // common range).
    const columnCount = Math.max(4, Math.round(porchPerim / 12));
    out.push(
      makeInstance("stub-porch-system", "Porch & deck system", {
        "Porch Area": Math.round(porchSqft),
        "Column Count": columnCount,
        "Decking Material": 1.0,
      })!,
    );
  }

  // ── Stairs (one run per story transition + bonus / basement runs) ─
  // Most custom homes with a bonus room have a SECOND stair (mudroom
  // → bonus or kitchen → bonus). Basement adds another run. The base
  // count covers main-floor-to-second transitions; the heuristic adds
  // ~1 extra run per bonus or basement scope.
  const baseStairRuns = stories > 1 ? 1 : 0;
  const bonusStairRuns = (extraction.bonus_sqft ?? 0) > 100 ? 1 : 0;
  const basementStairRuns = (extraction.foundation_type ?? "")
    .toLowerCase()
    .includes("basement")
    ? 1
    : 0;
  const totalStairRuns = baseStairRuns + bonusStairRuns + basementStairRuns;
  if (totalStairRuns > 0) {
    // 17 risers between floors with 9-10' ceilings is typical.
    const risers = Math.round((ceilings.firstFloor + 1) * 1.7);
    const label =
      totalStairRuns === 1
        ? "Stair package (interior)"
        : `Stair package (${totalStairRuns} runs)`;
    out.push(
      makeInstance("stub-stair-package", label, {
        Risers: risers * totalStairRuns,
        "Stair Width": 40,
        // 4 stringers per run is the median for custom 36-42" wide
        // stairs (3 typical stringers + 1 mid-span / outside-string
        // landing block). Was 3, which Maddox cross-check showed
        // shorted the stair package by 25-40%.
        "Stringer Count": 4 * totalStairRuns,
        "Guardrail Length": 18 * totalStairRuns,
        "Tread Material": 1.0,
      })!,
    );
  }

  // ── Interior paint (walls + ceilings, roughly 2.7× sqft) ─────
  out.push(
    makeInstance("stub-interior-paint", "Interior paint", {
      "Wall Area": Math.round(totalSqft * 2.7),
      "Paint Grade": 1.0,
    })!,
  );

  // ── Hardwood flooring (excluding garage, porch, baths) ───────
  const bathSqft = baths * 60; // ~60 SF per bath, rough
  const flooringSqft = Math.max(
    0,
    totalSqft - bathSqft - (extraction.garage_sqft ?? 0) - (extraction.porch_sqft ?? 0),
  );
  if (flooringSqft > 0) {
    out.push(
      makeInstance("stub-hardwood-floor", "Hardwood flooring", {
        "Floor Area": Math.round(flooringSqft),
        "Wood Species": 1.0,
      })!,
    );
  }

  return out.filter((x) => x !== null);
}

function round(n: number, d: number): number {
  const m = Math.pow(10, d);
  return Math.round(n * m) / m;
}

/**
 * Build the QuoteLine block derived from one AssemblyInstance. Mirrors
 * the quote page's makeInstanceLine + recomputeLine — duplicated here so
 * the plan-extraction integration can produce a ready-to-save lines array
 * without importing from a page file.
 *
 * Each material on the assembly turns into one line, with markup applied
 * and the instance id stamped onto QuoteLine.instance_id so live edits
 * to the instance later regenerate this same block in place.
 */
export function linesFromInstance(
  instance: AssemblyInstance,
  startingLineNumber: number,
  markupPercent: number,
  newId: () => string,
): QuoteLine[] {
  // Active variant drives the derived QuoteLines. Inactive variants are
  // reference-only state and never contribute to the project totals.
  const variant = activeVariantOf(instance);
  const assembly = findStubAssembly(variant.assemblyId);
  if (!assembly) return [];
  const propertyValues = Object.fromEntries(
    variant.propertyValues.map((p) => [p.name, p.value]),
  );
  const { lines } = computeMaterials(assembly, propertyValues);
  return lines.map((m, i) => {
    const listPrice = m.unitCostUsd + m.laborCostUsd;
    const costUnit = listPrice; // discount 0 for builders
    const customerUnit = costUnit * (1 + markupPercent / 100);
    const costExt = costUnit * m.quantity;
    const customerExt = customerUnit * m.quantity;
    const margin =
      customerExt > 0 ? ((customerExt - costExt) / customerExt) * 100 : 0;
    return {
      id: newId(),
      line_number: startingLineNumber + i,
      product_code: instance.instanceLabel,
      description: `${m.name} (from ${instance.assemblyName})`,
      instance_id: instance.id,
      manufacturer: "",
      is_service: false,
      qty: m.quantity,
      list_price: listPrice,
      discount_percent: 0,
      markup_percent: markupPercent,
      customer_unit_price: round(customerUnit, 4),
      customer_extended: round(customerExt, 2),
      cost_unit_price: round(costUnit, 4),
      cost_extended: round(costExt, 2),
      margin_percent: round(margin, 2),
      subscription_term_months: 0,
      notes: "",
      cat_id: m.catId,
    };
  });
}

/**
 * Convenience: roll a PlanExtraction directly into both the
 * AssemblyInstance set and the derived QuoteLine block. Useful for the
 * one-click "Create assemblies from plan" action on the extractor.
 */
export function instancesAndLinesFromPlan(
  extraction: PlanInput,
  markupPercent: number,
  startingLineNumber: number,
  newId: () => string,
): { instances: AssemblyInstance[]; lines: QuoteLine[] } {
  const instances = instancesFromPlan(extraction);
  const allLines: QuoteLine[] = [];
  let lineNum = startingLineNumber;
  for (const inst of instances) {
    const block = linesFromInstance(inst, lineNum, markupPercent, newId);
    allLines.push(...block);
    lineNum += block.length;
  }
  return { instances, lines: allLines };
}
