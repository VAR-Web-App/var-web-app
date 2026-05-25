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

/** Stud/joist spacing options used by several assemblies (inches OC). */
const SPACING_CHOICES = [12, 16, 24];

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
      {
        name: "Stud Spacing",
        uom: "IN",
        defaultValue: 16,
        kind: "choice",
        choices: SPACING_CHOICES,
      },
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
    variantPresets: [
      {
        label: '16" OC (standard)',
        propertyOverrides: { "Stud Spacing": 16 },
      },
      {
        label: '24" OC (code-min budget)',
        description: "Lower stud count + more insulation room",
        propertyOverrides: { "Stud Spacing": 24 },
      },
      {
        label: '12" OC (high-load)',
        description: "Heavy loads or tall walls",
        propertyOverrides: { "Stud Spacing": 12 },
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
      {
        name: "Stud Spacing",
        uom: "IN",
        defaultValue: 16,
        kind: "choice",
        choices: SPACING_CHOICES,
      },
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
    variantPresets: [
      {
        label: '16" OC (standard)',
        propertyOverrides: { "Stud Spacing": 16 },
      },
      {
        label: '24" OC (budget)',
        propertyOverrides: { "Stud Spacing": 24 },
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
      {
        name: "Joist Spacing",
        uom: "IN",
        defaultValue: 16,
        kind: "choice",
        choices: SPACING_CHOICES,
      },
    ],
    materials: [
      {
        name: "2×10 joist (SPF)",
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
    variantPresets: [
      {
        label: '16" OC (standard)',
        propertyOverrides: { "Joist Spacing": 16 },
      },
      {
        label: '12" OC (heavy-load)',
        description: "Stiffer floor — better for stone tile",
        propertyOverrides: { "Joist Spacing": 12 },
      },
    ],
  },
  {
    id: "stub-footing-strip",
    name: "Strip Footing — concrete + rebar",
    description:
      "Continuous concrete strip footing with two #5 rebar runs and form lumber. " +
      "Sized for typical residential bearing walls.",
    trade: "foundation",
    properties: [
      { name: "Footing Length", uom: "LF", defaultValue: 80 },
      { name: "Footing Width", uom: "IN", defaultValue: 16 },
      { name: "Footing Depth", uom: "IN", defaultValue: 8 },
    ],
    materials: [
      {
        name: "Ready-mix concrete (3000 PSI)",
        uom: "CY",
        // (LF × in × in) → CF via (/12)(/12), CF → CY via /27.
        quantityFormula:
          "({Footing Length} * ({Footing Width} / 12) * ({Footing Depth} / 12)) / 27",
        unitCostUsd: 195.0,
        laborCostUsd: 35.0,
        csiDivision: "03",
      },
      {
        name: "#5 rebar (two continuous runs)",
        uom: "LF",
        quantityFormula: "{Footing Length} * 2",
        unitCostUsd: 1.4,
        laborCostUsd: 0.5,
        csiDivision: "03",
      },
      {
        name: "Form lumber (2×8) + stakes",
        uom: "LF",
        quantityFormula: "{Footing Length} * 2",
        unitCostUsd: 1.1,
        laborCostUsd: 0.7,
        csiDivision: "03",
      },
    ],
    variantPresets: [
      {
        label: 'Standard residential (8" deep)',
        propertyOverrides: { "Footing Depth": 8 },
      },
      {
        label: 'Frost wall (16" deep)',
        description: "Northern climates / below frost line",
        propertyOverrides: { "Footing Depth": 16 },
      },
    ],
  },
  {
    id: "stub-slab-on-grade",
    name: "Slab on Grade — concrete + rebar grid",
    description:
      "Concrete slab on grade with 6-mil vapor barrier and #4 rebar on " +
      "approx. 24\" grid. Thickness configurable.",
    trade: "foundation",
    properties: [
      { name: "Slab Length", uom: "LF", defaultValue: 40 },
      { name: "Slab Width", uom: "LF", defaultValue: 30 },
      {
        name: "Slab Thickness",
        uom: "IN",
        defaultValue: 4,
        kind: "choice",
        choices: [4, 5, 6],
      },
    ],
    materials: [
      {
        name: "Ready-mix concrete (4000 PSI)",
        uom: "CY",
        quantityFormula:
          "({Slab Length} * {Slab Width} * ({Slab Thickness} / 12)) / 27",
        unitCostUsd: 215.0,
        laborCostUsd: 28.0,
        csiDivision: "03",
      },
      {
        name: '#4 rebar (24" grid both ways)',
        uom: "LF",
        // L runs across width spaced by 2 ft + W runs across length spaced by 2 ft.
        quantityFormula:
          "({Slab Width} / 2) * {Slab Length} + ({Slab Length} / 2) * {Slab Width}",
        unitCostUsd: 0.9,
        laborCostUsd: 0.4,
        csiDivision: "03",
      },
      {
        name: "6-mil poly vapor barrier",
        uom: "SF",
        quantityFormula: "{Slab Length} * {Slab Width} * 1.10",
        unitCostUsd: 0.22,
        laborCostUsd: 0.18,
        csiDivision: "07",
      },
    ],
    variantPresets: [
      {
        label: '4" Standard',
        propertyOverrides: { "Slab Thickness": 4 },
      },
      {
        label: '5" Light commercial',
        propertyOverrides: { "Slab Thickness": 5 },
      },
      {
        label: '6" Thickened garage / heavy load',
        propertyOverrides: { "Slab Thickness": 6 },
      },
    ],
  },
  {
    id: "stub-roof-2x8-16oc",
    name: 'Roof — 2×8 rafters @ 16" OC',
    description:
      "Conventional 2×8 rafter roof with ridge board, OSB sheathing, " +
      "and felt underlayment. The Roof Finish option drives the final " +
      "weather layer — switch between asphalt, architectural, metal, " +
      "or tile and the cost scales accordingly. Sheet/shingle areas " +
      "bumped 15% for pitch (use Roof Run = horizontal eave length).",
    trade: "roofing",
    properties: [
      { name: "Roof Run", uom: "LF", defaultValue: 40 },
      { name: "Roof Width", uom: "LF", defaultValue: 28 },
      {
        name: "Rafter Spacing",
        uom: "IN",
        defaultValue: 16,
        kind: "choice",
        choices: SPACING_CHOICES,
      },
      {
        name: "Roof Finish",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Asphalt 3-tab", value: 1.0 },
          { label: "Architectural shingles", value: 1.4 },
          { label: "Standing-seam metal", value: 3.2 },
          { label: "Concrete tile", value: 4.5 },
        ],
      },
    ],
    materials: [
      {
        name: "2×8 rafter (SPF)",
        uom: "EA",
        // Two slopes × rafter count + 4 extras for gable ends.
        quantityFormula:
          "{Roof Run} * (12 / {Rafter Spacing}) * 2 + 4",
        unitCostUsd: 14.5,
        laborCostUsd: 5.5,
        csiDivision: "06",
      },
      {
        name: "2×8 ridge board",
        uom: "LF",
        quantityFormula: "{Roof Run}",
        unitCostUsd: 3.1,
        laborCostUsd: 1.2,
        csiDivision: "06",
      },
      {
        name: '5/8" OSB roof sheathing, 4×8 sheet',
        uom: "SHEET",
        // Plan area / 32 SF per sheet × 1.15 pitch overage.
        quantityFormula:
          "{Roof Run} * {Roof Width} / 32 * 1.15",
        unitCostUsd: 32.0,
        laborCostUsd: 9.5,
        csiDivision: "06",
      },
      {
        name: "30-lb roofing felt",
        uom: "SF",
        quantityFormula: "{Roof Run} * {Roof Width} * 1.15",
        unitCostUsd: 0.14,
        laborCostUsd: 0.18,
        csiDivision: "07",
      },
      {
        name: "Roof finish (per SQ = 100 SF)",
        uom: "SQ",
        quantityFormula: "{Roof Run} * {Roof Width} / 100 * 1.15",
        // Asphalt 3-tab baseline: ~$95 mat + ~$55 labor per SQ.
        // The Roof Finish multiplier scales both proportionally.
        unitCostUsd: 0,
        unitCostFormula: "95 * {Roof Finish}",
        laborCostUsd: 0,
        laborCostFormula: "55 * {Roof Finish}",
        csiDivision: "07",
      },
    ],
    variantPresets: [
      {
        label: "Asphalt 3-tab (baseline)",
        propertyOverrides: { "Roof Finish": 1.0 },
      },
      {
        label: "Architectural shingles",
        description: "30-year dimensional shingles, mid-tier upgrade",
        propertyOverrides: { "Roof Finish": 1.4 },
      },
      {
        label: "Standing-seam metal",
        description: "Long-life premium roof — most clients see as upgrade",
        propertyOverrides: { "Roof Finish": 3.2 },
      },
      {
        label: "Concrete tile",
        description: "Tile roof — common in SW / hot climates",
        propertyOverrides: { "Roof Finish": 4.5 },
      },
    ],
  },
  {
    id: "stub-window-unit",
    name: "Window — single unit (installed)",
    description:
      "Standard residential window. Cost scales with size, frame material, " +
      "and style — change the dropdowns live with the client.",
    trade: "exterior",
    properties: [
      { name: "Width", uom: "IN", defaultValue: 30 },
      { name: "Height", uom: "IN", defaultValue: 48 },
      {
        name: "Frame Material",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Vinyl", value: 1.0 },
          { label: "Fiberglass", value: 1.85 },
          { label: "Wood", value: 2.3 },
          { label: "Aluminum-clad wood", value: 2.7 },
        ],
      },
      {
        name: "Window Style",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Picture (fixed)", value: 0.85 },
          { label: "Double-hung", value: 1.0 },
          { label: "Slider", value: 1.05 },
          { label: "Awning", value: 1.15 },
          { label: "Casement", value: 1.2 },
        ],
      },
      { name: "Quantity", uom: "EA", defaultValue: 1 },
    ],
    materials: [
      {
        name: "Window unit + flashing + trim (installed)",
        uom: "EA",
        quantityFormula: "{Quantity}",
        // Vinyl double-hung baseline: ~$265 mat + ~$105 labor for 30×48.
        // Formulas scale with size and the chosen frame/style.
        unitCostUsd: 0,
        unitCostFormula:
          "(120 + {Width} * {Height} * 0.10) * {Frame Material} * {Window Style}",
        laborCostUsd: 0,
        laborCostFormula:
          "(55 + {Width} * {Height} * 0.022) * {Window Style}",
        csiDivision: "08",
      },
    ],
    variantPresets: [
      {
        label: "Vinyl Double-hung (baseline)",
        propertyOverrides: { "Frame Material": 1.0, "Window Style": 1.0 },
      },
      {
        label: "Fiberglass Casement",
        description: "Stronger frame, broader sash",
        propertyOverrides: { "Frame Material": 1.85, "Window Style": 1.2 },
      },
      {
        label: "Wood Casement Premium",
        propertyOverrides: { "Frame Material": 2.3, "Window Style": 1.2 },
      },
      {
        label: "Aluminum-clad Wood Premium",
        description: "Wood inside, weatherproof outside",
        propertyOverrides: { "Frame Material": 2.7, "Window Style": 1.0 },
      },
    ],
  },
  {
    id: "stub-door-interior",
    name: "Door — interior, single unit (installed)",
    description: "Pre-hung interior door with casing and hardware.",
    trade: "millwork",
    properties: [
      { name: "Width", uom: "IN", defaultValue: 30 },
      { name: "Height", uom: "IN", defaultValue: 80 },
      {
        name: "Door Type",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Hollow-core flat", value: 1.0 },
          { label: "Hollow-core 6-panel", value: 1.2 },
          { label: "Solid-core", value: 1.6 },
          { label: "Glass panel", value: 2.1 },
        ],
      },
      { name: "Quantity", uom: "EA", defaultValue: 1 },
    ],
    materials: [
      {
        name: "Pre-hung interior door + casing + hardware",
        uom: "EA",
        quantityFormula: "{Quantity}",
        unitCostUsd: 0,
        unitCostFormula: "(110 + {Width} * {Height} * 0.06) * {Door Type}",
        laborCostUsd: 85.0,
        csiDivision: "08",
      },
    ],
    variantPresets: [
      {
        label: "Hollow-core 6-panel (standard)",
        propertyOverrides: { "Door Type": 1.2 },
      },
      {
        label: "Solid-core (quiet)",
        description: "Heavier, better sound dampening",
        propertyOverrides: { "Door Type": 1.6 },
      },
      {
        label: "Glass panel (French)",
        propertyOverrides: { "Door Type": 2.1 },
      },
    ],
  },
  {
    id: "stub-door-exterior",
    name: "Door — exterior, single unit (installed)",
    description: "Pre-hung exterior door with threshold, weather-strip, and lockset.",
    trade: "exterior",
    properties: [
      { name: "Width", uom: "IN", defaultValue: 36 },
      { name: "Height", uom: "IN", defaultValue: 80 },
      {
        name: "Door Material",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Steel, insulated", value: 1.0 },
          { label: "Fiberglass", value: 1.6 },
          { label: "Wood", value: 2.5 },
        ],
      },
      { name: "Quantity", uom: "EA", defaultValue: 1 },
    ],
    materials: [
      {
        name: "Pre-hung exterior door + lockset + threshold",
        uom: "EA",
        quantityFormula: "{Quantity}",
        unitCostUsd: 0,
        unitCostFormula:
          "(280 + {Width} * {Height} * 0.10) * {Door Material}",
        laborCostUsd: 0,
        laborCostFormula: "135 + {Width} * {Height} * 0.04",
        csiDivision: "08",
      },
    ],
    variantPresets: [
      {
        label: "Steel Insulated (standard)",
        propertyOverrides: { "Door Material": 1.0 },
      },
      {
        label: "Fiberglass Premium",
        description: "Better insulation + dent resistance",
        propertyOverrides: { "Door Material": 1.6 },
      },
      {
        label: "Solid Wood Entry",
        propertyOverrides: { "Door Material": 2.5 },
      },
    ],
  },
  {
    id: "stub-interior-paint",
    name: "Interior paint — walls (primer + 2 coats)",
    description:
      "Interior wall paint, primer plus two finish coats. Use total wall area " +
      "(LF wall × ceiling height) for the surface count.",
    trade: "finishes",
    properties: [
      { name: "Wall Area", uom: "SF", defaultValue: 800 },
      {
        name: "Paint Grade",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Builder", value: 1.0 },
          { label: "Mid (eggshell, washable)", value: 1.25 },
          { label: "Premium (low-VOC, designer)", value: 1.7 },
        ],
      },
    ],
    materials: [
      {
        name: "Paint + primer + sundries (per SF, 2 coats)",
        uom: "SF",
        quantityFormula: "{Wall Area}",
        unitCostUsd: 0,
        unitCostFormula: "0.42 * {Paint Grade}",
        laborCostUsd: 0,
        laborCostFormula: "0.65 * {Paint Grade}",
        csiDivision: "09",
      },
    ],
    variantPresets: [
      {
        label: "Builder grade",
        propertyOverrides: { "Paint Grade": 1.0 },
      },
      {
        label: "Mid eggshell (washable)",
        propertyOverrides: { "Paint Grade": 1.25 },
      },
      {
        label: "Premium low-VOC",
        description: "Designer line, low odor",
        propertyOverrides: { "Paint Grade": 1.7 },
      },
    ],
  },
  {
    id: "stub-siding",
    name: "Siding — exterior cladding (installed)",
    description:
      "Exterior wall cladding with house wrap and fasteners. Material " +
      "drives most of the cost — switch the option dropdown live with " +
      "the client (board & batten, vinyl, fiber cement, stone veneer).",
    trade: "exterior",
    properties: [
      { name: "Wall Area", uom: "SF", defaultValue: 2000 },
      {
        name: "Siding Material",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Vinyl", value: 1.0 },
          { label: "LP SmartSide", value: 1.6 },
          { label: "Board & batten (cedar)", value: 2.4 },
          { label: "Fiber cement (Hardie)", value: 2.0 },
          { label: "Stone veneer (accent)", value: 4.5 },
          { label: "Brick (full)", value: 3.8 },
        ],
      },
    ],
    materials: [
      {
        name: "Siding material (per SF, installed)",
        uom: "SF",
        quantityFormula: "{Wall Area}",
        // Vinyl baseline: ~$3.50 mat + ~$3.00 labor per SF. Multiplier
        // shifts both proportionally; tweak per-line if needed.
        unitCostUsd: 0,
        unitCostFormula: "3.50 * {Siding Material}",
        laborCostUsd: 0,
        laborCostFormula: "3.00 * {Siding Material}",
        csiDivision: "07",
      },
      {
        name: "House wrap (Tyvek) + tape",
        uom: "SF",
        quantityFormula: "{Wall Area} * 1.05",
        unitCostUsd: 0.18,
        laborCostUsd: 0.20,
        csiDivision: "07",
      },
      {
        name: "Trim, J-channel, corner boards",
        uom: "LF",
        // Roughly 4-5 LF of trim per 100 SF of wall — covers windows, doors,
        // corners, transitions. Use 0.045 ratio as a working baseline.
        quantityFormula: "{Wall Area} * 0.045",
        unitCostUsd: 2.40,
        laborCostUsd: 1.80,
        csiDivision: "07",
      },
    ],
    variantPresets: [
      {
        label: "Vinyl (baseline)",
        propertyOverrides: { "Siding Material": 1.0 },
      },
      {
        label: "LP SmartSide",
        description: "Engineered wood, paintable",
        propertyOverrides: { "Siding Material": 1.6 },
      },
      {
        label: "Fiber cement (Hardie)",
        propertyOverrides: { "Siding Material": 2.0 },
      },
      {
        label: "Cedar Board & Batten",
        propertyOverrides: { "Siding Material": 2.4 },
      },
      {
        label: "Brick (full)",
        propertyOverrides: { "Siding Material": 3.8 },
      },
      {
        label: "Stone Veneer accent",
        propertyOverrides: { "Siding Material": 4.5 },
      },
    ],
  },
  {
    id: "stub-stair-package",
    name: "Stairs — straight run (installed)",
    description:
      "Wood-framed straight-run staircase with stringers, treads, risers, " +
      "and 36\" guardrails. Rise/run set per code; 17 risers typical " +
      "between floors with 9' ceilings.",
    trade: "framing",
    properties: [
      { name: "Risers", uom: "EA", defaultValue: 17 },
      { name: "Stair Width", uom: "IN", defaultValue: 40 },
      {
        name: "Stringer Count",
        uom: "EA",
        defaultValue: 3,
        kind: "choice",
        choices: [2, 3, 4],
      },
      { name: "Guardrail Length", uom: "LF", defaultValue: 18 },
      {
        name: "Tread Material",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Pine (paint grade)", value: 1.0 },
          { label: "Red oak", value: 1.8 },
          { label: "White oak", value: 2.3 },
        ],
      },
    ],
    materials: [
      {
        name: "2×12 stringer (SPF)",
        uom: "EA",
        // Default 3 stringers — code typically requires it for stairs >36"
        // wide. Override the Stringer Count property for narrow runs.
        quantityFormula: "{Stringer Count}",
        unitCostUsd: 38.0,
        laborCostUsd: 12.0,
        csiDivision: "06",
      },
      {
        name: 'Tread (1-1/16" x stair width)',
        uom: "EA",
        quantityFormula: "{Risers} - 1",
        unitCostUsd: 0,
        unitCostFormula: "(22 + {Stair Width} * 0.6) * {Tread Material}",
        laborCostUsd: 8.0,
        csiDivision: "06",
      },
      {
        name: 'Riser (3/4" pine)',
        uom: "EA",
        quantityFormula: "{Risers}",
        unitCostUsd: 9.5,
        laborCostUsd: 5.0,
        csiDivision: "06",
      },
      {
        name: '36" guardrail w/ balusters + newel',
        uom: "LF",
        quantityFormula: "{Guardrail Length}",
        unitCostUsd: 42.0,
        laborCostUsd: 28.0,
        csiDivision: "06",
      },
    ],
    variantPresets: [
      {
        label: "Pine paint-grade (standard)",
        propertyOverrides: { "Tread Material": 1.0 },
      },
      {
        label: "Red Oak (mid)",
        propertyOverrides: { "Tread Material": 1.8 },
      },
      {
        label: "White Oak (premium)",
        propertyOverrides: { "Tread Material": 2.3 },
      },
    ],
  },
  {
    id: "stub-drainage",
    name: "Gutters & Downspouts",
    description:
      "Aluminum K-style gutter with downspouts at corners. Use perimeter " +
      "of roof eave for the LF count.",
    trade: "exterior",
    properties: [
      { name: "Eave Length", uom: "LF", defaultValue: 200 },
      { name: "Downspouts", uom: "EA", defaultValue: 8 },
      {
        name: "Gutter Material",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Aluminum (5\")", value: 1.0 },
          { label: "Aluminum (6\" oversize)", value: 1.3 },
          { label: "Copper", value: 5.5 },
          { label: "Galvanized steel", value: 1.6 },
        ],
      },
    ],
    materials: [
      {
        name: "K-style gutter (per LF, installed)",
        uom: "LF",
        quantityFormula: "{Eave Length}",
        unitCostUsd: 0,
        unitCostFormula: "5.50 * {Gutter Material}",
        laborCostUsd: 4.50,
        csiDivision: "07",
      },
      {
        name: "Downspout w/ extensions",
        uom: "EA",
        quantityFormula: "{Downspouts}",
        unitCostUsd: 0,
        unitCostFormula: "38 * {Gutter Material}",
        laborCostUsd: 35.0,
        csiDivision: "07",
      },
      {
        name: "Hangers, end caps, miters, fasteners",
        uom: "LF",
        // Hardware ratio per LF of gutter run.
        quantityFormula: "{Eave Length}",
        unitCostUsd: 0.85,
        laborCostUsd: 0.30,
        csiDivision: "07",
      },
    ],
    variantPresets: [
      {
        label: 'Aluminum 5" (standard)',
        propertyOverrides: { "Gutter Material": 1.0 },
      },
      {
        label: 'Aluminum 6" oversize',
        description: "Higher flow for big roof areas",
        propertyOverrides: { "Gutter Material": 1.3 },
      },
      {
        label: "Galvanized steel",
        propertyOverrides: { "Gutter Material": 1.6 },
      },
      {
        label: "Copper (premium)",
        description: "Long-life, ages to patina",
        propertyOverrides: { "Gutter Material": 5.5 },
      },
    ],
  },
  {
    id: "stub-garage-door",
    name: "Garage Door (installed)",
    description:
      "Sectional overhead garage door with opener, tracks, and weather " +
      "seal. Width drives most of the cost; insulation + window options " +
      "scale via the dropdown.",
    trade: "exterior",
    properties: [
      { name: "Width", uom: "FT", defaultValue: 16 },
      { name: "Height", uom: "FT", defaultValue: 7 },
      { name: "Quantity", uom: "EA", defaultValue: 1 },
      {
        name: "Door Style",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Steel, non-insulated", value: 1.0 },
          { label: "Steel, insulated", value: 1.4 },
          { label: "Steel + window row", value: 1.7 },
          { label: "Carriage house (wood)", value: 3.2 },
          { label: "Glass + aluminum (modern)", value: 4.5 },
        ],
      },
      {
        name: "Opener",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Chain drive (1/2 HP)", value: 1.0 },
          { label: "Belt drive (3/4 HP, quiet)", value: 1.6 },
          { label: "Direct/wall mount (smart)", value: 2.4 },
        ],
      },
    ],
    materials: [
      {
        name: "Garage door + tracks + hardware (installed)",
        uom: "EA",
        quantityFormula: "{Quantity}",
        unitCostUsd: 0,
        // Single-bay baseline: ~$650 for a steel 9×7 non-insulated.
        // Scales with area + style multiplier.
        unitCostFormula:
          "(400 + {Width} * {Height} * 6.5) * {Door Style}",
        laborCostUsd: 0,
        laborCostFormula:
          "180 + {Width} * 8",
        csiDivision: "08",
      },
      {
        name: "Opener + remotes + wiring",
        uom: "EA",
        quantityFormula: "{Quantity}",
        unitCostUsd: 0,
        unitCostFormula: "220 * {Opener}",
        laborCostUsd: 95.0,
        csiDivision: "08",
      },
    ],
    variantPresets: [
      {
        label: "Steel Insulated + Belt opener (standard)",
        propertyOverrides: { "Door Style": 1.4, Opener: 1.6 },
      },
      {
        label: "Steel + windows",
        propertyOverrides: { "Door Style": 1.7, Opener: 1.6 },
      },
      {
        label: "Carriage House (wood)",
        propertyOverrides: { "Door Style": 3.2, Opener: 1.6 },
      },
      {
        label: "Modern glass + aluminum",
        description: "Contemporary look, premium",
        propertyOverrides: { "Door Style": 4.5, Opener: 2.4 },
      },
    ],
  },
  {
    id: "stub-hardwood-floor",
    name: 'Hardwood flooring — 3/4" solid (installed)',
    description:
      "Solid 3/4-inch tongue-and-groove hardwood with sanding and finish. " +
      "Wood species drives the material cost.",
    trade: "flooring",
    properties: [
      { name: "Floor Area", uom: "SF", defaultValue: 500 },
      {
        name: "Wood Species",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Red oak", value: 1.0 },
          { label: "White oak", value: 1.3 },
          { label: "Maple", value: 1.4 },
          { label: "Hickory", value: 1.7 },
          { label: "Walnut", value: 2.8 },
        ],
      },
    ],
    materials: [
      {
        name: "Hardwood flooring + underlayment + finish",
        uom: "SF",
        quantityFormula: "{Floor Area}",
        unitCostUsd: 0,
        unitCostFormula: "7.50 * {Wood Species}",
        laborCostUsd: 4.5,
        csiDivision: "09",
      },
    ],
    variantPresets: [
      {
        label: "Red Oak (standard)",
        propertyOverrides: { "Wood Species": 1.0 },
      },
      {
        label: "White Oak",
        propertyOverrides: { "Wood Species": 1.3 },
      },
      {
        label: "Maple",
        propertyOverrides: { "Wood Species": 1.4 },
      },
      {
        label: "Hickory",
        propertyOverrides: { "Wood Species": 1.7 },
      },
      {
        label: "Walnut (premium)",
        propertyOverrides: { "Wood Species": 2.8 },
      },
    ],
  },
];

/** Find a stub assembly by id, or null if not in the catalog. */
export function findStubAssembly(id: string): Assembly | null {
  return STUB_ASSEMBLIES.find((a) => a.id === id) ?? null;
}
