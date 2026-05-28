/**
 * Stub catalog of residential framing assemblies for KeystonePro development.
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
    catId: "40", // FRAMING — wall studs, plates, sheathing
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
      // Total LF of gable-wall studs above the eave plate at every
      // gable end. Set by the converter from roof geometry on
      // multi-story plans (~footprint width × 6' average gable
      // height × 2 ends). Default 0 means no gable framing — fine
      // for pure hip-roof or single-story slab plans.
      { name: "Gable Wall LF", uom: "LF", defaultValue: 0 },
    ],
    materials: [
      {
        name: "2×6 stud, 9' (SPF)",
        uom: "EA",
        // Base stud count from spacing × 1.25 buffer for corners (3-stud
        // corners × 4), headers + cripples at every opening (~4 studs
        // per door/window). Architect-spec counts run ~25% above the bare
        // LF/spacing math, which the previous "+4" undershoot.
        quantityFormula: "{Wall Length} * (12 / {Stud Spacing}) * 1.25",
        unitCostUsd: 9.5,
        laborCostUsd: 4.0,
        csiDivision: "06",
      },
      {
        name: "2×6 gable-wall studs (variable length)",
        uom: "LF",
        // Total LF of gable studs as set by the converter / builder.
        // Sold by LF rather than EA because gable studs come in many
        // lengths (taper from peak to eave) — architects spec the
        // total LF in the cut list rather than a piece count.
        // Maddox spec: 741 LF on a 2-story custom + 2 gable ends.
        quantityFormula: "{Gable Wall LF}",
        unitCostUsd: 1.10,
        laborCostUsd: 0.55,
        csiDivision: "06",
      },
      {
        name: "2×6 top plate (double)",
        uom: "LF",
        // Main wall plates + ~10% additional for gable rake plates
        // that follow the roof slope at every gable end. Architect
        // spec on Maddox: 27 plates beyond the rectangular wall plane.
        quantityFormula: "{Wall Length} * 2 + {Gable Wall LF} * 0.15",
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
        // Rectangular wall plane + gable triangle sheathing. Each LF
        // of gable stud carries ~0.5 SF of triangle sheathing on
        // average (gables taper). Architect spec on Maddox: 32 gable
        // sheets ≈ 1024 SF gable sheathing on 741 LF gable studs.
        quantityFormula:
          "({Wall Length} * {Wall Height} + {Gable Wall LF} * 0.5) / 32",
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
        catId: "50", // Insulation
      },
      {
        name: '1/2" drywall, 4×8 sheet (interior side)',
        uom: "SHEET",
        quantityFormula: "{Wall Length} * {Wall Height} / 32",
        unitCostUsd: 14.5,
        laborCostUsd: 9.5,
        csiDivision: "09",
        catId: "51", // DRYWALL
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
    catId: "40", // FRAMING — interior partition walls
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
        // 1.20 buffer: corner studs + jacks/cripples at openings.
        // Slightly less than the exterior wall's 1.25 because interior
        // partitions have fewer openings per LF on average.
        quantityFormula: "{Wall Length} * (12 / {Stud Spacing}) * 1.20",
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
        catId: "51", // DRYWALL
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
    catId: "40", // FRAMING — floor joist system
    name: 'Floor System — joists @ 16" OC',
    description:
      "Wood-framed floor system with joists, rim joist, and 3/4\" T&G " +
      "subfloor. Joist type drives unit cost — engineered I-joists span " +
      "farther and run more expensive than dimensional lumber but are " +
      "the standard on most modern custom plans (architect-spec'd).",
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
      {
        name: "Joist Type",
        uom: "",
        // 1.0 baseline = 2×10 SPF dimensional ($24/EA cost basis).
        // Multipliers scale the joist line. I-joists are sold by LF in
        // real life but treated as per-piece here so the assembly stays
        // uniform; the multiplier captures the cost delta.
        defaultValue: 2.2,
        kind: "option",
        options: [
          { label: "2×10 dimensional (SPF)", value: 1.0 },
          { label: '11-7/8" I-joist (engineered)', value: 2.2 },
          { label: '14" I-joist (longer spans)', value: 2.9 },
          { label: '16" I-joist (premium / heavy load)', value: 3.6 },
          { label: "Floor truss (open-web)", value: 3.4 },
        ],
      },
      // R-19 batt insulation between joists from below, common on
      // crawl-space foundations where there's no conditioned
      // basement under the first floor. Default 0 (no insulation
      // line) — slab plans and basements don't need it. Converter
      // sets to floor area when foundation is crawl.
      { name: "Floor Insulation Area", uom: "SF", defaultValue: 0 },
      // Multiplier on top of the bare length-divided-by-spacing math
      // to cover doubled joists at openings, bearing-wall pickup,
      // and beam landings. 1.5 is the median for a typical beam
      // layout; 2.0+ for custom plans with multiple intersecting
      // beams, floor recesses, or large stair openings. The
      // converter back-solves this from the architect's joist
      // schedule count when one is surfaced; builders adjust per
      // project from the assembly card.
      { name: "Joist Buffer", uom: "", defaultValue: 1.5 },
    ],
    materials: [
      {
        name: "Floor joist (per joist type)",
        uom: "EA",
        // Bare count = Floor Length / Joist Spacing; the Joist Buffer
        // multiplier then covers doubled joists, beam landings, and
        // length-binning on custom plans where architects spec many
        // sub-spans rather than one continuous run.
        quantityFormula:
          "{Floor Length} * (12 / {Joist Spacing}) * {Joist Buffer}",
        unitCostUsd: 0,
        // 24 = dimensional 2×10 baseline; multiplier scales to I-joists.
        unitCostFormula: "24 * {Joist Type}",
        laborCostUsd: 0,
        laborCostFormula: "6.5 * {Joist Type}",
        csiDivision: "06",
      },
      {
        name: "Rim board (LVL for I-joist systems, 2×10 for dimensional)",
        uom: "LF",
        quantityFormula: "{Floor Length} * 2",
        unitCostUsd: 0,
        // 3.2 = 2×10 rim board; I-joist systems use LVL rim @ ~$8.50/LF.
        unitCostFormula: "3.2 * {Joist Type}",
        laborCostUsd: 0.8,
        csiDivision: "06",
      },
      {
        name: "R-19 floor batt insulation (under crawl-space joists)",
        uom: "SF",
        // Gated on Floor Insulation Area. Zero produces no line.
        quantityFormula: "{Floor Insulation Area}",
        unitCostUsd: 0.95,
        laborCostUsd: 0.65,
        csiDivision: "07",
        catId: "50", // Insulation (Barry's section)
      },
      {
        name: '3/4" T&G subfloor, 4×8 sheet',
        uom: "SHEET",
        // 1.10 waste factor — sheets get ripped at stair openings,
        // mech room platforms, plumbing chases, and the perimeter
        // band where the floor rectangle meets the joist layout.
        // Cnadd cross-check showed the previous no-waste formula
        // was shorting both floors against the architect's count.
        quantityFormula: "{Floor Length} * {Floor Width} / 32 * 1.10",
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
    catId: "21", // FOOTINGS
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
        name: "#5 rebar (three continuous runs)",
        uom: "LF",
        // Three continuous bars in the footing is the residential
        // standard (one top, two bottom) per IRC R403.1.3 for footings
        // wider than 16". Architect specs on Maddox-class plans
        // typically call out 3 runs explicitly.
        quantityFormula: "{Footing Length} * 3",
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
    catId: "26", // SLAB
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
    id: "stub-cmu-foundation-wall",
    catId: "24", // FOUNDATION WALLS
    name: "CMU Foundation Wall — 8×8×16 block",
    description:
      "Concrete masonry unit (8×8×16 block) foundation wall with mortar, " +
      "#4 vertical rebar at 32\" OC, bond beam at the top course, and " +
      "pad footings under interior piers. Block count assumes standard " +
      "8\" tall × 16\" wide units = 1.125 blocks per SF of wall.",
    trade: "foundation",
    properties: [
      { name: "Wall Length", uom: "LF", defaultValue: 100 },
      { name: "Wall Height", uom: "FT", defaultValue: 8 },
      {
        // Interior CMU piers that support floor beams and ridge loads.
        // Each pier needs a 24×24×12 pad footing under it. Default 8
        // covers a typical 2,500-3,000 SF house; large houses can run
        // 20+ piers. Builder adjusts per project.
        name: "Pier Count",
        uom: "EA",
        defaultValue: 8,
      },
      {
        // Crawl-space floor area for compacted sand fill — set by the
        // converter when foundation is crawl space, left at 0 for
        // full basements (where the floor is the slab, not sand).
        name: "Crawl Floor Area",
        uom: "SF",
        defaultValue: 0,
      },
    ],
    materials: [
      {
        name: "CMU block (8×8×16)",
        uom: "EA",
        // 1.125 blocks per SF of wall (8" tall × 16" wide).
        quantityFormula: "{Wall Length} * {Wall Height} * 1.125",
        unitCostUsd: 2.4,
        laborCostUsd: 4.2,
        csiDivision: "04",
      },
      {
        name: "Mortar mix (Type S, 70-lb bags)",
        uom: "BAG",
        // Roughly 1 bag per 30 blocks.
        quantityFormula: "({Wall Length} * {Wall Height} * 1.125) / 30",
        unitCostUsd: 9.5,
        laborCostUsd: 0,
        csiDivision: "04",
      },
      {
        name: "#4 vertical rebar (32\" OC, full height + lap)",
        uom: "LF",
        // One vertical per 32" = 0.375 verticals per LF, each height+1ft lap.
        quantityFormula: "({Wall Length} * 0.375) * ({Wall Height} + 1)",
        unitCostUsd: 0.95,
        laborCostUsd: 0.4,
        csiDivision: "03",
      },
      {
        name: "Bond beam (top course, grout-filled + 2× #4)",
        uom: "LF",
        quantityFormula: "{Wall Length}",
        unitCostUsd: 3.8,
        laborCostUsd: 2.1,
        csiDivision: "04",
      },
      {
        // CMU piers — each sits on a pad footing handled separately
        // below. Block count = ~2 blocks per pier for typical 32-40"
        // crawl-space piers. Previously 5 (basement-grade) — too tall
        // for the residential crawl-space case which dominates the
        // installed base. Maddox cross-check: architect spec = 73
        // piers / 73 blocks (1 each), our old 5× formula overshot by
        // ~290 blocks. 2 is a safer middle ground that handles taller
        // mid-span piers without doubling up on short ones.
        name: "CMU pier blocks (interior)",
        uom: "EA",
        quantityFormula: "{Pier Count} * 2",
        unitCostUsd: 2.4,
        laborCostUsd: 4.2,
        csiDivision: "04",
      },
      {
        // Pad footing under each pier: 24×24×12 = 4 SF × 12" = 0.15 CY.
        // The 24×24 dimensions are residential standard for a single
        // interior pier on undisturbed soil.
        name: "Pier pad footings (24×24×12 concrete)",
        uom: "CY",
        quantityFormula: "{Pier Count} * 0.15",
        unitCostUsd: 195.0,
        laborCostUsd: 75.0,
        csiDivision: "03",
      },
      {
        // PT 2×8 sill plate sits on top course of CMU as the bearing
        // for first-floor framing. Architect spec on Maddox: 256 LF
        // (16 ea × 16'). Scales linearly with perimeter.
        name: "PT 2×8 sill plate",
        uom: "LF",
        quantityFormula: "{Wall Length}",
        unitCostUsd: 2.4,
        laborCostUsd: 0.6,
        csiDivision: "06",
      },
      {
        // Galvanized termite shield sits between the sill plate and
        // the CMU bond beam — required by code in termite-zone
        // climates (most of the South/Southeast). Same LF as sill.
        name: "Termite shield (galvanized)",
        uom: "LF",
        quantityFormula: "{Wall Length}",
        unitCostUsd: 0.85,
        laborCostUsd: 0.35,
        csiDivision: "07",
      },
      {
        // Compacted sand fill for the crawl-space floor. Only generated
        // when the converter sets Crawl Floor Area > 0 (crawl-space
        // foundations); basements have a slab floor instead.
        name: "Compacted sand fill (crawl-space floor)",
        uom: "SF",
        quantityFormula: "{Crawl Floor Area}",
        unitCostUsd: 0.45,
        laborCostUsd: 0.55,
        csiDivision: "31",
        catId: "28", // GRAVEL (closest Barry-template fit)
      },
    ],
    variantPresets: [
      {
        label: "Standard 8 ft basement wall",
        propertyOverrides: { "Wall Height": 8 },
      },
      {
        label: "9 ft tall (extra-height basement)",
        propertyOverrides: { "Wall Height": 9 },
      },
      {
        label: "Crawl space (4 ft)",
        description: "Half-height stem wall for crawl-space foundations",
        propertyOverrides: { "Wall Height": 4 },
      },
    ],
  },
  {
    id: "stub-lvl-beam-package",
    catId: "40", // FRAMING — LVL girders + floor beams
    name: "LVL Beam Package — engineered girders + floor beams",
    description:
      "Engineered LVL beams for floor girders, ceiling beams, and " +
      "large openings. Architect-spec'd plans typically run 15-30 LVL " +
      "assemblies on a 2-story custom home. Total LF defaults to " +
      "conditioned area ÷ 12 (Maddox-class plans run ~1 LF of LVL per " +
      "12 SF of conditioned area); builder adjusts per project.",
    trade: "framing",
    properties: [
      {
        name: "Total LVL LF",
        uom: "LF",
        defaultValue: 300,
      },
      {
        name: "Beam Grade",
        uom: "",
        // 1.0 = 1-3/4" × 11-7/8" 2.0E LVL baseline.
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: '1-3/4" × 9-1/2" LVL (light)', value: 0.75 },
          { label: '1-3/4" × 11-7/8" LVL (standard)', value: 1.0 },
          { label: '1-3/4" × 14" LVL (heavy)', value: 1.4 },
          { label: '1-3/4" × 16" LVL (long-span)', value: 1.7 },
          { label: 'PSL 5-1/4" × 11-7/8" (porch / columns)', value: 1.9 },
        ],
      },
    ],
    materials: [
      {
        name: "LVL beam material",
        uom: "LF",
        quantityFormula: "{Total LVL LF}",
        unitCostUsd: 0,
        // 18 = $18/LF for standard 1-3/4"×11-7/8" LVL.
        unitCostFormula: "18 * {Beam Grade}",
        laborCostUsd: 0,
        laborCostFormula: "5 * {Beam Grade}",
        csiDivision: "06",
      },
      {
        name: "Beam hangers (galvanized, per beam end)",
        uom: "EA",
        // Assume 1 hanger per 12 LF of beam (each beam has 2 ends; avg
        // beam length ~12 LF → ~1 hanger per 6 LF). Round formula:
        // 1 hanger per 6 LF gives a reasonable scaled count.
        quantityFormula: "{Total LVL LF} / 6",
        unitCostUsd: 12.0,
        laborCostUsd: 4.0,
        csiDivision: "05",
      },
      {
        name: "Lag bolts + structural screws (per beam)",
        uom: "EA",
        quantityFormula: "{Total LVL LF} / 1.5",
        unitCostUsd: 1.4,
        laborCostUsd: 0,
        csiDivision: "05",
      },
    ],
    variantPresets: [
      {
        label: "Standard 11-7/8\" LVL (whole-house default)",
        propertyOverrides: { "Beam Grade": 1.0 },
      },
      {
        label: "Heavy 14\" LVL (longer spans + 2-story loads)",
        propertyOverrides: { "Beam Grade": 1.4 },
      },
    ],
  },
  {
    id: "stub-porch-system",
    catId: "43", // HARDIE, VINYL, & PORCHES
    name: "Porch & Deck System — framing + decking + columns",
    description:
      "Covered porch / open deck structural and finish package: PT " +
      "joists, PT/PSL beams, decking, columns, and porch ceiling " +
      "finish. Sized by Porch Area; Column Count defaults to 1 per " +
      "8 LF of porch perimeter (rough rule). Porch ROOF is counted " +
      "separately in the main Roof System assembly — this is just the " +
      "floor / structure / columns / ceiling.",
    trade: "framing",
    properties: [
      { name: "Porch Area", uom: "SF", defaultValue: 320 },
      { name: "Column Count", uom: "EA", defaultValue: 6 },
      {
        name: "Decking Material",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "5/4 PT pine decking (budget)", value: 1.0 },
          { label: "Composite (Trex / similar)", value: 2.2 },
          { label: "Ipe / tropical hardwood", value: 3.5 },
        ],
      },
    ],
    materials: [
      {
        name: "PT 2×8 deck joists @ 16\" OC",
        uom: "EA",
        // Assume 1.4:1 ratio rectangle, joists run the short way.
        // Joist count ≈ Length × 0.75 where Length = sqrt(Area×1.4).
        quantityFormula:
          "(({Porch Area} * 1.4) ^ 0.5) * 0.75",
        unitCostUsd: 18.0,
        laborCostUsd: 6.0,
        csiDivision: "06",
      },
      {
        name: "PT 2×10 deck beams + rim",
        uom: "LF",
        // Perimeter approximation + interior beam line.
        quantityFormula: "(({Porch Area} / 1.4) ^ 0.5) * 5",
        unitCostUsd: 4.5,
        laborCostUsd: 1.4,
        csiDivision: "06",
      },
      {
        name: "Porch decking boards (incl. 8% waste)",
        uom: "SF",
        quantityFormula: "{Porch Area} * 1.08",
        unitCostUsd: 0,
        unitCostFormula: "4.5 * {Decking Material}",
        laborCostUsd: 0,
        laborCostFormula: "2.5 * {Decking Material}",
        csiDivision: "06",
      },
      {
        name: "10×10 PT porch column",
        uom: "EA",
        quantityFormula: "{Column Count}",
        unitCostUsd: 145.0,
        laborCostUsd: 65.0,
        csiDivision: "06",
      },
      {
        name: "Column base + cap hardware (galvanized)",
        uom: "EA",
        quantityFormula: "{Column Count}",
        unitCostUsd: 38.0,
        laborCostUsd: 12.0,
        csiDivision: "05",
      },
      {
        // Decorative column corbels at the top of each column —
        // common on Craftsman / Southern Living porch styles. Default
        // matches Column Count 1:1; builders zero out when the design
        // is clean/contemporary.
        name: "Decorative column corbel (per column)",
        uom: "EA",
        quantityFormula: "{Column Count}",
        unitCostUsd: 65.0,
        laborCostUsd: 35.0,
        csiDivision: "06",
      },
      {
        name: "Porch ceiling finish (bead board / soffit panel)",
        uom: "SF",
        quantityFormula: "{Porch Area}",
        unitCostUsd: 3.2,
        laborCostUsd: 2.4,
        csiDivision: "09",
      },
      {
        name: "Vented soffit panel + fascia",
        uom: "LF",
        // Perimeter of porch roof = porch perimeter (no interior soffit).
        quantityFormula: "(({Porch Area} * 1.4) ^ 0.5 + ({Porch Area} / 1.4) ^ 0.5) * 2",
        unitCostUsd: 5.8,
        laborCostUsd: 3.2,
        csiDivision: "07",
      },
    ],
    variantPresets: [
      {
        label: "Standard PT porch (covered)",
        propertyOverrides: { "Decking Material": 1.0 },
      },
      {
        label: "Composite porch / deck",
        description: "Trex or similar; lower maintenance, higher cost",
        propertyOverrides: { "Decking Material": 2.2 },
      },
    ],
  },
  {
    id: "stub-headers",
    catId: "40", // FRAMING — structural headers
    name: "Structural Headers — door + window openings",
    description:
      "Bundled header package for every door/window opening in the " +
      "framed envelope. Dimensional headers (doubled 2×10/2×12) cover " +
      "standard openings up to ~6'; LVL headers cover larger spans " +
      "(8-17') including garage doors and great-room openings. Counts " +
      "default to one header per opening; builder can adjust for " +
      "unusual layouts.",
    trade: "framing",
    properties: [
      {
        // Door + window openings combined. Defaults assume the converter
        // populated this from extraction.doors_windows totals.
        name: "Standard Openings",
        uom: "EA",
        defaultValue: 30,
      },
      {
        // Large spans needing LVL (garage door, great-room, kitchen island).
        name: "LVL Headers",
        uom: "EA",
        defaultValue: 5,
      },
    ],
    materials: [
      {
        name: "Doubled 2×10 header (per opening, avg 4 LF)",
        uom: "EA",
        quantityFormula: "{Standard Openings}",
        unitCostUsd: 26.0,
        laborCostUsd: 11.0,
        csiDivision: "06",
      },
      {
        name: "Cripples + jack studs (per opening)",
        uom: "EA",
        // 4 extra stud-pieces per opening (king + jack on each side, plus cripples above).
        quantityFormula: "{Standard Openings} * 4",
        unitCostUsd: 6.5,
        laborCostUsd: 2.0,
        csiDivision: "06",
      },
      {
        name: "LVL header (1-3/4\" × 11-7/8\", avg 10 LF span)",
        uom: "EA",
        quantityFormula: "{LVL Headers}",
        unitCostUsd: 190.0,
        laborCostUsd: 55.0,
        csiDivision: "06",
      },
    ],
    variantPresets: [
      {
        label: "Standard (1 LVL per garage door + 3 large openings)",
        propertyOverrides: { "LVL Headers": 5 },
      },
    ],
  },
  {
    id: "stub-roof-2x8-16oc",
    catId: "48", // ROOFING
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
        // 1.4 = architectural shingles. Custom plans rarely spec
        // 3-tab asphalt (the old 1.0 default); architectural is the
        // safe middle baseline. Builder switches to metal (3.2) or
        // tile (4.5) per plan — visible right in the assembly card.
        defaultValue: 1.4,
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
        // 1.20 multiplier — 1.15 pitch slope factor (6/12 roof) plus
        // ~5% buffer for eave overhangs. Claude often returns
        // footprint_dimensions as the OVERALL building envelope
        // (including porches), so we don't need a 30%+ porch-roof
        // bump on top — the porch area is usually already in the
        // footprint. Higher multipliers double-count.
        quantityFormula:
          "{Roof Run} * {Roof Width} / 32 * 1.20",
        unitCostUsd: 32.0,
        laborCostUsd: 9.5,
        csiDivision: "06",
      },
      {
        name: "30-lb roofing felt",
        uom: "SF",
        quantityFormula: "{Roof Run} * {Roof Width} * 1.20",
        unitCostUsd: 0.14,
        laborCostUsd: 0.18,
        csiDivision: "07",
      },
      {
        name: "Roof finish (per SQ = 100 SF)",
        uom: "SQ",
        quantityFormula: "{Roof Run} * {Roof Width} / 100 * 1.20",
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
    catId: "40.5", // FRAMING / Windows (line item under FRAMING)
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
    catId: "53", // INTERIOR TRIM AND DOORS
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
          // Pocket door: in-wall frame + soft-close hardware runs
          // ~50% above a standard pre-hung. Architect specs on
          // Maddox-class custom plans typically call out 6-15 pocket
          // doors (pantry, master bath, walk-in closet entries).
          { label: "Pocket door (frame + hardware)", value: 1.5 },
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
      {
        label: "Pocket door",
        description: "In-wall frame + soft-close hardware",
        propertyOverrides: { "Door Type": 1.5 },
      },
    ],
  },
  {
    id: "stub-door-exterior",
    catId: "40.6", // FRAMING / Exterior Doors (line item under FRAMING)
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
    catId: "52", // Painting
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
    catId: "43", // HARDIE, VINYL, & PORCHES
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
      // Optional accent area applied ON TOP of the main siding —
      // e.g. a stone-veneer wainscot under the porch columns, a
      // chimney chase wrap, foundation reveal accents. Default 0
      // produces no line; converter sets a baseline when the plan's
      // notable_features mention stone. Architect spec on Maddox: 69 SF.
      { name: "Stone Veneer Accent Area", uom: "SF", defaultValue: 0 },
    ],
    materials: [
      {
        name: "Siding material (per SF, installed)",
        uom: "SF",
        // Subtract the accent area from the main siding count so we
        // don't double-bill the wall area when stone veneer is in play.
        quantityFormula: "{Wall Area} - {Stone Veneer Accent Area}",
        // Vinyl baseline: ~$3.50 mat + ~$3.00 labor per SF. Multiplier
        // shifts both proportionally; tweak per-line if needed.
        unitCostUsd: 0,
        unitCostFormula: "3.50 * {Siding Material}",
        laborCostUsd: 0,
        laborCostFormula: "3.00 * {Siding Material}",
        csiDivision: "07",
      },
      {
        name: "Stone veneer accent (per SF, installed)",
        uom: "SF",
        // Gated on the accent property — formula evaluates to 0 when
        // unused, so the line drops out.
        quantityFormula: "{Stone Veneer Accent Area}",
        // ~$14/SF material + ~$12/SF labor for cultured stone; real
        // natural stone runs 1.5-2× this and goes in the bid line.
        unitCostUsd: 14.0,
        laborCostUsd: 12.0,
        csiDivision: "04",
        catId: "42", // STONE (Barry's section)
      },
      // House wrap intentionally NOT in this assembly — it lives on
      // the exterior wall assembly already (housewrap is attached to
      // sheathing, before siding goes on, so it's part of the wall
      // package). Cnadd cross-check caught the double-count.
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
    catId: "54", // STAIRWAY
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
    catId: "44", // EXTERIOR DETAILS — gutters + downspouts
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
    id: "stub-exterior-trim",
    catId: "44", // EXTERIOR DETAILS — fascia, soffit, drip edge, ridge vent
    name: "Exterior Trim — fascia, soffit, drip edge, ridge vent",
    description:
      "Eave-line and ridge-line finish: 1×8 fascia, vented soffit, " +
      "drip edge at every eave/rake, and continuous ridge vent at the " +
      "peak. Eave LF runs ~1.3-2.6× the building perimeter depending " +
      "on roof complexity (single gable on the low end, hip-with-" +
      "dormers on the high end). Ridge LF is ~0.5-0.75× perimeter.",
    trade: "exterior",
    properties: [
      // Total fascia run — sum of every eave and rake on the roof.
      // For a complex roof, this is dramatically more than the wall
      // perimeter; converter sets a baseline and builder edits.
      { name: "Eave Length", uom: "LF", defaultValue: 250 },
      // Soffit width as seen from below — the horizontal dimension
      // from wall to fascia. Typical residential is 18-24" (1.5-2 ft).
      { name: "Soffit Width", uom: "FT", defaultValue: 1.5 },
      // Continuous ridge vent runs along every roof peak. Hip roofs
      // have minimal ridge; gable roofs have a single long ridge;
      // complex roofs have multiple shorter ridges.
      { name: "Ridge Length", uom: "LF", defaultValue: 100 },
      {
        name: "Trim Style",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Painted pine 1×8 (standard)", value: 1.0 },
          { label: "PVC composite (rot-resistant)", value: 1.6 },
          { label: "Cedar / Hardie (premium)", value: 1.9 },
        ],
      },
    ],
    materials: [
      {
        name: "1×8 fascia board (per LF)",
        uom: "LF",
        quantityFormula: "{Eave Length}",
        unitCostUsd: 0,
        unitCostFormula: "2.80 * {Trim Style}",
        laborCostUsd: 1.40,
        csiDivision: "06",
      },
      {
        name: "Vented soffit panel (per SF)",
        uom: "SF",
        quantityFormula: "{Eave Length} * {Soffit Width}",
        unitCostUsd: 0,
        unitCostFormula: "2.20 * {Trim Style}",
        laborCostUsd: 1.20,
        csiDivision: "07",
      },
      {
        name: "Drip edge (per LF, aluminum)",
        uom: "LF",
        // Drip edge runs at every eave AND every rake — usually ~1.0×
        // the fascia LF since rakes already factor into Eave Length
        // when builders enter the total roof edge.
        quantityFormula: "{Eave Length}",
        unitCostUsd: 1.10,
        laborCostUsd: 0.45,
        csiDivision: "07",
      },
      {
        name: "Continuous ridge vent (per LF)",
        uom: "LF",
        quantityFormula: "{Ridge Length}",
        unitCostUsd: 4.20,
        laborCostUsd: 2.10,
        csiDivision: "07",
      },
    ],
    variantPresets: [
      {
        label: "Painted pine 1×8 (standard)",
        propertyOverrides: { "Trim Style": 1.0 },
      },
      {
        label: "PVC composite (rot-resistant)",
        description: "Cellular PVC trim — no rot, paintable",
        propertyOverrides: { "Trim Style": 1.6 },
      },
      {
        label: "Cedar / Hardie (premium)",
        description: "Rough-sawn cedar or fiber-cement",
        propertyOverrides: { "Trim Style": 1.9 },
      },
    ],
  },
  {
    id: "stub-garage-door",
    catId: "40.6a", // FRAMING / Garage Doors (line item under FRAMING)
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
          { label: "Chain (1/2 HP)", value: 1.0 },
          { label: "Belt (3/4 HP, quiet)", value: 1.6 },
          { label: "Wall mount (smart)", value: 2.4 },
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
    catId: "56.9", // FLOORING MATERIALS COMBINED and TILE
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
  {
    id: "stub-insulation",
    catId: "50", // Insulation
    name: "Insulation — cavity / batt / spray",
    description:
      "Standalone insulation assembly for remodels or as a phase-by-phase " +
      "estimate item separate from framing. Choose product to match the " +
      "cavity (R-13 batt for 2×4 walls, R-21 for 2×6, R-30 for ceilings) " +
      "or upgrade to spray foam for higher R-value + air-seal.",
    trade: "drywall",
    properties: [
      { name: "Insulated Area", uom: "SF", defaultValue: 1200 },
      {
        name: "Insulation Type",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "R-13 fiberglass batt (2×4 wall)", value: 1.0 },
          { label: "R-21 fiberglass batt (2×6 wall)", value: 1.35 },
          { label: "R-30 fiberglass batt (ceiling, code-min)", value: 1.7 },
          { label: "R-38 fiberglass batt (ceiling, custom-spec)", value: 2.0 },
          { label: "R-15 mineral wool (acoustic)", value: 2.0 },
          { label: "Open-cell spray foam (R-3.5/in)", value: 2.6 },
          { label: "Closed-cell spray foam (R-6.5/in)", value: 4.2 },
        ],
      },
    ],
    materials: [
      {
        name: "Insulation product (installed)",
        uom: "SF",
        // 5% waste for batt cutting, none for spray foam (it fills).
        quantityFormula: "{Insulated Area} * 1.05",
        unitCostUsd: 0,
        unitCostFormula: "0.65 * {Insulation Type}",
        laborCostUsd: 0,
        laborCostFormula: "0.55 * {Insulation Type}",
        csiDivision: "07",
      },
      {
        name: "Vapor barrier / kraft facing (where applicable)",
        uom: "SF",
        quantityFormula: "{Insulated Area}",
        unitCostUsd: 0.12,
        laborCostUsd: 0.15,
        csiDivision: "07",
      },
    ],
    variantPresets: [
      {
        label: "R-13 batt (standard 2×4 wall)",
        propertyOverrides: { "Insulation Type": 1.0 },
      },
      {
        label: "R-21 batt (2×6 exterior wall)",
        propertyOverrides: { "Insulation Type": 1.35 },
      },
      {
        label: "R-30 ceiling batt (code-min)",
        description: "Attic floor / cathedral ceiling — IRC minimum",
        propertyOverrides: { "Insulation Type": 1.7 },
      },
      {
        label: "R-38 ceiling batt (custom-spec)",
        description: "Above code — standard on most custom plans",
        propertyOverrides: { "Insulation Type": 2.0 },
      },
      {
        label: "Mineral wool (acoustic / fire)",
        description: "R-15 + sound dampening + non-combustible",
        propertyOverrides: { "Insulation Type": 2.0 },
      },
      {
        label: "Open-cell spray foam",
        description: "Air-seal + cavity-fill; lower R per inch",
        propertyOverrides: { "Insulation Type": 2.6 },
      },
      {
        label: "Closed-cell spray foam (premium)",
        description: "Highest R per inch + vapor barrier in one",
        propertyOverrides: { "Insulation Type": 4.2 },
      },
    ],
  },
  {
    id: "stub-site-work",
    catId: "20", // SITE WORK
    name: "Site work — clearing, grading, excavation",
    description:
      "Pre-construction site prep: tree clearing, brush removal, rough " +
      "grade, foundation excavation, and final grade after backfill. " +
      "Priced per acre of lot disturbed; bumps up for difficult terrain.",
    trade: "site",
    properties: [
      { name: "Lot Disturbance", uom: "AC", defaultValue: 0.5 },
      {
        name: "Terrain Difficulty",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Flat / cleared lot", value: 1.0 },
          { label: "Moderate slope or tree cover", value: 1.6 },
          { label: "Heavy clearing or steep grade", value: 2.4 },
          { label: "Rock excavation", value: 3.5 },
        ],
      },
    ],
    materials: [
      {
        name: "Clearing + rough grading",
        uom: "AC",
        quantityFormula: "{Lot Disturbance}",
        unitCostUsd: 0,
        unitCostFormula: "3200 * {Terrain Difficulty}",
        laborCostUsd: 0,
        laborCostFormula: "2800 * {Terrain Difficulty}",
        csiDivision: "31",
      },
      {
        name: "Foundation excavation + spoil haul-off",
        uom: "EA",
        quantityFormula: "1",
        unitCostUsd: 0,
        unitCostFormula: "1800 * {Terrain Difficulty}",
        laborCostUsd: 0,
        laborCostFormula: "1600 * {Terrain Difficulty}",
        csiDivision: "31",
      },
      {
        name: "Final grade + topsoil reset",
        uom: "AC",
        quantityFormula: "{Lot Disturbance}",
        unitCostUsd: 850,
        laborCostUsd: 1200,
        csiDivision: "31",
      },
    ],
    variantPresets: [
      {
        label: "Flat lot — standard prep",
        propertyOverrides: { "Terrain Difficulty": 1.0 },
      },
      {
        label: "Wooded / moderate slope",
        propertyOverrides: { "Terrain Difficulty": 1.6 },
      },
      {
        label: "Heavy clearing or steep grade",
        description: "Hillside lots, dense tree cover",
        propertyOverrides: { "Terrain Difficulty": 2.4 },
      },
      {
        label: "Rock excavation",
        description: "Blasting or hammer work required",
        propertyOverrides: { "Terrain Difficulty": 3.5 },
      },
    ],
  },
  {
    id: "stub-flatwork",
    catId: "46", // DRIVEWAY & WALKS — concrete flatwork
    name: "Concrete flatwork (driveway / sidewalk / patio)",
    description:
      "Exterior concrete slabs — driveway, sidewalks, patio. Includes " +
      "form, reinforcement, ready-mix, finish (broom or smooth), and " +
      "control joints. Thickness defaults to 4\" residential; 6\" for " +
      "heavy vehicle driveways. Add stamped pattern for premium finish.",
    trade: "site",
    properties: [
      { name: "Flatwork Area", uom: "SF", defaultValue: 600 },
      {
        name: "Slab Thickness",
        uom: "IN",
        defaultValue: 4,
        kind: "choice",
        choices: [4, 5, 6],
      },
      {
        name: "Finish",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Broom (standard)", value: 1.0 },
          { label: "Smooth trowel", value: 1.15 },
          { label: "Exposed aggregate", value: 1.5 },
          { label: "Stamped pattern", value: 2.2 },
          { label: "Stamped + integral color", value: 2.6 },
        ],
      },
    ],
    materials: [
      {
        name: "Concrete + reinforcement (per SF)",
        uom: "SF",
        // SF × thickness in inches × 4 = thickness factor (4\" = 1×).
        quantityFormula: "{Flatwork Area} * ({Slab Thickness} / 4)",
        unitCostUsd: 4.2,
        laborCostUsd: 0,
        laborCostFormula: "3.6 * {Finish}",
        csiDivision: "03",
      },
      {
        name: "Form + control joint cutting",
        uom: "SF",
        quantityFormula: "{Flatwork Area}",
        unitCostUsd: 0.45,
        laborCostUsd: 0.7,
        csiDivision: "03",
      },
    ],
    variantPresets: [
      {
        label: 'Driveway 4" broom',
        propertyOverrides: { "Slab Thickness": 4, Finish: 1.0 },
      },
      {
        label: 'Heavy driveway 6"',
        description: "Boats / RVs / heavy vehicles",
        propertyOverrides: { "Slab Thickness": 6, Finish: 1.0 },
      },
      {
        label: "Exposed aggregate patio",
        propertyOverrides: { "Slab Thickness": 4, Finish: 1.5 },
      },
      {
        label: "Stamped patio (premium)",
        description: "Looks like flagstone or pavers",
        propertyOverrides: { "Slab Thickness": 4, Finish: 2.2 },
      },
    ],
  },
  {
    id: "stub-deck",
    catId: "47", // DECK / TERRACE
    name: "Wood deck (framed + decked + railing)",
    description:
      "Framed deck on PT joists with chosen surface material. Includes " +
      "ledger, footings, joists, decking, fascia, railing, and stairs " +
      "to grade. Composite vs PT vs hardwood drives material cost; " +
      "labor scales modestly with material complexity.",
    trade: "site",
    properties: [
      { name: "Deck Area", uom: "SF", defaultValue: 240 },
      {
        name: "Surface Material",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Pressure-treated pine", value: 1.0 },
          { label: "Cedar", value: 1.5 },
          { label: "Composite (Trex / TimberTech)", value: 2.4 },
          { label: "Hardwood (ipe / cumaru)", value: 3.6 },
        ],
      },
    ],
    materials: [
      {
        name: "Framing (footings + joists + ledger)",
        uom: "SF",
        quantityFormula: "{Deck Area}",
        unitCostUsd: 7.5,
        laborCostUsd: 9.0,
        csiDivision: "06",
      },
      {
        name: "Decking + fascia",
        uom: "SF",
        quantityFormula: "{Deck Area} * 1.08",
        unitCostUsd: 0,
        unitCostFormula: "6.5 * {Surface Material}",
        laborCostUsd: 0,
        laborCostFormula: "4.2 * {Surface Material}",
        csiDivision: "06",
      },
      {
        name: "Railing + stairs to grade",
        uom: "LF",
        // Approximate railing run as perimeter; sqrt(area) × 2 is
        // a rough proxy for square-ish decks. Cap labor with the
        // material multiplier so composite/hardwood railing scales.
        quantityFormula: "{Deck Area} * 0.18",
        unitCostUsd: 0,
        unitCostFormula: "22 * {Surface Material}",
        laborCostUsd: 18,
        csiDivision: "06",
      },
    ],
    variantPresets: [
      {
        label: "PT pine (budget)",
        propertyOverrides: { "Surface Material": 1.0 },
      },
      {
        label: "Cedar",
        description: "Better weather resistance, natural look",
        propertyOverrides: { "Surface Material": 1.5 },
      },
      {
        label: "Composite (low maintenance)",
        description: "Trex / TimberTech — no sealing required",
        propertyOverrides: { "Surface Material": 2.4 },
      },
      {
        label: "Ipe hardwood (luxury)",
        description: "Brazilian hardwood, premium look + price",
        propertyOverrides: { "Surface Material": 3.6 },
      },
    ],
  },
  {
    id: "stub-plumbing-rough",
    catId: "30", // PLUMBING
    name: "Plumbing — rough-in (per fixture)",
    description:
      "Whole-house plumbing rough-in: supply lines (PEX or copper), " +
      "DWV (drain-waste-vent), and pressure test. Priced per fixture " +
      "count because that's how plumbers bid it.",
    trade: "plumbing",
    properties: [
      { name: "Fixture Count", uom: "EA", defaultValue: 12 },
      {
        name: "Supply Line",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "PEX (standard)", value: 1.0 },
          { label: "Copper (premium)", value: 1.8 },
        ],
      },
    ],
    materials: [
      {
        name: "Rough-in per fixture (supply + DWV)",
        uom: "EA",
        quantityFormula: "{Fixture Count}",
        unitCostUsd: 0,
        unitCostFormula: "180 * {Supply Line}",
        laborCostUsd: 320,
        csiDivision: "22",
      },
      {
        name: "Main waste stack + cleanouts",
        uom: "EA",
        quantityFormula: "1",
        unitCostUsd: 240,
        laborCostUsd: 380,
        csiDivision: "22",
      },
    ],
    variantPresets: [
      {
        label: "PEX standard (12 fixtures)",
        propertyOverrides: { "Fixture Count": 12, "Supply Line": 1.0 },
      },
      {
        label: "PEX large home (18 fixtures)",
        propertyOverrides: { "Fixture Count": 18, "Supply Line": 1.0 },
      },
      {
        label: "Copper premium (12 fixtures)",
        description: "Higher material cost, longer service life",
        propertyOverrides: { "Fixture Count": 12, "Supply Line": 1.8 },
      },
    ],
  },
  {
    id: "stub-water-heater",
    catId: "30", // PLUMBING — water heater
    name: "Water heater",
    description:
      "Domestic hot water — tank or tankless, gas or electric. Tank " +
      "units sized by capacity (40 / 50 / 80 gal); tankless sized by " +
      "GPM flow rate. Includes connections, pan, and basic venting.",
    trade: "plumbing",
    properties: [
      { name: "Unit Count", uom: "EA", defaultValue: 1 },
      {
        name: "Heater Type",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "40 gal gas tank", value: 1.0 },
          { label: "50 gal electric tank", value: 1.1 },
          { label: "80 gal heat-pump tank (efficient)", value: 2.4 },
          { label: "Tankless gas (high-flow)", value: 2.0 },
          { label: "Tankless electric", value: 1.8 },
        ],
      },
    ],
    materials: [
      {
        name: "Unit + connections + venting",
        uom: "EA",
        quantityFormula: "{Unit Count}",
        unitCostUsd: 0,
        unitCostFormula: "950 * {Heater Type}",
        laborCostUsd: 480,
        csiDivision: "22",
      },
    ],
    variantPresets: [
      {
        label: "40 gal gas (standard)",
        propertyOverrides: { "Heater Type": 1.0 },
      },
      {
        label: "50 gal electric",
        propertyOverrides: { "Heater Type": 1.1 },
      },
      {
        label: "Tankless gas (high-flow)",
        description: "Endless hot water, smaller footprint",
        propertyOverrides: { "Heater Type": 2.0 },
      },
      {
        label: "Heat-pump tank (efficient)",
        description: "Highest upfront, lowest operating cost",
        propertyOverrides: { "Heater Type": 2.4 },
      },
    ],
  },
  {
    id: "stub-septic-system",
    catId: "10", // Septic Tank Allowance (PRE-CONSTRUCTION)
    name: "Septic system (rural / off-sewer)",
    description:
      "Tank + drain field for homes without municipal sewer. Sized to " +
      "bedroom count per most state codes (3-bedroom = 1000 gal tank " +
      "standard). Drain field type varies with soil percolation — " +
      "conventional gravel beds are cheapest; mound + advanced treatment " +
      "systems are required where soils don't percolate.",
    trade: "plumbing",
    properties: [
      { name: "Bedroom Count", uom: "EA", defaultValue: 4 },
      {
        name: "System Type",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Conventional gravity (good soils)", value: 1.0 },
          { label: "Pumped (poor soils, distance)", value: 1.4 },
          { label: "Mound system (high water table)", value: 2.2 },
          { label: "Advanced treatment (ATU)", value: 3.0 },
        ],
      },
    ],
    materials: [
      {
        name: "Tank + risers (sized to bedrooms)",
        uom: "EA",
        // Pricing scales modestly with bedroom count via tank size.
        quantityFormula: "1",
        unitCostUsd: 0,
        unitCostFormula:
          "1800 + ({Bedroom Count} * 250) * {System Type}",
        laborCostUsd: 0,
        laborCostFormula: "950 * {System Type}",
        csiDivision: "33",
      },
      {
        name: "Drain field — excavation + media + distribution",
        uom: "EA",
        quantityFormula: "1",
        unitCostUsd: 0,
        unitCostFormula:
          "2400 + ({Bedroom Count} * 400) * {System Type}",
        laborCostUsd: 0,
        laborCostFormula: "1800 * {System Type}",
        csiDivision: "33",
      },
      {
        name: "Sewer line + cleanouts (tank to house)",
        uom: "LF",
        quantityFormula: "50",
        unitCostUsd: 6,
        laborCostUsd: 9,
        csiDivision: "33",
      },
    ],
    variantPresets: [
      {
        label: "Conventional 3-BR",
        propertyOverrides: { "Bedroom Count": 3, "System Type": 1.0 },
      },
      {
        label: "Conventional 4-BR",
        propertyOverrides: { "Bedroom Count": 4, "System Type": 1.0 },
      },
      {
        label: "Pumped (uphill drain field)",
        propertyOverrides: { "Bedroom Count": 4, "System Type": 1.4 },
      },
      {
        label: "Advanced treatment (premium / regulatory)",
        description: "Required near sensitive watersheds",
        propertyOverrides: { "Bedroom Count": 4, "System Type": 3.0 },
      },
    ],
  },
  {
    id: "stub-electrical-whole-home",
    catId: "31", // ELECTRICAL
    name: "Electrical — whole-home rough + finish",
    description:
      "Service entrance, panel, branch circuits, outlets, switches, " +
      "and basic fixtures (recessed cans + standard outlets). Priced " +
      "per SF for the wiring + per-outlet for the trim-out. Doesn't " +
      "include decorative fixtures — see Lighting allowances.",
    trade: "electrical",
    properties: [
      { name: "Conditioned Area", uom: "SF", defaultValue: 2400 },
      {
        name: "Service Size",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "200 A (standard)", value: 1.0 },
          { label: "320 A (whole-home heat pump)", value: 1.4 },
          { label: "400 A (large home / shop / EV)", value: 1.9 },
        ],
      },
    ],
    materials: [
      {
        name: "Wiring + boxes + circuit runs",
        uom: "SF",
        quantityFormula: "{Conditioned Area}",
        unitCostUsd: 2.8,
        laborCostUsd: 2.4,
        csiDivision: "26",
      },
      {
        name: "Service entrance + panel",
        uom: "EA",
        quantityFormula: "1",
        unitCostUsd: 0,
        unitCostFormula: "1850 * {Service Size}",
        laborCostUsd: 0,
        laborCostFormula: "1100 * {Service Size}",
        csiDivision: "26",
      },
      {
        name: "Recessed cans + standard fixtures (per SF estimate)",
        uom: "SF",
        quantityFormula: "{Conditioned Area}",
        unitCostUsd: 1.2,
        laborCostUsd: 0.8,
        csiDivision: "26",
      },
    ],
    variantPresets: [
      {
        label: "200 A standard",
        propertyOverrides: { "Service Size": 1.0 },
      },
      {
        label: "320 A (heat pump-ready)",
        description: "Sized for whole-home electric heat",
        propertyOverrides: { "Service Size": 1.4 },
      },
      {
        label: "400 A (large home / EV / shop)",
        propertyOverrides: { "Service Size": 1.9 },
      },
    ],
  },
  {
    id: "stub-hvac-ducted",
    catId: "33", // HVAC
    name: "HVAC — ducted central system",
    description:
      "Forced-air ducted system: condenser, air handler, ductwork, " +
      "registers, and thermostat. Per-ton sizing scales every component. " +
      "Rule of thumb: 1 ton per 600–800 SF (climate-dependent).",
    trade: "hvac",
    properties: [
      { name: "System Size", uom: "TON", defaultValue: 4 },
      {
        name: "System Type",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Gas furnace + AC (split)", value: 1.0 },
          { label: "Heat pump (electric)", value: 1.2 },
          { label: "Variable-speed inverter (high SEER)", value: 1.6 },
          { label: "Geothermal", value: 3.2 },
        ],
      },
    ],
    materials: [
      {
        name: "Equipment (condenser + air handler / furnace)",
        uom: "TON",
        quantityFormula: "{System Size}",
        unitCostUsd: 0,
        unitCostFormula: "1450 * {System Type}",
        laborCostUsd: 380,
        csiDivision: "23",
      },
      {
        name: "Ductwork + registers + thermostat",
        uom: "TON",
        quantityFormula: "{System Size}",
        unitCostUsd: 720,
        laborCostUsd: 560,
        csiDivision: "23",
      },
    ],
    variantPresets: [
      {
        label: "Gas furnace + AC (standard 4-ton)",
        propertyOverrides: { "System Size": 4, "System Type": 1.0 },
      },
      {
        label: "Heat pump (4-ton)",
        description: "Electric-only home; no gas line",
        propertyOverrides: { "System Size": 4, "System Type": 1.2 },
      },
      {
        label: "High-SEER variable speed",
        description: "Energy-efficient premium tier",
        propertyOverrides: { "System Size": 4, "System Type": 1.6 },
      },
      {
        label: "Geothermal (luxury)",
        description: "Highest upfront, lowest operating cost",
        propertyOverrides: { "System Size": 4, "System Type": 3.2 },
      },
    ],
  },
  {
    id: "stub-lighting-allowance",
    catId: "65", // Lighting Fixtures
    name: "Lighting fixture allowance",
    description:
      "Bucket for decorative fixtures the client picks at the design " +
      "center — chandeliers, pendants, sconces, ceiling fans. NOT the " +
      "rough wiring or recessed cans (those live in Electrical). " +
      "Includes install labor + bulbs.",
    trade: "electrical",
    properties: [
      { name: "Allowance Tier", uom: "EA", defaultValue: 1 },
      {
        name: "Allowance Level",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Builder spec ($2,500 / home)", value: 1.0 },
          { label: "Standard ($5,000 / home)", value: 2.0 },
          { label: "Designer ($10,000 / home)", value: 4.0 },
          { label: "High-end ($20,000 / home)", value: 8.0 },
          { label: "Luxury ($40,000+ / home)", value: 16.0 },
        ],
      },
    ],
    materials: [
      {
        name: "Decorative fixtures (allowance)",
        uom: "EA",
        quantityFormula: "{Allowance Tier}",
        unitCostUsd: 0,
        unitCostFormula: "2000 * {Allowance Level}",
        laborCostUsd: 500,
        csiDivision: "26",
      },
    ],
    variantPresets: [
      {
        label: "Builder spec ($2,500)",
        propertyOverrides: { "Allowance Level": 1.0 },
      },
      {
        label: "Standard ($5,000)",
        propertyOverrides: { "Allowance Level": 2.0 },
      },
      {
        label: "Designer ($10,000)",
        description: "Custom chandeliers, designer pendants",
        propertyOverrides: { "Allowance Level": 4.0 },
      },
      {
        label: "Luxury ($40,000+)",
        propertyOverrides: { "Allowance Level": 16.0 },
      },
    ],
  },
  {
    id: "stub-appliance-allowance",
    catId: "58", // Bob Wallace Appliance
    name: "Kitchen appliance allowance",
    description:
      "Range / cooktop + wall oven, refrigerator, dishwasher, microwave, " +
      "vent hood, and disposal — bundled by tier. Skipped if the client " +
      "is supplying their own. Includes basic install labor (plug-in " +
      "only; rough plumbing + gas lives in Plumbing).",
    trade: "finishes",
    properties: [
      { name: "Kitchen Count", uom: "EA", defaultValue: 1 },
      {
        name: "Appliance Tier",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Builder spec ($4,500 / kitchen)", value: 1.0 },
          { label: "Standard ($8,000 / kitchen)", value: 1.8 },
          { label: "Premium ($15,000 / kitchen)", value: 3.3 },
          { label: "Pro grade ($30,000 — Wolf / Sub-Zero)", value: 6.7 },
          { label: "Ultra luxury ($60,000+)", value: 13.3 },
        ],
      },
    ],
    materials: [
      {
        name: "Appliance package (allowance)",
        uom: "EA",
        quantityFormula: "{Kitchen Count}",
        unitCostUsd: 0,
        unitCostFormula: "4500 * {Appliance Tier}",
        laborCostUsd: 400,
        csiDivision: "11",
      },
    ],
    variantPresets: [
      {
        label: "Builder spec ($4,500)",
        propertyOverrides: { "Appliance Tier": 1.0 },
      },
      {
        label: "Standard ($8,000)",
        propertyOverrides: { "Appliance Tier": 1.8 },
      },
      {
        label: "Premium ($15,000)",
        description: "KitchenAid / GE Profile range",
        propertyOverrides: { "Appliance Tier": 3.3 },
      },
      {
        label: "Pro grade ($30,000)",
        description: "Wolf range / Sub-Zero fridge",
        propertyOverrides: { "Appliance Tier": 6.7 },
      },
    ],
  },
  {
    id: "stub-kitchen-cabinetry",
    catId: "59", // Cabinets
    name: "Kitchen Cabinetry (installed)",
    description:
      "Cabinet runs sold per linear foot — counts both base + upper. " +
      "Grade scales the per-LF cost from builder stock (knockdown boxes) " +
      "to fully custom shop-built. Includes installation labor + " +
      "standard hardware (no specialty drawer pulls).",
    trade: "millwork",
    properties: [
      { name: "Cabinet Run", uom: "LF", defaultValue: 22 },
      {
        name: "Cabinet Grade",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Stock (knockdown)", value: 1.0 },
          { label: "Semi-custom", value: 1.8 },
          { label: "Custom (shop-built)", value: 3.0 },
          { label: "Luxury (inset + premium wood)", value: 4.5 },
        ],
      },
    ],
    materials: [
      {
        name: "Cabinet boxes + doors + drawers (per LF)",
        uom: "LF",
        quantityFormula: "{Cabinet Run}",
        unitCostUsd: 0,
        unitCostFormula: "280 * {Cabinet Grade}",
        laborCostUsd: 85,
        csiDivision: "12",
      },
    ],
    variantPresets: [
      {
        label: "Stock builder-grade",
        propertyOverrides: { "Cabinet Grade": 1.0 },
      },
      {
        label: "Semi-custom (standard upgrade)",
        propertyOverrides: { "Cabinet Grade": 1.8 },
      },
      {
        label: "Full custom (shop-built)",
        description: "Locally fabricated, any door style",
        propertyOverrides: { "Cabinet Grade": 3.0 },
      },
      {
        label: "Luxury inset",
        description: "Inset doors + premium hardwoods",
        propertyOverrides: { "Cabinet Grade": 4.5 },
      },
    ],
  },
  {
    id: "stub-countertops",
    catId: "60", // COUNTERTOPS
    name: "Countertops (fabricated + installed)",
    description:
      "Countertop slab material + fabrication + installation. Priced " +
      "per SF of finished surface. Includes one undermount sink cutout " +
      "in the base price; multiple cutouts or edge profiles are extras.",
    trade: "finishes",
    properties: [
      { name: "Countertop Area", uom: "SF", defaultValue: 55 },
      {
        name: "Material",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Laminate", value: 1.0 },
          { label: "Butcher block", value: 1.6 },
          { label: "Solid surface (Corian)", value: 2.2 },
          { label: "Granite", value: 3.0 },
          { label: "Quartz (engineered stone)", value: 3.4 },
          { label: "Marble", value: 4.5 },
          { label: "Soapstone / Quartzite (premium)", value: 5.5 },
        ],
      },
    ],
    materials: [
      {
        name: "Slab + fabrication + edge profile",
        uom: "SF",
        quantityFormula: "{Countertop Area}",
        unitCostUsd: 0,
        unitCostFormula: "22 * {Material}",
        laborCostUsd: 12,
        csiDivision: "12",
      },
    ],
    variantPresets: [
      {
        label: "Laminate (budget)",
        propertyOverrides: { Material: 1.0 },
      },
      {
        label: "Butcher block",
        description: "Warm wood; needs sealing maintenance",
        propertyOverrides: { Material: 1.6 },
      },
      {
        label: "Granite (standard upgrade)",
        propertyOverrides: { Material: 3.0 },
      },
      {
        label: "Quartz (popular premium)",
        description: "Non-porous, low-maintenance",
        propertyOverrides: { Material: 3.4 },
      },
      {
        label: "Marble (luxury)",
        propertyOverrides: { Material: 4.5 },
      },
    ],
  },
  {
    id: "stub-bath-suite",
    catId: "66", // Plumbing Fixtures and Bath Accessories
    name: "Bathroom suite (vanity + toilet + tub/shower)",
    description:
      "Per-bathroom bundle: vanity + faucet + toilet + tub or shower. " +
      "Grade option scales the whole bundle — from rental-spec fixtures " +
      "to designer level. Fixture rough-in lives in the Plumbing assembly; " +
      "this is the visible-fixtures + finish cost.",
    trade: "millwork",
    properties: [
      { name: "Bathroom Count", uom: "EA", defaultValue: 3 },
      {
        name: "Bath Grade",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Builder / rental spec", value: 1.0 },
          { label: "Standard (mid-market)", value: 1.6 },
          { label: "Designer", value: 2.6 },
          { label: "Luxury (stone tile / freestanding tub)", value: 4.5 },
        ],
      },
    ],
    materials: [
      {
        name: "Vanity + faucet + mirror (per bathroom)",
        uom: "EA",
        quantityFormula: "{Bathroom Count}",
        unitCostUsd: 0,
        unitCostFormula: "750 * {Bath Grade}",
        laborCostUsd: 220,
        csiDivision: "12",
      },
      {
        name: "Toilet + supply (per bathroom)",
        uom: "EA",
        quantityFormula: "{Bathroom Count}",
        unitCostUsd: 0,
        unitCostFormula: "280 * {Bath Grade}",
        laborCostUsd: 140,
        csiDivision: "22",
      },
      {
        name: "Tub or shower + valve (per bathroom)",
        uom: "EA",
        quantityFormula: "{Bathroom Count}",
        unitCostUsd: 0,
        unitCostFormula: "950 * {Bath Grade}",
        laborCostUsd: 320,
        csiDivision: "22",
      },
    ],
    variantPresets: [
      {
        label: "Builder spec (3 baths)",
        propertyOverrides: { "Bathroom Count": 3, "Bath Grade": 1.0 },
      },
      {
        label: "Mid-market (3 baths)",
        propertyOverrides: { "Bathroom Count": 3, "Bath Grade": 1.6 },
      },
      {
        label: "Designer (3 baths)",
        description: "Quality faucets, vessel sinks, tiled shower",
        propertyOverrides: { "Bathroom Count": 3, "Bath Grade": 2.6 },
      },
      {
        label: "Luxury master + 2 standard",
        description: "Set Bathroom Count = 1 + clone for the standard ones",
        propertyOverrides: { "Bathroom Count": 1, "Bath Grade": 4.5 },
      },
    ],
  },
  {
    id: "stub-interior-trim",
    catId: "53", // INTERIOR TRIM AND DOORS
    name: "Interior trim — baseboard + casing",
    description:
      "Baseboard run around every room's perimeter + door and window " +
      "casing. Profile complexity drives both material and labor.",
    trade: "finishes",
    properties: [
      { name: "Baseboard Length", uom: "LF", defaultValue: 480 },
      { name: "Door + Window Openings", uom: "EA", defaultValue: 22 },
      {
        name: "Trim Profile",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: 'Basic (3-1/4" colonial)', value: 1.0 },
          { label: 'Standard (5-1/4" w/ chair rail)', value: 1.5 },
          { label: 'Premium (custom 7" base + crown)', value: 2.4 },
          { label: "Craftsman (built-up profile)", value: 3.0 },
        ],
      },
    ],
    materials: [
      {
        name: "Baseboard (primed MDF or pine)",
        uom: "LF",
        // 5% waste for cuts.
        quantityFormula: "{Baseboard Length} * 1.05",
        unitCostUsd: 0,
        unitCostFormula: "1.40 * {Trim Profile}",
        laborCostUsd: 1.6,
        csiDivision: "06",
      },
      {
        name: "Door + window casing (~16 LF per opening)",
        uom: "LF",
        quantityFormula: "{Door + Window Openings} * 16 * 1.05",
        unitCostUsd: 0,
        unitCostFormula: "1.30 * {Trim Profile}",
        laborCostUsd: 1.5,
        csiDivision: "06",
      },
    ],
    variantPresets: [
      {
        label: "Basic colonial",
        propertyOverrides: { "Trim Profile": 1.0 },
      },
      {
        label: "Standard w/ chair rail",
        propertyOverrides: { "Trim Profile": 1.5 },
      },
      {
        label: 'Premium 7" base + crown',
        propertyOverrides: { "Trim Profile": 2.4 },
      },
      {
        label: "Craftsman built-up",
        description: "Multi-piece profile; high labor",
        propertyOverrides: { "Trim Profile": 3.0 },
      },
    ],
  },
  {
    id: "stub-drywall",
    catId: "51", // DRYWALL
    name: "Drywall — hung, taped, finished",
    description:
      "Standalone drywall assembly for remodels where the wall framing " +
      "is already in place. Includes board, screws, joint compound, " +
      "tape, corner bead, and labor through Level-4 finish (ready to " +
      "paint). 10% material waste factored in.",
    trade: "drywall",
    properties: [
      { name: "Wall Area", uom: "SF", defaultValue: 1200 },
      { name: "Ceiling Area", uom: "SF", defaultValue: 800 },
      {
        name: "Drywall Type",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: '1/2" standard', value: 1.0 },
          { label: '5/8" Type X (firecode)', value: 1.25 },
          { label: '1/2" moisture-resistant (bath)', value: 1.4 },
          { label: 'Soundboard (acoustic)', value: 1.8 },
        ],
      },
    ],
    materials: [
      {
        name: "Drywall sheets (incl. 10% waste)",
        uom: "SF",
        quantityFormula: "({Wall Area} + {Ceiling Area}) * 1.10",
        unitCostUsd: 0,
        unitCostFormula: "0.55 * {Drywall Type}",
        laborCostUsd: 0.45,
        csiDivision: "09",
      },
      {
        name: "Joint compound + tape + screws",
        uom: "SF",
        quantityFormula: "{Wall Area} + {Ceiling Area}",
        unitCostUsd: 0.18,
        laborCostUsd: 0.7,
        csiDivision: "09",
      },
      {
        name: "Corner bead + outside corner reinforcement",
        uom: "LF",
        // ~0.04 LF per SF of wall = a reasonable approximation for
        // residential corners (interior + window/door openings).
        quantityFormula: "{Wall Area} * 0.04",
        unitCostUsd: 0.85,
        laborCostUsd: 1.2,
        csiDivision: "09",
      },
    ],
    variantPresets: [
      {
        label: '1/2" standard (whole house)',
        propertyOverrides: { "Drywall Type": 1.0 },
      },
      {
        label: '5/8" Type X (garage / mech room)',
        description: "Code-required fire rating",
        propertyOverrides: { "Drywall Type": 1.25 },
      },
      {
        label: "Moisture-resistant (bathroom)",
        propertyOverrides: { "Drywall Type": 1.4 },
      },
      {
        label: "Soundboard (media / nursery)",
        description: "Acoustic dampening, premium remodel",
        propertyOverrides: { "Drywall Type": 1.8 },
      },
    ],
  },
  {
    id: "stub-lvp",
    catId: "56.9", // FLOORING MATERIALS COMBINED and TILE
    name: "LVP flooring — luxury vinyl plank (installed)",
    description:
      "Click-lock luxury vinyl plank over foam underlayment, including " +
      "transitions and quarter-round at perimeter. Waterproof grades " +
      "common in basements, kitchens, and full-house remodels.",
    trade: "flooring",
    properties: [
      { name: "Floor Area", uom: "SF", defaultValue: 500 },
      {
        name: "LVP Grade",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Builder (4mm)", value: 1.0 },
          { label: "Standard (5mm)", value: 1.3 },
          { label: "Waterproof premium (6mm+)", value: 1.7 },
          { label: "Rigid core SPC", value: 2.1 },
        ],
      },
    ],
    materials: [
      {
        name: "LVP + underlayment + transitions (installed)",
        uom: "SF",
        // 8% waste — LVP cuts cleaner than carpet/tile.
        quantityFormula: "{Floor Area} * 1.08",
        unitCostUsd: 0,
        unitCostFormula: "3.50 * {LVP Grade}",
        laborCostUsd: 1.5,
        csiDivision: "09",
      },
    ],
    variantPresets: [
      {
        label: "Builder grade",
        propertyOverrides: { "LVP Grade": 1.0 },
      },
      {
        label: "Standard",
        propertyOverrides: { "LVP Grade": 1.3 },
      },
      {
        label: "Waterproof premium",
        description: "Suitable for kitchens / baths / basements",
        propertyOverrides: { "LVP Grade": 1.7 },
      },
      {
        label: "Rigid core SPC",
        description: "Stone-polymer core; most dimensionally stable",
        propertyOverrides: { "LVP Grade": 2.1 },
      },
    ],
  },
  {
    id: "stub-laminate",
    catId: "56.9", // FLOORING MATERIALS COMBINED and TILE
    name: "Laminate flooring (installed)",
    description:
      "Click-lock laminate plank over foam underlayment. Lower price " +
      "point than LVP but not waterproof — best for bedrooms / living " +
      "areas where moisture isn't a concern.",
    trade: "flooring",
    properties: [
      { name: "Floor Area", uom: "SF", defaultValue: 500 },
      {
        name: "Laminate Quality",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "8mm AC3", value: 1.0 },
          { label: "10mm AC4", value: 1.3 },
          { label: "12mm AC5 (commercial)", value: 1.6 },
        ],
      },
    ],
    materials: [
      {
        name: "Laminate + underlayment + transitions (installed)",
        uom: "SF",
        quantityFormula: "{Floor Area} * 1.08",
        unitCostUsd: 0,
        unitCostFormula: "2.20 * {Laminate Quality}",
        laborCostUsd: 1.4,
        csiDivision: "09",
      },
    ],
    variantPresets: [
      {
        label: "8mm AC3 (budget)",
        propertyOverrides: { "Laminate Quality": 1.0 },
      },
      {
        label: "10mm AC4",
        propertyOverrides: { "Laminate Quality": 1.3 },
      },
      {
        label: "12mm AC5",
        description: "Commercial-grade wear layer",
        propertyOverrides: { "Laminate Quality": 1.6 },
      },
    ],
  },
  {
    id: "stub-tile-floor",
    catId: "56.9", // FLOORING MATERIALS COMBINED and TILE
    name: "Tile flooring (installed)",
    description:
      "Ceramic / porcelain / natural-stone tile over mortar bed with " +
      "grout + sealer. Pattern complexity affects labor — straight lay " +
      "is fastest; herringbone / diagonal add cutting time.",
    trade: "flooring",
    properties: [
      { name: "Floor Area", uom: "SF", defaultValue: 200 },
      {
        name: "Tile Type",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Ceramic", value: 1.0 },
          { label: "Porcelain", value: 1.5 },
          { label: "Natural stone", value: 2.6 },
          { label: "Marble / mosaic", value: 4.0 },
        ],
      },
      {
        name: "Pattern",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Straight lay", value: 1.0 },
          { label: "Diagonal", value: 1.2 },
          { label: "Herringbone", value: 1.4 },
        ],
      },
    ],
    materials: [
      {
        name: "Tile + thinset + grout + sealer (installed)",
        uom: "SF",
        // 15% waste — tile cuts produce more scrap, especially patterns.
        quantityFormula: "{Floor Area} * 1.15",
        unitCostUsd: 0,
        unitCostFormula: "5.50 * {Tile Type}",
        laborCostUsd: 0,
        // Labor scales with pattern complexity.
        laborCostFormula: "4.50 * {Pattern}",
        csiDivision: "09",
      },
    ],
    variantPresets: [
      {
        label: "Ceramic — straight lay (basic)",
        propertyOverrides: { "Tile Type": 1.0, Pattern: 1.0 },
      },
      {
        label: "Porcelain — straight lay",
        propertyOverrides: { "Tile Type": 1.5, Pattern: 1.0 },
      },
      {
        label: "Porcelain — herringbone",
        description: "Premium look, higher labor",
        propertyOverrides: { "Tile Type": 1.5, Pattern: 1.4 },
      },
      {
        label: "Natural stone — straight lay",
        propertyOverrides: { "Tile Type": 2.6, Pattern: 1.0 },
      },
      {
        label: "Marble mosaic — diagonal",
        description: "Luxury feature floor",
        propertyOverrides: { "Tile Type": 4.0, Pattern: 1.2 },
      },
    ],
  },
  {
    id: "stub-carpet",
    catId: "56.9", // FLOORING MATERIALS COMBINED and TILE
    name: "Carpet flooring (installed)",
    description:
      "Tufted carpet over foam pad, including tack strips, transitions, " +
      "and installation. Grade drives material cost; pad thickness affects " +
      "comfort + wear life. 10% waste factor included for cuts.",
    trade: "flooring",
    properties: [
      { name: "Floor Area", uom: "SF", defaultValue: 500 },
      {
        name: "Carpet Grade",
        uom: "",
        defaultValue: 1.0,
        kind: "option",
        options: [
          { label: "Builder grade", value: 1.0 },
          { label: "Standard polyester", value: 1.4 },
          { label: "Nylon premium", value: 2.0 },
          { label: "Wool", value: 3.5 },
        ],
      },
      {
        name: "Pad Thickness",
        uom: "IN",
        defaultValue: 0.625,
        kind: "choice",
        choices: [0.375, 0.5, 0.625, 0.75, 0.875],
      },
    ],
    materials: [
      {
        name: "Carpet + pad + tack strip (installed)",
        uom: "SF",
        // 10% waste factor included in the quantity.
        quantityFormula: "{Floor Area} * 1.10",
        unitCostUsd: 0,
        // Base $2.50/SF carpet × grade multiplier, plus pad cost
        // scaled off 5/8" baseline ($0.80/SF at 5/8").
        unitCostFormula:
          "(2.50 * {Carpet Grade}) + (0.80 * {Pad Thickness} / 0.625)",
        laborCostUsd: 1.1,
        csiDivision: "09",
      },
    ],
    variantPresets: [
      {
        label: "Builder grade (rental / spec)",
        propertyOverrides: { "Carpet Grade": 1.0 },
      },
      {
        label: "Standard polyester",
        propertyOverrides: { "Carpet Grade": 1.4 },
      },
      {
        label: "Nylon premium",
        description: "Stain-resistant, longer wear life",
        propertyOverrides: { "Carpet Grade": 2.0 },
      },
      {
        label: "Wool (luxury)",
        description: "Natural fiber, soft hand, premium price",
        propertyOverrides: { "Carpet Grade": 3.5 },
      },
    ],
  },
];

/** Find a stub assembly by id, or null if not in the catalog. */
export function findStubAssembly(id: string): Assembly | null {
  return STUB_ASSEMBLIES.find((a) => a.id === id) ?? null;
}
