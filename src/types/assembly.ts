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

/** A labeled option for property `kind === "option"`. */
export interface AssemblyPropertyOption {
  /** Display label, e.g. "Vinyl" or "Casement". */
  label: string;
  /** Numeric value the formula sees, often a cost multiplier. */
  value: number;
}

/** A named property of an Assembly — e.g. "Wall Length" in linear feet. */
export interface AssemblyProperty {
  /** Property name as referenced in formulas, e.g. "Wall Length". */
  name: string;
  /** Unit of measure ("LF", "SF", "EA", "IN", "FT", …) — display only. */
  uom: string;
  /** Default pre-filled in the UI so the assembly shows a sensible breakdown out of the box. */
  defaultValue?: number;
  /**
   * How the property is entered.
   * - "number" (default): free-form number input.
   * - "choice": dropdown of numeric values (e.g. stud spacing 12/16/24).
   * - "option": dropdown of labeled options (e.g. "Vinyl" → 1.0, "Wood" → 2.3).
   *   Formulas see the numeric value; the UI shows the label.
   */
  kind?: "number" | "choice" | "option";
  /** Allowed values when `kind === "choice"`. */
  choices?: number[];
  /** Labeled options when `kind === "option"`. */
  options?: AssemblyPropertyOption[];
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
  /** Fixed material unit cost (USD). Used when unitCostFormula is absent. */
  unitCostUsd: number;
  /**
   * Optional cost formula evaluated against the same property bag as
   * quantityFormula. When present, this overrides unitCostUsd — useful
   * when the unit cost varies with options (e.g. "Vinyl" vs "Wood"
   * window frames, where the same line scales by a material multiplier).
   */
  unitCostFormula?: string;
  /** Fixed labor cost per unit (USD). */
  laborCostUsd?: number;
  /** Optional labor cost formula, overrides laborCostUsd when present. */
  laborCostFormula?: string;
  /** Optional CSI division code for grouping ("06" = Wood/Composites, etc.). */
  csiDivision?: string;
}

/**
 * A pre-defined variant configuration that ships with the assembly —
 * shows up in the "+ Add variant" menu so the builder can pick a
 * common alternative (Wood Casement Premium, 6" Slab, etc.) instead
 * of cloning + manually tweaking properties.
 *
 * Each preset is "label + property overrides on top of defaults," with
 * an optional assemblyId override for cross-assembly presets (e.g. a
 * Metal Roof preset that swaps to a different roof assembly entirely).
 */
export interface AssemblyVariantPreset {
  /** Display label, e.g. "Wood Casement Premium". */
  label: string;
  /** Optional one-line context shown in the menu. */
  description?: string;
  /** When set, the created variant uses this assembly instead of the
   *  parent — for presets that fundamentally swap product type. */
  assemblyId?: string;
  /** Property name → value, applied on top of assembly defaults. Any
   *  property the preset doesn't override keeps the default. */
  propertyOverrides: Record<string, number>;
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
    | "plumbing"
    | "electrical"
    | "hvac"
    | "flooring"
    | "exterior"
    | "millwork"
    | "finishes"
    | "other";
  properties: AssemblyProperty[];
  materials: AssemblyMaterial[];
  /** Curated alternative configurations the GC can pick from when
   *  adding a variant. Typically 2-4 per assembly — baseline + a few
   *  progressively-more-expensive upgrades that match real client
   *  conversations ("standard vs premium"). */
  variantPresets?: AssemblyVariantPreset[];
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
 * One variant within an AssemblyInstance — represents "an alternative
 * configuration of the same thing." E.g. a Window Unit instance might
 * have variants "Vinyl" and "Wood," each with its own property values.
 *
 * Exactly one variant is active at a time on its parent instance; the
 * active variant is the source of truth for derived QuoteLines and
 * all roll-up totals. Inactive variants are reference state only —
 * they appear as comparison chips on the card but never contribute
 * to costs.
 */
export interface AssemblyVariant {
  /** Stable id within the instance. */
  id: string;
  /** Display label, e.g. "Vinyl" or "Variant B". User-editable. */
  label: string;
  /** Reference to the Assembly definition this variant uses. Swap
   *  operates on this — different variants of the same instance can
   *  point to different assemblies (e.g. 2×6 wall vs 2×4 wall). */
  assemblyId: string;
  /** Property values that feed the assembly's formulas for this variant. */
  propertyValues: AssemblyPropertyValue[];
}

/**
 * An Assembly instance placed on an estimate — the editable record we
 * persist on the Deal. Materials are NOT snapshotted here; they're
 * derived on demand from the active variant's Assembly + property
 * values so tweaking a property (live during a client conversation)
 * regenerates the cost lines without any reconciliation.
 *
 * Each instance owns a contiguous block of derived QuoteLines, linked
 * via QuoteLine.instance_id. Editing the active variant — or switching
 * to a different one — regenerates that block in place.
 */
export interface AssemblyInstance {
  /** Stable id within the deal. Used to tag derived QuoteLines. */
  id: string;
  /** Phase label — shows in the panel + on every derived QuoteLine. */
  instanceLabel: string;
  /** All variants this instance currently carries. Always at least one. */
  variants: AssemblyVariant[];
  /** Which variant is currently active. Drives totals + QuoteLines. */
  activeVariantId: string;
  /** Legacy field — pre-variants instances stored a single property
   *  bag here. Read-only after migration; new writes go to variants[]. */
  assemblyId?: string;
  /** Legacy field — see assemblyId. */
  assemblyName?: string;
  /** Legacy field — see assemblyId. */
  propertyValues?: AssemblyPropertyValue[];
}

/** First property representing a unit count — used by the "Split 1 →"
 *  action to peel one item off an assembly with multiple identical
 *  units. Returns null when no count property exists (e.g. wall
 *  assemblies have Length, not a discrete count). */
export function findCountProperty(
  assembly: Assembly,
): AssemblyProperty | null {
  for (const p of assembly.properties) {
    if (p.kind === "option" || p.kind === "choice") continue;
    if (p.name === "Quantity") return p;
    if (p.uom === "EA") return p;
  }
  return null;
}

/** Read the active variant of an instance, falling back to the first
 *  variant if activeVariantId points to a deleted one (defensive). */
export function activeVariantOf(instance: AssemblyInstance): AssemblyVariant {
  return (
    instance.variants.find((v) => v.id === instance.activeVariantId) ??
    instance.variants[0]
  );
}

/** Migrate a legacy pre-variants instance shape into the new variants
 *  schema. Idempotent — returns the input unchanged if it's already
 *  in the new shape. Used by load paths so persisted data continues to
 *  work after the upgrade. */
export function migrateInstance(raw: AssemblyInstance): AssemblyInstance {
  if (raw.variants && raw.variants.length > 0 && raw.activeVariantId) {
    return raw;
  }
  // Legacy: assemblyId + propertyValues at the top level → wrap into one variant.
  const variantId = `var_${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: raw.id,
    instanceLabel: raw.instanceLabel,
    variants: [
      {
        id: variantId,
        label: raw.assemblyName ?? "Default",
        assemblyId: raw.assemblyId ?? "",
        propertyValues: raw.propertyValues ?? [],
      },
    ],
    activeVariantId: variantId,
  };
}
