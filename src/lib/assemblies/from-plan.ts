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
  stories: number | null;
  foundation_type: string | null;
  exterior_wall_type: string | null;
  ceiling_heights: string | null;
  doors_windows: {
    exterior_doors_estimated: number | null;
    windows_estimated: number | null;
  };
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

/** Build a property bag with overrides on top of the assembly defaults. */
function propValues(
  assemblyId: string,
  overrides: Record<string, number>,
): { name: string; value: number }[] {
  const a = findStubAssembly(assemblyId);
  if (!a) return [];
  return a.properties.map((p) => ({
    name: p.name,
    value:
      overrides[p.name] != null ? overrides[p.name] : (p.defaultValue ?? 0),
  }));
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

  // Always have a footprint — fall back to a 1.4:1 rectangle around
  // first-floor sqft. Most residential plans land between 1.2:1 and 1.6:1
  // (length:width) so this is a reasonable default. Without this fallback,
  // roof/gutters/floor framing silently drop when extraction can't read
  // the printed footprint string.
  const footprint =
    parsedFootprint ??
    (() => {
      const ratio = 1.4;
      const width = Math.sqrt(firstFloorSqft / ratio);
      return { length: width * ratio, width };
    })();

  const perimeter = 2 * (footprint.length + footprint.width);

  // ── Foundation ────────────────────────────────────────────────
  const fdnId = detectFoundationAssemblyId(extraction.foundation_type);
  const cmuWall = hasCmuFoundationWall(extraction.foundation_type);
  if (fdnId === "stub-slab-on-grade") {
    out.push(
      makeInstance(fdnId, "Foundation — slab on grade", {
        "Slab Length": footprint.length,
        "Slab Width": footprint.width,
        "Slab Thickness": catalogDefault(fdnId, "Slab Thickness"),
      })!,
    );
  } else {
    // Heavier footing dims when a CMU wall (and pier loads) sit on top.
    // Default 16×8 is sized for stick-frame on slab; CMU + 2-story stick
    // framing needs 24×12 to hit typical residential bearing capacity.
    const footingWidth = cmuWall ? 24 : catalogDefault(fdnId, "Footing Width");
    const footingDepth = cmuWall ? 12 : catalogDefault(fdnId, "Footing Depth");
    out.push(
      makeInstance(fdnId, "Foundation — strip footing", {
        "Footing Length": perimeter,
        "Footing Width": footingWidth,
        "Footing Depth": footingDepth,
      })!,
    );
  }

  // CMU foundation wall on top of the strip footing — crawl spaces and
  // basements both have this and it's a large material line (1,000+
  // blocks on a typical 2,500 SF house). Slab-on-grade doesn't.
  if (cmuWall) {
    // Pier count scales with footprint area — roughly one pier per
    // 250 SF of first-floor footprint, covering the perimeter spacing
    // (≤8 LF between piers per IRC) and the center beam line. Floors
    // > 1 typically need ~30% more piers to support the second story
    // beam pickup.
    const piers = Math.max(
      4,
      Math.round((firstFloorSqft / 250) * (stories > 1 ? 1.3 : 1)),
    );
    out.push(
      makeInstance("stub-cmu-foundation-wall", "Foundation wall — CMU block", {
        "Wall Length": perimeter,
        "Wall Height": inferFoundationWallHeight(extraction.foundation_type),
        "Pier Count": piers,
      })!,
    );
  }

  // Floor framing dimensions: prefer the conditioned-footprint string
  // when Claude surfaced it, fall back to synthesizing a 1.4:1 rectangle
  // from first_floor_sqft + porch. Why two paths:
  //   - conditioned_footprint_dimensions is the architect-printed value
  //     for just the heated/cooled area; using it directly is the most
  //     accurate input we can have for floor scope.
  //   - When Claude can't read that label, falling back to area-derived
  //     dims still beats using the overall envelope (which causes
  //     2-3× overcount on plans with substantial porches).
  const conditionedFootprint = parseFootprint(
    extraction.conditioned_footprint_dimensions ?? null,
  );
  let framingLength: number;
  let framingWidth: number;
  if (conditionedFootprint) {
    framingLength = conditionedFootprint.length;
    framingWidth = conditionedFootprint.width;
  } else {
    const firstFloorFramedSqft = firstFloorSqft + (extraction.porch_sqft ?? 0);
    framingWidth = Math.sqrt(firstFloorFramedSqft / 1.4);
    framingLength = framingWidth * 1.4;
  }

  // ── First-floor framing (over any non-slab foundation) ──────────
  // Slab-on-grade IS the first floor, so no joists needed. Crawl spaces
  // and basements need full floor framing sitting on the foundation
  // wall — this is a large I-joist / dimensional lumber line item the
  // converter used to silently skip on single-story crawl-space builds.
  if (fdnId !== "stub-slab-on-grade") {
    out.push(
      makeInstance("stub-floor-2x10-16oc", "Floor system — first floor", {
        "Floor Length": framingLength,
        "Floor Width": framingWidth,
        "Joist Spacing": 16,
      })!,
    );
  }

  // ── Second-floor framing (still gated on stories > 1) ─────────
  // Use second_floor_sqft if Claude provided it; otherwise assume the
  // second floor is the same shape as the first.
  if (stories > 1) {
    const secondFloorSqft = extraction.second_floor_sqft ?? firstFloorSqft;
    const w2 = Math.sqrt(secondFloorSqft / 1.4);
    const l2 = w2 * 1.4;
    out.push(
      makeInstance("stub-floor-2x10-16oc", "Floor system — second floor", {
        "Floor Length": l2,
        "Floor Width": w2,
        "Joist Spacing": 16,
      })!,
    );
  }

  // ── Exterior walls per story ──────────────────────────────────
  const extWallId = detectExteriorWallAssemblyId(extraction.exterior_wall_type);
  const wallHeights = [ceilings.firstFloor, ceilings.secondFloor].slice(
    0,
    stories,
  );
  wallHeights.forEach((h, idx) => {
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
        },
      )!,
    );
  });

  // ── Interior walls (one bundled instance) ────────────────────
  // Rough heuristic: total interior wall LF ≈ 0.9 × heated sqft / wall
  // height. Custom homes typically have more interior partition LF per
  // SF than tract builds (more closets, en-suites, jogs); architect
  // counts on the Maddox cross-check ran ~0.9 SF/LF. Builder still
  // adjusts per project from the assembly card.
  const totalSqft = extraction.total_sqft ?? firstFloorSqft * stories;
  const avgWallHeight =
    wallHeights.reduce((s, h) => s + h, 0) / Math.max(1, wallHeights.length);
  const interiorWallLF = Math.round((totalSqft * 0.9) / avgWallHeight);
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
  if (extraction.roof_area_sqft && extraction.roof_area_sqft > 0) {
    // Roof formula: Run × Width × 1.20 (pitch slope + eave buffer).
    // Solve for L × W = roof_area / 1.20, then split 1.4:1.
    const projectedRoofArea = extraction.roof_area_sqft / 1.20;
    roofWidth = Math.sqrt(projectedRoofArea / 1.4);
    roofRun = roofWidth * 1.4;
  } else {
    roofRun = Math.max(footprint.length, footprint.width);
    roofWidth = Math.min(footprint.length, footprint.width);
  }
  out.push(
    makeInstance("stub-roof-2x8-16oc", "Roof system", {
      "Roof Run": roofRun,
      "Roof Width": roofWidth,
      "Rafter Spacing": 16,
    })!,
  );

  // ── Ceiling drywall (top floor only — between floors is handled by
  // the floor-framing assembly's subfloor and the floor-below's wall
  // drywall). Single instance with Wall Area = 0 so only ceiling area
  // gets billed.
  const topCeilingSqft = stories > 1
    ? (extraction.second_floor_sqft ?? firstFloorSqft)
    : firstFloorSqft;
  out.push(
    makeInstance("stub-drywall", "Ceiling drywall (top floor)", {
      "Wall Area": 0,
      "Ceiling Area": Math.round(topCeilingSqft),
      "Drywall Type": 1.0,
    })!,
  );

  // ── Ceiling insulation (R-30 batt over the top ceiling). Separate
  // from wall insulation, which the exterior-wall assembly already
  // includes.
  out.push(
    makeInstance("stub-insulation", "Ceiling insulation (R-30)", {
      "Insulated Area": Math.round(topCeilingSqft),
      "Insulation Type": 1.7, // R-30 ceiling preset
    })!,
  );

  // ── Siding ────────────────────────────────────────────────────
  const totalWallArea = perimeter * avgWallHeight * stories;
  out.push(
    makeInstance("stub-siding", "Exterior siding", {
      "Wall Area": Math.round(totalWallArea),
      // Default to vinyl (cheapest baseline); builder switches live.
      "Siding Material": 1.0,
    })!,
  );

  // ── Gutters & downspouts ─────────────────────────────────────
  // Eave LF ≈ 2× the longer footprint side (two long eaves on a typical
  // gable roof). Downspouts every ~25 LF.
  const eaveLf = 2 * Math.max(footprint.length, footprint.width);
  out.push(
    makeInstance("stub-drainage", "Gutters & downspouts", {
      "Eave Length": eaveLf,
      Downspouts: Math.max(4, Math.round(eaveLf / 25)),
      "Gutter Material": 1.0,
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

  // ── Interior doors (heuristic) ────────────────────────────────
  const bedrooms = extraction.bedrooms ?? 0;
  const baths = (extraction.full_baths ?? 0) + (extraction.half_baths ?? 0);
  const intDoorCount = bedrooms * 2 + baths + 3; // bedroom + closet × bedrooms, plus baths, plus mech/laundry/coat
  if (intDoorCount > 0) {
    out.push(
      makeInstance(
        "stub-door-interior",
        `Interior doors (${intDoorCount})`,
        {
          Width: 30,
          Height: 80,
          "Door Type": 1.0,
          Quantity: intDoorCount,
        },
      )!,
    );
  }

  // ── Garage door ──────────────────────────────────────────────
  const cars = extraction.garage_cars ?? 0;
  if (cars > 0) {
    out.push(
      makeInstance(
        "stub-garage-door",
        cars >= 3 ? "Garage doors (double + single)" : "Garage door",
        {
          // 1-car ≈ 9' wide single. 2+car ≈ 16' double. 3-car = 16' + 9'
          // approximated as one 16' door for simplicity (user can duplicate).
          Width: cars === 1 ? 9 : 16,
          Height: 7,
          Quantity: cars >= 3 ? 2 : 1,
          "Door Style": 1.4, // insulated steel default
          Opener: 1.6, // belt drive default
        },
      )!,
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
  const intDoorsForHeaders = bedrooms * 2 + baths + 3;
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
    const columnCount = Math.max(4, Math.round(porchPerim / 8));
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
        "Stringer Count": 3 * totalStairRuns,
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
