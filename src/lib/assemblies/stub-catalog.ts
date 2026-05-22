/**
 * Stub catalog of residential framing assemblies for FrameFlow development.
 *
 * These are placeholder Assembly definitions with rough 2026 ballpark
 * costs. They exist so the UI and engine can be built and demoed before
 * the live 1build Cost Data API is wired up. The shape (Assembly type)
 * matches what 1build returns, so swapping the data source later is a
 * straight replacement — no UI changes.
 */
import type { Assembly } from "@/types/assembly";

export const STUB_ASSEMBLIES: Assembly[] = [
  {
    id: "stub-ext-wall-2x6-16oc",
    name: 'Exterior Wall — 2×6 @ 16" OC',
    description:
      "Stick-framed exterior wall with sheathing, housewrap, R-21 batt " +
      "insulation, and interior drywall. Plates assume continuous runs.",
    trade: "framing",
    properties: [
      { name: "Wall Length", uom: "LF", defaultValue: 30 },
      { name: "Wall Height", uom: "FT", defaultValue: 9 },
      { name: "Stud Spacing", uom: "IN", defaultValue: 16 },
    ],
    materials: [
      {
        name: "2×6 stud, 9' (SPF)",
        uom: "EA",
        quantityFormula: "{Wall Length} * (12 / {Stud Spacing}) + 4",
        unitCostUsd: 9.5,
        laborCostUsd: 4.0,
        csiDivision: "06",
      },
      {
        name: "2×6 top plate (double)",
        uom: "LF",
        quantityFormula: "{Wall Length} * 2",
        unitCostUsd: 2.1,
        laborCostUsd: 0.6,
        csiDivision: "06",
      },
      {
        name: "2×6 bottom plate (treated)",
        uom: "LF",
        quantityFormula: "{Wall Length}",
        unitCostUsd: 2.6,
        laborCostUsd: 0.5,
        csiDivision: "06",
      },
      {
        name: '7/16" OSB sheathing, 4×8 sheet',
        uom: "SHEET",
        quantityFormula: "{Wall Length} * {Wall Height} / 32",
        unitCostUsd: 28.0,
        laborCostUsd: 8.0,
        csiDivision: "06",
      },
      {
        name: "Housewrap",
        uom: "SF",
        quantityFormula: "{Wall Length} * {Wall Height}",
        unitCostUsd: 0.18,
        laborCostUsd: 0.25,
        csiDivision: "07",
      },
      {
        name: "R-21 batt insulation",
        uom: "SF",
        quantityFormula: "{Wall Length} * {Wall Height}",
        unitCostUsd: 1.05,
        laborCostUsd: 0.55,
        csiDivision: "07",
      },
      {
        name: '1/2" drywall, 4×8 sheet (interior side)',
        uom: "SHEET",
        quantityFormula: "{Wall Length} * {Wall Height} / 32",
        unitCostUsd: 14.5,
        laborCostUsd: 9.5,
        csiDivision: "09",
      },
    ],
  },
  {
    id: "stub-int-wall-2x4-16oc",
    name: 'Interior Wall — 2×4 @ 16" OC',
    description:
      'Stick-framed interior partition with 1/2" drywall both sides.',
    trade: "framing",
    properties: [
      { name: "Wall Length", uom: "LF", defaultValue: 12 },
      { name: "Wall Height", uom: "FT", defaultValue: 9 },
      { name: "Stud Spacing", uom: "IN", defaultValue: 16 },
    ],
    materials: [
      {
        name: "2×4 stud, 9' (SPF)",
        uom: "EA",
        quantityFormula: "{Wall Length} * (12 / {Stud Spacing}) + 2",
        unitCostUsd: 6.5,
        laborCostUsd: 3.5,
        csiDivision: "06",
      },
      {
        name: "2×4 top plate (double)",
        uom: "LF",
        quantityFormula: "{Wall Length} * 2",
        unitCostUsd: 1.4,
        laborCostUsd: 0.5,
        csiDivision: "06",
      },
      {
        name: "2×4 bottom plate",
        uom: "LF",
        quantityFormula: "{Wall Length}",
        unitCostUsd: 1.4,
        laborCostUsd: 0.4,
        csiDivision: "06",
      },
      {
        name: '1/2" drywall, 4×8 sheet (both sides)',
        uom: "SHEET",
        quantityFormula: "{Wall Length} * {Wall Height} * 2 / 32",
        unitCostUsd: 14.5,
        laborCostUsd: 9.5,
        csiDivision: "09",
      },
    ],
  },
  {
    id: "stub-floor-2x10-16oc",
    name: 'Floor System — 2×10 joists @ 16" OC',
    description:
      'Wood-framed floor system with 2×10 joists, rim joists, and 3/4" T&G subfloor.',
    trade: "framing",
    properties: [
      { name: "Floor Length", uom: "LF", defaultValue: 30 },
      { name: "Floor Width", uom: "LF", defaultValue: 24 },
      { name: "Joist Spacing", uom: "IN", defaultValue: 16 },
    ],
    materials: [
      {
        name: "2×10 joist, full length (SPF)",
        uom: "EA",
        quantityFormula: "{Floor Length} * (12 / {Joist Spacing}) + 1",
        unitCostUsd: 24.0,
        laborCostUsd: 6.5,
        csiDivision: "06",
      },
      {
        name: "2×10 rim joist",
        uom: "LF",
        quantityFormula: "{Floor Length} * 2",
        unitCostUsd: 3.2,
        laborCostUsd: 0.8,
        csiDivision: "06",
      },
      {
        name: '3/4" T&G subfloor, 4×8 sheet',
        uom: "SHEET",
        quantityFormula: "{Floor Length} * {Floor Width} / 32",
        unitCostUsd: 52.0,
        laborCostUsd: 9.0,
        csiDivision: "06",
      },
    ],
  },
];

/** Find a stub assembly by id, or null if not in the catalog. */
export function findStubAssembly(id: string): Assembly | null {
  return STUB_ASSEMBLIES.find((a) => a.id === id) ?? null;
}
