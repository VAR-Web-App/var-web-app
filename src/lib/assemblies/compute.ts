/**
 * Compute a quantified materials breakdown for one Assembly instance.
 *
 * Given an Assembly definition and a property-value bag, evaluate every
 * material's quantity formula and roll up the line totals. Reused by the
 * assembly sandbox page and by the "Add assembly" modal on the quote
 * page, so the math lives in exactly one place.
 *
 * Cost overrides (V1.5): the org may have per-assembly or global cost
 * multipliers that scale the stock catalog to their local market. Both
 * layers stack: final = base × per_assembly × global.
 */
import type { Assembly, AssemblyMaterialLine } from "@/types/assembly";
import { evaluateFormula } from "./formula";

export interface ComputeResult {
  lines: AssemblyMaterialLine[];
  total: number;
  /** First error encountered, or null. Lines with valid formulas still land in `lines`. */
  error: string | null;
}

/** Per-assembly override block matched out of OrgSettings.cost_overrides. */
export interface AssemblyCostOverrides {
  /** Multiplier for material unit cost on every line in the assembly. */
  material_multiplier?: number;
  /** Multiplier for labor unit cost on every line in the assembly. */
  labor_multiplier?: number;
  /** Global org-wide multipliers, applied on top of the per-assembly pair. */
  global_material_multiplier?: number;
  global_labor_multiplier?: number;
  /** Stock material names to suppress from the compute output. */
  removed_materials?: string[];
  /** Builder-authored extra material lines appended after the stock set. */
  extra_materials?: Array<{
    name: string;
    uom: string;
    base_quantity?: number;
    scale_property?: string;
    scale_multiplier?: number;
    unit_cost_usd: number;
    labor_cost_usd?: number;
  }>;
  /** Per-stock-line quantity multipliers, keyed by material name.
   *  1.05 = "add 5% extra to this line's stock formula output". */
  line_overrides?: Record<string, { quantity_factor?: number }>;
}

export function computeMaterials(
  assembly: Assembly,
  propertyValues: Record<string, number>,
  overrides?: AssemblyCostOverrides,
): ComputeResult {
  const matMult =
    (overrides?.material_multiplier ?? 1) *
    (overrides?.global_material_multiplier ?? 1);
  const laborMult =
    (overrides?.labor_multiplier ?? 1) *
    (overrides?.global_labor_multiplier ?? 1);

  const removed = new Set(overrides?.removed_materials ?? []);
  const lineOverrides = overrides?.line_overrides ?? {};

  // Round computed quantities to the precision a builder actually orders
  // in. Formula output is full float (e.g. 92.58333… LF) which is noise
  // — no one orders 92.58 LF of lumber. CY/GAL/TON/HR keep 1 decimal
  // because fractional units are meaningful for liquids and time;
  // everything else rounds to the nearest whole unit.
  const roundQty = (qty: number, uom: string): number => {
    const upper = uom.toUpperCase();
    if (upper === "CY" || upper === "GAL" || upper === "TON" || upper === "HR") {
      return Math.round(qty * 10) / 10;
    }
    return Math.round(qty);
  };

  const lines: AssemblyMaterialLine[] = [];
  let total = 0;
  let error: string | null = null;
  for (const m of assembly.materials) {
    // V1.6: skip any stock line the builder marked removed for this org.
    if (removed.has(m.name)) continue;
    try {
      // V1.7: per-line quantity factor scales the formula result.
      // Default 1 = no change. Builder sets 1.05 to add 5% extra
      // material on top of the stock waste already in the formula.
      const lineQtyFactor = lineOverrides[m.name]?.quantity_factor ?? 1;
      const rawQuantity =
        evaluateFormula(m.quantityFormula, propertyValues) * lineQtyFactor;
      const quantity = roundQty(rawQuantity, m.uom);
      // Cost formulas override the fixed unit costs when present. This lets
      // an assembly express e.g. "vinyl vs wood frame" as a multiplier in
      // the formula instead of forcing one assembly per material grade.
      const baseUnitCost = m.unitCostFormula
        ? evaluateFormula(m.unitCostFormula, propertyValues)
        : m.unitCostUsd;
      const baseLabor = m.laborCostFormula
        ? evaluateFormula(m.laborCostFormula, propertyValues)
        : (m.laborCostUsd ?? 0);
      const unitCost = baseUnitCost * matMult;
      const labor = baseLabor * laborMult;
      const lineTotal = (unitCost + labor) * quantity;
      lines.push({
        name: m.name,
        uom: m.uom,
        quantity,
        unitCostUsd: unitCost,
        laborCostUsd: labor,
        lineTotalUsd: lineTotal,
      });
      total += lineTotal;
    } catch (e) {
      if (!error) error = e instanceof Error ? e.message : String(e);
    }
  }

  // V1.6: builder-authored extra lines appended after the stock set.
  // Quantity = base + (scale_property × scale_multiplier). Static lines
  // set only base; scaling lines tie quantity to one of the assembly's
  // properties (e.g. vapor barrier = Floor Area × 1.10).
  for (const x of overrides?.extra_materials ?? []) {
    const base = x.base_quantity ?? 0;
    const scale = x.scale_property
      ? (propertyValues[x.scale_property] ?? 0) * (x.scale_multiplier ?? 1)
      : 0;
    const rawQty = base + scale;
    if (rawQty <= 0) continue;
    const quantity = roundQty(rawQty, x.uom);
    const unitCost = x.unit_cost_usd * matMult;
    const labor = (x.labor_cost_usd ?? 0) * laborMult;
    const lineTotal = (unitCost + labor) * quantity;
    lines.push({
      name: x.name,
      uom: x.uom,
      quantity,
      unitCostUsd: unitCost,
      laborCostUsd: labor,
      lineTotalUsd: lineTotal,
    });
    total += lineTotal;
  }

  return { lines, total, error };
}

/** Resolve the per-assembly + global multipliers + line edits from
 *  OrgSettings into a single AssemblyCostOverrides block for the
 *  given assembly id. */
export function resolveOverrides(
  costOverrides:
    | {
        global_material_multiplier?: number;
        global_labor_multiplier?: number;
        per_assembly?: Record<
          string,
          {
            material_multiplier?: number;
            labor_multiplier?: number;
            removed_materials?: string[];
            extra_materials?: AssemblyCostOverrides["extra_materials"];
            line_overrides?: AssemblyCostOverrides["line_overrides"];
          }
        >;
      }
    | undefined,
  assemblyId: string,
): AssemblyCostOverrides | undefined {
  if (!costOverrides) return undefined;
  const per = costOverrides.per_assembly?.[assemblyId];
  const out: AssemblyCostOverrides = {};
  if (costOverrides.global_material_multiplier != null)
    out.global_material_multiplier = costOverrides.global_material_multiplier;
  if (costOverrides.global_labor_multiplier != null)
    out.global_labor_multiplier = costOverrides.global_labor_multiplier;
  if (per?.material_multiplier != null)
    out.material_multiplier = per.material_multiplier;
  if (per?.labor_multiplier != null)
    out.labor_multiplier = per.labor_multiplier;
  if (per?.removed_materials && per.removed_materials.length > 0)
    out.removed_materials = per.removed_materials;
  if (per?.extra_materials && per.extra_materials.length > 0)
    out.extra_materials = per.extra_materials;
  if (per?.line_overrides && Object.keys(per.line_overrides).length > 0)
    out.line_overrides = per.line_overrides;
  return Object.keys(out).length > 0 ? out : undefined;
}
