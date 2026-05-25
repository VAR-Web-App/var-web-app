/**
 * Convert a FloorPlanExtraction into a starter set of AssemblyInstance
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

interface FloorPlanInput {
  total_sqft: number | null;
  first_floor_sqft: number | null;
  second_floor_sqft: number | null;
  porch_sqft: number | null;
  garage_sqft: number | null;
  garage_cars: number | null;
  bedrooms: number | null;
  full_baths: number | null;
  half_baths: number | null;
  footprint_dimensions: string | null;
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
  const m = s.match(/(\d+(?:\.\d+)?)\s*['′]?\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const length = parseFloat(m[1]);
  const width = parseFloat(m[2]);
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
  // Basement and crawl both use strip footings; basement adds CMU walls
  // (not yet in the catalog — TODO when CMU assembly lands).
  return "stub-footing-strip";
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
  // Floor-plan-generated instances start with a single variant — the
  // builder can add alternatives from the card UI later. The variant's
  // label defaults to the assembly's name so the chip looks meaningful
  // out of the gate.
  const variantId = newId();
  return {
    id: newId(),
    instanceLabel,
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

export function instancesFromFloorPlan(
  extraction: FloorPlanInput,
): AssemblyInstance[] {
  const out: AssemblyInstance[] = [];

  const footprint = parseFootprint(extraction.footprint_dimensions);
  const stories = Math.max(1, extraction.stories ?? 1);
  const ceilings = parseCeilingHeights(extraction.ceiling_heights);

  // First-floor footprint area — fall back to total/stories if unparseable.
  const firstFloorSqft =
    extraction.first_floor_sqft ??
    (footprint ? footprint.length * footprint.width : null) ??
    (extraction.total_sqft ? extraction.total_sqft / stories : 1500);

  const perimeter = footprint
    ? 2 * (footprint.length + footprint.width)
    : // No footprint string — approximate from area as a square footprint.
      4 * Math.sqrt(firstFloorSqft);

  // ── Foundation ────────────────────────────────────────────────
  const fdnId = detectFoundationAssemblyId(extraction.foundation_type);
  if (fdnId === "stub-slab-on-grade" && footprint) {
    out.push(
      makeInstance(fdnId, "Foundation — slab on grade", {
        "Slab Length": footprint.length,
        "Slab Width": footprint.width,
        "Slab Thickness": catalogDefault(fdnId, "Slab Thickness"),
      })!,
    );
  } else {
    out.push(
      makeInstance(fdnId, "Foundation — strip footing", {
        "Footing Length": perimeter,
        "Footing Width": catalogDefault(fdnId, "Footing Width"),
        "Footing Depth": catalogDefault(fdnId, "Footing Depth"),
      })!,
    );
  }

  // ── First-floor system (only if there's a second floor sitting on it) ─
  if (stories > 1 && footprint) {
    out.push(
      makeInstance("stub-floor-2x10-16oc", "Floor system — first floor", {
        "Floor Length": footprint.length,
        "Floor Width": footprint.width,
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
  // Rough heuristic: total interior wall LF ≈ 0.7 × heated sqft / wall height
  // (gives a working baseline; user adjusts).
  const totalSqft = extraction.total_sqft ?? firstFloorSqft * stories;
  const avgWallHeight =
    wallHeights.reduce((s, h) => s + h, 0) / Math.max(1, wallHeights.length);
  const interiorWallLF = Math.round((totalSqft * 0.7) / avgWallHeight);
  out.push(
    makeInstance("stub-int-wall-2x4-16oc", "Interior walls (estimated)", {
      "Wall Length": interiorWallLF,
      "Wall Height": avgWallHeight,
      "Stud Spacing": 16,
    })!,
  );

  // ── Roof (single instance covering the whole footprint) ──────
  if (footprint) {
    // Roof Run is the longer dimension (eave-to-eave); Roof Width is the
    // gable-to-gable depth.
    const run = Math.max(footprint.length, footprint.width);
    const width = Math.min(footprint.length, footprint.width);
    out.push(
      makeInstance("stub-roof-2x8-16oc", "Roof system", {
        "Roof Run": run,
        "Roof Width": width,
        "Rafter Spacing": 16,
      })!,
    );
  }

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
  if (footprint) {
    const eaveLf = 2 * Math.max(footprint.length, footprint.width);
    out.push(
      makeInstance("stub-drainage", "Gutters & downspouts", {
        "Eave Length": eaveLf,
        Downspouts: Math.max(4, Math.round(eaveLf / 25)),
        "Gutter Material": 1.0,
      })!,
    );
  }

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

  // ── Stairs (one run per story transition) ────────────────────
  if (stories > 1) {
    // 17 risers between floors with 9-10' ceilings is typical.
    const risers = Math.round((ceilings.firstFloor + 1) * 1.7);
    out.push(
      makeInstance("stub-stair-package", "Stair package (interior)", {
        Risers: risers,
        "Stair Width": 40,
        "Stringer Count": 3,
        "Guardrail Length": 18,
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
 * the floor-plan integration can produce a ready-to-save lines array
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
 * Convenience: roll a FloorPlanExtraction directly into both the
 * AssemblyInstance set and the derived QuoteLine block. Useful for the
 * one-click "Create assemblies from plan" action on the extractor.
 */
export function instancesAndLinesFromFloorPlan(
  extraction: FloorPlanInput,
  markupPercent: number,
  startingLineNumber: number,
  newId: () => string,
): { instances: AssemblyInstance[]; lines: QuoteLine[] } {
  const instances = instancesFromFloorPlan(extraction);
  const allLines: QuoteLine[] = [];
  let lineNum = startingLineNumber;
  for (const inst of instances) {
    const block = linesFromInstance(inst, lineNum, markupPercent, newId);
    allLines.push(...block);
    lineNum += block.length;
  }
  return { instances, lines: allLines };
}
