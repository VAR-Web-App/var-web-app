/**
 * Assembly-based estimating types for FrameFlow.
 *
 * An Assembly is a parametric construction component (e.g., a 2×6 exterior
 * wall) with named properties (Wall Length, Wall Height, Stud Spacing) and
 * a list of materials, each carrying a quantity formula that references
 * those properties. Given a builder's input for the properties, the
 * formulas explode into a quantified, costed materials list.
 *
 * Modeled to mirror 1build's Cost Data API (Sources with nestedSources +
 * formula strings) so we can swap our stub catalog for the live API
 * without touching the UI or the formula evaluator.
 */

/** A named property of an Assembly — e.g. "Wall Length" in linear feet. */
export interface AssemblyProperty {
  /** Property name as referenced in formulas, e.g. "Wall Length". */
  name: string;
  /** Unit of measure ("LF", "SF", "EA", "IN", "FT", …) — display only. */
  uom: string;
  /** Default pre-filled in the UI so the assembly shows a sensible breakdown out of the box. */
  defaultValue?: number;
}

/** A material that makes up an Assembly, with a quantity formula. */
export interface AssemblyMaterial {
  /** Display name, e.g. '2×6 stud, 9\' (Doug fir SPF)'. */
  name: string;
  /** Unit of measure for the material's quantity ("EA", "LF", "SHEET", …). */
  uom: string;
  /**
   * Quantity formula referencing parent assembly properties.
   * Properties are wrapped in curly braces, e.g.
   *   "{Wall Length} * (12 / {Stud Spacing}) + 4"
   *
   * UoM tokens (LF, SF, EA, SHEET, IN, …) embedded in the formula are
   * treated as no-op markers and stripped before evaluation. This mirrors
   * the 1build API's format ("({Wall Length}*{Wall Height}) + 1 LF").
   */
  quantityFormula: string;
  /** Material unit cost in USD. Replaced by 1build's localized rate later. */
  unitCostUsd: number;
  /** Labor cost per unit installed, in USD. */
  laborCostUsd?: number;
  /** Optional CSI division code for grouping ("06" = Wood/Composites, etc.). */
  csiDivision?: string;
}

/** A reusable Assembly definition, e.g. 'Exterior Wall — 2×6 @ 16" OC'. */
export interface Assembly {
  id: string;
  name: string;
  description?: string;
  /** Broad trade for filtering in the UI. */
  trade:
    | "framing"
    | "foundation"
    | "roofing"
    | "drywall"
    | "flooring"
    | "exterior"
    | "other";
  properties: AssemblyProperty[];
  materials: AssemblyMaterial[];
}

/** A property's value as filled in by the user for one Assembly instance. */
export interface AssemblyPropertyValue {
  name: string;
  value: number;
}

/** A material line computed for a specific Assembly instance. */
export interface AssemblyMaterialLine {
  name: string;
  uom: string;
  quantity: number;
  unitCostUsd: number;
  laborCostUsd: number;
  /** quantity × (unitCost + labor). */
  lineTotalUsd: number;
}

/**
 * An Assembly placed on an estimate with concrete property values and the
 * resulting materials breakdown. The materials snapshot is preserved so
 * the estimate stays reproducible even if the upstream Assembly changes.
 */
export interface AssemblyInstance {
  /** Reference to the Assembly definition this was built from. */
  assemblyId: string;
  /** Snapshot of the assembly's name at the time it was added. */
  assemblyName: string;
  propertyValues: AssemblyPropertyValue[];
  materials: AssemblyMaterialLine[];
  /** Sum of every line's lineTotalUsd. */
  totalCostUsd: number;
}
