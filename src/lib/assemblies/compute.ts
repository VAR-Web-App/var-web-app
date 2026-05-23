/**
 * Compute a quantified materials breakdown for one Assembly instance.
 *
 * Given an Assembly definition and a property-value bag, evaluate every
 * material's quantity formula and roll up the line totals. Reused by the
 * assembly sandbox page and by the "Add assembly" modal on the quote
 * page, so the math lives in exactly one place.
 */
import type { Assembly, AssemblyMaterialLine } from "@/types/assembly";
import { evaluateFormula } from "./formula";

export interface ComputeResult {
  lines: AssemblyMaterialLine[];
  total: number;
  /** First error encountered, or null. Lines with valid formulas still land in `lines`. */
  error: string | null;
}

export function computeMaterials(
  assembly: Assembly,
  propertyValues: Record<string, number>,
): ComputeResult {
  const lines: AssemblyMaterialLine[] = [];
  let total = 0;
  let error: string | null = null;
  for (const m of assembly.materials) {
    try {
      const quantity = evaluateFormula(m.quantityFormula, propertyValues);
      // Cost formulas override the fixed unit costs when present. This lets
      // an assembly express e.g. "vinyl vs wood frame" as a multiplier in
      // the formula instead of forcing one assembly per material grade.
      const unitCost = m.unitCostFormula
        ? evaluateFormula(m.unitCostFormula, propertyValues)
        : m.unitCostUsd;
      const labor = m.laborCostFormula
        ? evaluateFormula(m.laborCostFormula, propertyValues)
        : (m.laborCostUsd ?? 0);
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
  return { lines, total, error };
}
