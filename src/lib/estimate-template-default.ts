// Auto-generated from Barry McCluskey's "Estimate template house.xlsx"
// (Good Faith Estimate template) by scripts/barry-template-to-json.mjs.
//
// Structure: categories → sections → items. Categories are the bold
// main headings on the sheet (PRE-CONSTRUCTION, FOUNDATION, etc.).
// Sections are whole-number Cat IDs (1, 2, 21, 50, 700, ...) — the
// collapsible groups. Items are the decimal sub-IDs (2.1, 21.5a, etc.)
// plus a synthetic 1-line item for any section that had no children
// in the source spreadsheet.
//
// Quantities, units, and unit costs come straight from the spreadsheet
// where present; builders edit pricing per-project in the Settings UI.
//
// Do not hand-edit — regenerate via:
//   node scripts/barry-template-to-json.mjs

export interface EstimateTemplateItem {
  id: string;
  name: string;
  /** "Estimate", "LF", "SF", numeric method code, or null. */
  type: string | null;
  qty: number | null;
  unit: string | null;
  unit_cost: number | null;
}

export interface EstimateTemplateSection {
  id: string;
  name: string;
  items: EstimateTemplateItem[];
}

export interface EstimateTemplateCategory {
  id: string;
  name: string;
  sections: EstimateTemplateSection[];
}

export interface EstimateTemplate {
  categories: EstimateTemplateCategory[];
}

export const DEFAULT_ESTIMATE_TEMPLATE: EstimateTemplate = {
  "categories": [
    {
      "id": "pre-construction",
      "name": "PRE-CONSTRUCTION (1-19)",
      "sections": [
        {
          "id": "1",
          "name": "Lot Purchase",
          "items": [
            {
              "id": "1",
              "name": "Lot Purchase",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "2",
          "name": "PRINTS & PERMITS",
          "items": [
            {
              "id": "2.1",
              "name": "Prints",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "2.2",
              "name": "Building Permits",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "2.3",
              "name": "Lic's & Fees/Sewer Access Fee",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "3",
          "name": "Construction Rd.",
          "items": [
            {
              "id": "3",
              "name": "Construction Rd.",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "4",
          "name": "Surveys",
          "items": [
            {
              "id": "4",
              "name": "Surveys",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "5",
          "name": "Testing/Engineering",
          "items": [
            {
              "id": "5",
              "name": "Testing/Engineering",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "6",
          "name": "Rental Equipment Lul for Brick Chimneys",
          "items": [
            {
              "id": "6",
              "name": "Rental Equipment Lul for Brick Chimneys",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "7",
          "name": "Construction Pole for Power",
          "items": [
            {
              "id": "7",
              "name": "Construction Pole for Power",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "8",
          "name": "Electric Tie-In / Accelerated Service",
          "items": [
            {
              "id": "8",
              "name": "Electric Tie-In / Accelerated Service",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "9",
          "name": "Electric Usage",
          "items": [
            {
              "id": "9",
              "name": "Electric Usage",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "10",
          "name": "Septic Tank Allowance",
          "items": [
            {
              "id": "10",
              "name": "Septic Tank Allowance",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "11",
          "name": "Driveway: Culvert Entrance, Undercut, Install 4\" Gravel",
          "items": [
            {
              "id": "11",
              "name": "Driveway: Culvert Entrance, Undercut, Install 4\" Gravel",
              "type": null,
              "qty": 0,
              "unit": "LOAD",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "12",
          "name": "Temporary Toilets",
          "items": [
            {
              "id": "12",
              "name": "Temporary Toilets",
              "type": null,
              "qty": 4,
              "unit": "Mo.",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "13",
          "name": "Dumpster/Trash Removal",
          "items": [
            {
              "id": "13",
              "name": "Dumpster/Trash Removal",
              "type": null,
              "qty": 10,
              "unit": "DUMPS",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "14",
          "name": "Waterline Installed",
          "items": [
            {
              "id": "14",
              "name": "Waterline Installed",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "15",
          "name": "Pest Control Pre-Treat",
          "items": [
            {
              "id": "15",
              "name": "Pest Control Pre-Treat",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "16",
          "name": "Sewer Tap Fee",
          "items": [
            {
              "id": "16",
              "name": "Sewer Tap Fee",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "17",
          "name": "Gas Fee",
          "items": [
            {
              "id": "17",
              "name": "Gas Fee",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "18",
          "name": "Irrigation Meter",
          "items": [
            {
              "id": "18",
              "name": "Irrigation Meter",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "19",
          "name": "Water Tap Fee",
          "items": [
            {
              "id": "19",
              "name": "Water Tap Fee",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        }
      ]
    },
    {
      "id": "foundation",
      "name": "FOUNDATION  (20-29)",
      "sections": [
        {
          "id": "20",
          "name": "SITE WORK",
          "items": [
            {
              "id": "20.1",
              "name": "Site Prepand basement excavation",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "20.2",
              "name": "Clearing and Haul Off",
              "type": null,
              "qty": null,
              "unit": "Days",
              "unit_cost": null
            },
            {
              "id": "20.3",
              "name": "After Construction Remove Clean install topsoil",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "20.4",
              "name": "Site Grading and Hauling Off",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "20.5",
              "name": "Storm Drains and Inlets",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "20.5a",
              "name": "10 Loads Topsoil",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "20.5b",
              "name": "Cleanup Rough In. Install Soil",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "20.5c",
              "name": "Haul Spoil Construction Debree",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "21",
          "name": "FOOTINGS",
          "items": [
            {
              "id": "21.1",
              "name": "Footing Labor",
              "type": null,
              "qty": 16.2,
              "unit": "Yd",
              "unit_cost": null
            },
            {
              "id": "21.2",
              "name": "Footing & Foundation Labor",
              "type": null,
              "qty": 180,
              "unit": "LF",
              "unit_cost": null
            },
            {
              "id": "21.3",
              "name": "Rebar & Chairs",
              "type": null,
              "qty": 18,
              "unit": "Sticks",
              "unit_cost": null
            },
            {
              "id": "21.4",
              "name": "Footing Material",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "21.5",
              "name": "Grade Beam/Daylight Footings",
              "type": "LF",
              "qty": 0,
              "unit": "Yd",
              "unit_cost": null
            },
            {
              "id": "21.5a",
              "name": "Corners",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "21.6",
              "name": "Bulkheads/ blockouts",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "21.6a",
              "name": "Steps in Footer",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "21.7",
              "name": "Pier Footings",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "22",
          "name": "Storm Shelter Lid with FEMA door",
          "items": [
            {
              "id": "22",
              "name": "Storm Shelter Lid with FEMA door",
              "type": null,
              "qty": null,
              "unit": "SF",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "23",
          "name": "Poured Walls Material",
          "items": [
            {
              "id": "23",
              "name": "Poured Walls Material",
              "type": null,
              "qty": 0,
              "unit": "Yds",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "24",
          "name": "FOUNDATION WALLS",
          "items": [
            {
              "id": "24.1",
              "name": "Block Material",
              "type": "Courses",
              "qty": 475.2,
              "unit": "block",
              "unit_cost": null
            },
            {
              "id": "24.2",
              "name": "Block Mortar",
              "type": null,
              "qty": 9.504,
              "unit": "bag",
              "unit_cost": null
            },
            {
              "id": "24.3",
              "name": "Block Sand",
              "type": null,
              "qty": 2,
              "unit": "TON",
              "unit_cost": null
            },
            {
              "id": "24.4",
              "name": "Block Labor",
              "type": null,
              "qty": 475.2,
              "unit": "block",
              "unit_cost": null
            },
            {
              "id": "24.5",
              "name": "Foundation Vents Not Necessary Sealed Crawl",
              "type": null,
              "qty": 0,
              "unit": "each",
              "unit_cost": null
            },
            {
              "id": "24.6",
              "name": "Foundation Grates",
              "type": null,
              "qty": 0,
              "unit": "each",
              "unit_cost": null
            },
            {
              "id": "24.7",
              "name": "Foundation Vent Install Labor",
              "type": null,
              "qty": 0,
              "unit": "each",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "25",
          "name": "WATERPROOFING",
          "items": [
            {
              "id": "25.1",
              "name": "Foundation Drain Material",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "25.2",
              "name": "Foundation Drain Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "25.3",
              "name": "Waterproofing",
              "type": null,
              "qty": 0,
              "unit": "LOAD",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "26",
          "name": "SLAB",
          "items": [
            {
              "id": "26.1",
              "name": "Concrete Material for All Flat Work",
              "type": null,
              "qty": 6.97142857142857,
              "unit": "Yd",
              "unit_cost": null
            },
            {
              "id": "26.2",
              "name": "Flatwork and Matt Slabs Labor",
              "type": null,
              "qty": 488,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "26.2a",
              "name": "Stamp Concrete",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "26.3",
              "name": "Wire Mesh, poly, anchor bolts, interior drain, saw joints",
              "type": null,
              "qty": 1,
              "unit": "ROLLS",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "27",
          "name": "Concrete Pumping",
          "items": [
            {
              "id": "27",
              "name": "Concrete Pumping",
              "type": null,
              "qty": null,
              "unit": "each",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "28",
          "name": "GRAVEL",
          "items": [
            {
              "id": "28.1",
              "name": "Trenching for Plumbing and Gas",
              "type": null,
              "qty": 1,
              "unit": "LOAD",
              "unit_cost": null
            },
            {
              "id": "28.3",
              "name": "Rock Removal Allowance if Needed",
              "type": null,
              "qty": 0,
              "unit": "LOAD",
              "unit_cost": null
            },
            {
              "id": "28.4",
              "name": "Gravel for Backfill",
              "type": null,
              "qty": 0,
              "unit": "LOAD",
              "unit_cost": null
            },
            {
              "id": "28.5",
              "name": "Labor to Install Gravel  Backfill",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "29",
          "name": "Misc. Foundation Well for Egress",
          "items": [
            {
              "id": "29",
              "name": "Misc. Foundation Well for Egress",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        }
      ]
    },
    {
      "id": "mechanical",
      "name": "MECHANICAL (30-39)",
      "sections": [
        {
          "id": "30",
          "name": "PLUMBING",
          "items": [
            {
              "id": "30.1",
              "name": "Water Heaters & Misc.",
              "type": null,
              "qty": 0,
              "unit": "Units",
              "unit_cost": null
            },
            {
              "id": "30.2",
              "name": "Plumbing Labor",
              "type": null,
              "qty": 20,
              "unit": "Drops",
              "unit_cost": null
            },
            {
              "id": "30.2a",
              "name": "Grinder Pump Allowance",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "30.3",
              "name": "Radon Venting",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "31",
          "name": "ELECTRICAL",
          "items": [
            {
              "id": "31.1",
              "name": "22 kw Generator and Pad Transfer Switch Delivered and Installed",
              "type": null,
              "qty": 20,
              "unit": "Each",
              "unit_cost": null
            },
            {
              "id": "31.2",
              "name": "Electric Labor",
              "type": null,
              "qty": 3300,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "31.3",
              "name": "Structured Wiring",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "31.4",
              "name": "Home Theater Pre-wire / Media Equipment",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "31.5",
              "name": "Whole Home Music and Sound",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "31.6",
              "name": "Security Camera CCTV Installation",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "31.7",
              "name": "5 Infrared 120v 1500 w Heaters Inline Lighting",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "32",
          "name": "Security System",
          "items": [
            {
              "id": "32",
              "name": "Security System",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "33",
          "name": "HVAC",
          "items": [
            {
              "id": "33.1",
              "name": "Steam Humidifier for unit",
              "type": null,
              "qty": 0,
              "unit": "drops",
              "unit_cost": null
            },
            {
              "id": "33.2",
              "name": "Propane Tank",
              "type": null,
              "qty": 0,
              "unit": "each",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "34",
          "name": "FIREPLACE",
          "items": [
            {
              "id": "34.1",
              "name": "Prefab",
              "type": null,
              "qty": 1,
              "unit": "each",
              "unit_cost": null
            },
            {
              "id": "34.2",
              "name": "Hearth",
              "type": null,
              "qty": 0,
              "unit": "each",
              "unit_cost": null
            },
            {
              "id": "34.2a",
              "name": "Metal Surround",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "34.3",
              "name": "Surround",
              "type": null,
              "qty": 0,
              "unit": "each",
              "unit_cost": null
            },
            {
              "id": "34.4",
              "name": "Chimney Cap Allowance",
              "type": null,
              "qty": 0,
              "unit": "each",
              "unit_cost": null
            },
            {
              "id": "34.5",
              "name": "Mantle Interior Only",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "34.5a",
              "name": "Mantle Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "34.6",
              "name": "Chimney Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "39",
          "name": "Misc. Mechanical HVAC design",
          "items": [
            {
              "id": "39",
              "name": "Misc. Mechanical HVAC design",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        }
      ]
    },
    {
      "id": "framing-and-exterior",
      "name": "FRAMING AND EXTERIOR (40-49)",
      "sections": [
        {
          "id": "40",
          "name": "FRAMING",
          "items": [
            {
              "id": "40.1",
              "name": "Framing Material",
              "type": null,
              "qty": 3500,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "40.1a",
              "name": "Structural Steel and Labor to install",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "40.2",
              "name": "Framing Labor",
              "type": null,
              "qty": 3500,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "40.3",
              "name": "Cornice Material",
              "type": null,
              "qty": 0,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "40.4",
              "name": "Cornice Install Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "40.5",
              "name": "Windows",
              "type": null,
              "qty": null,
              "unit": "each",
              "unit_cost": null
            },
            {
              "id": "40.6",
              "name": "Exterior Doors ($25,970.94) | Bifold + Terrace/ French Terrace Door ($5,928.88)  Steel Door",
              "type": null,
              "qty": 2,
              "unit": "Units",
              "unit_cost": null
            },
            {
              "id": "40.6a",
              "name": "Garage Doors - ALLOWANCE",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "40.6b",
              "name": "Window and Door Installation Material",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "40.7",
              "name": "Setting Window and Door",
              "type": null,
              "qty": 1,
              "unit": "Dbl",
              "unit_cost": null
            },
            {
              "id": "40.8",
              "name": "Front Door - ALLOWANCE",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "40.9",
              "name": "Louvered Vents",
              "type": null,
              "qty": 1,
              "unit": "each",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "41",
          "name": "BRICK",
          "items": [
            {
              "id": "41.1",
              "name": "Materials",
              "type": null,
              "qty": 12,
              "unit": "Brick",
              "unit_cost": null
            },
            {
              "id": "41.2",
              "name": "Brick Labor - ALLOWANCE",
              "type": null,
              "qty": 120,
              "unit": "Bag",
              "unit_cost": null
            },
            {
              "id": "41.3",
              "name": "Walkway Masonry Material and Labor",
              "type": null,
              "qty": 10,
              "unit": "Ton",
              "unit_cost": null
            },
            {
              "id": "41.5",
              "name": "Lintels",
              "type": null,
              "qty": 0,
              "unit": "each",
              "unit_cost": null
            },
            {
              "id": "41.6",
              "name": "Pavers for Pavillions and Patios",
              "type": null,
              "qty": 0,
              "unit": "each",
              "unit_cost": null
            },
            {
              "id": "41.7",
              "name": "Address Block or Décor Metal Vents",
              "type": null,
              "qty": 0,
              "unit": "each",
              "unit_cost": null
            },
            {
              "id": "41.8",
              "name": "Pavor Labor 4.50 sq ft 2560 sq ft",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "41.9",
              "name": "STUCCO",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "42",
          "name": "STONE",
          "items": [
            {
              "id": "42.1",
              "name": "Stone Material + Sand & Mortar",
              "type": null,
              "qty": 0,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "42.2",
              "name": "Stone Labor",
              "type": null,
              "qty": 0,
              "unit": "Bag",
              "unit_cost": null
            },
            {
              "id": "42.3",
              "name": "Block Material",
              "type": null,
              "qty": 0,
              "unit": "Sheets",
              "unit_cost": null
            },
            {
              "id": "42.4",
              "name": "Block Labor",
              "type": null,
              "qty": 0,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "42.5",
              "name": "Limestone Interior",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "42.6",
              "name": "Limestone Exterior",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "42.7",
              "name": "Limestone Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "43",
          "name": "HARDIE, VINYL, & PORCHES",
          "items": [
            {
              "id": "43.1",
              "name": "Hardie Siding Material",
              "type": null,
              "qty": 5,
              "unit": "SQ",
              "unit_cost": null
            },
            {
              "id": "43.2",
              "name": "Hardie Siding Labor",
              "type": null,
              "qty": 5,
              "unit": "SQ",
              "unit_cost": null
            },
            {
              "id": "43.2a",
              "name": "Dormers Cornice Trim and Siding",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "43.2b",
              "name": "Rear Arches",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "43.2c",
              "name": "Wrap Garage Doors",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "43.2d",
              "name": "Porch Ceiling and V-groove Material",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "43.3",
              "name": "Vinyl Siding M & L",
              "type": null,
              "qty": 0,
              "unit": "SQ",
              "unit_cost": null
            },
            {
              "id": "43.4",
              "name": "Vinyl Soffits M&L",
              "type": null,
              "qty": 0,
              "unit": "LF",
              "unit_cost": null
            },
            {
              "id": "43.5",
              "name": "Hardi Shake Siding Material",
              "type": "Vinyl Shake",
              "qty": 0,
              "unit": "SQ",
              "unit_cost": null
            },
            {
              "id": "43.6",
              "name": "Hardi Shake Siding Labor",
              "type": null,
              "qty": 0,
              "unit": "SQ",
              "unit_cost": null
            },
            {
              "id": "43.7",
              "name": "Screen Porch Material",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "43.8",
              "name": "Screen Porch Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "43.8a",
              "name": "Rainier Screen System Electronic Screen Porch",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "43.9",
              "name": "Porch Ceiling Labor V-groove and Beam Work Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "44",
          "name": "EXTERIOR DETAILS",
          "items": [
            {
              "id": "44.1",
              "name": "Timber Frame M&L With Lul and Boom Truck",
              "type": null,
              "qty": 0,
              "unit": "Pair",
              "unit_cost": null
            },
            {
              "id": "44.2",
              "name": "Gutter Chains",
              "type": null,
              "qty": 7,
              "unit": "Each",
              "unit_cost": null
            },
            {
              "id": "44.3",
              "name": "Exterior Trim",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "44.4",
              "name": "Gutters",
              "type": null,
              "qty": 200,
              "unit": "LF",
              "unit_cost": null
            },
            {
              "id": "44.5",
              "name": "Gutter Drain 4 in PVC pipe",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "44.6",
              "name": "Ornamental Iron / CY Fencing",
              "type": null,
              "qty": 0,
              "unit": "LF",
              "unit_cost": null
            },
            {
              "id": "44.7",
              "name": "Cable Railing",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "45",
          "name": "SITE GRADING",
          "items": [
            {
              "id": "45.1",
              "name": "Rough and final grade spread 10 loads topsoil",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "45.2",
              "name": "prepare beds harley rake for sod and seed and straw areas",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "46",
          "name": "DRIVEWAY & WALKS",
          "items": [
            {
              "id": "46.1",
              "name": "Driveway and Walks Material",
              "type": null,
              "qty": 18.6666666666667,
              "unit": "Yd",
              "unit_cost": null
            },
            {
              "id": "46.2",
              "name": "Driveway and Walks Labor",
              "type": null,
              "qty": 1400,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "46.3",
              "name": "Gravel for Drive",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "46.4",
              "name": "Machine Time for Drive",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "46.4a",
              "name": "Wire Mesh for Drive",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "47",
          "name": "DECK / TERRACE",
          "items": [
            {
              "id": "47.1",
              "name": "1-Mirtered Siding/trim around windows & curved detail at skirt area installed | 2- Gabled vents installed | 3-Timber corbels installed | 4- 12 heavy timber columns set on back porch | 5-Corbels for columns installed | 6-Front porch ceiling installed w/ pockets for rock columns",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "47.2",
              "name": "Install Steps Wrap Beams",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "47.3",
              "name": "Porch Labor Install Flooring",
              "type": null,
              "qty": 0,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "47.4",
              "name": "Set Columns",
              "type": "0",
              "qty": 0,
              "unit": "Yd",
              "unit_cost": null
            },
            {
              "id": "47.5",
              "name": "Porch Framing, Flooring material",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "47.6",
              "name": "Porch Railings",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "47.8",
              "name": "Timber Columns and Braces for Back Porch",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "48",
          "name": "ROOFING",
          "items": [
            {
              "id": "48.1",
              "name": "Roofing Material",
              "type": null,
              "qty": 20,
              "unit": "SQ",
              "unit_cost": null
            },
            {
              "id": "48.2",
              "name": "Roofing Labor, Shingle Plan",
              "type": null,
              "qty": 20,
              "unit": "SQ",
              "unit_cost": null
            },
            {
              "id": "48.3",
              "name": "Metal Roofing Including Labor METAL not Copper",
              "type": null,
              "qty": 4,
              "unit": "SQ",
              "unit_cost": null
            },
            {
              "id": "48.4",
              "name": "Waterproofing Terrace",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "48.5",
              "name": "Install Cupola and Finials",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "49",
          "name": "Decorative Cupola for Roof",
          "items": [
            {
              "id": "49",
              "name": "Decorative Cupola for Roof",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        }
      ]
    },
    {
      "id": "interior-and-exterior-finish",
      "name": "INTERIOR AND EXTERIOR FINISH (50-69)",
      "sections": [
        {
          "id": "50",
          "name": "Insulation Spray foam rafters and walls, full foam",
          "items": [
            {
              "id": "50.1",
              "name": "sealed crawl 10 mil poly and 2in closed cell foam",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "50.2",
              "name": "Convential Batt and Blown Attic",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "50.2a",
              "name": "Insulate Garage",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "50.3",
              "name": "Commissioning/DET Testing",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "51",
          "name": "DRYWALL",
          "items": [
            {
              "id": "51.1",
              "name": "Drywall Material",
              "type": null,
              "qty": 210,
              "unit": "BDS",
              "unit_cost": null
            },
            {
              "id": "51.2",
              "name": "Drywall Labor",
              "type": null,
              "qty": 10920,
              "unit": "SF",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "52",
          "name": "Painting",
          "items": [
            {
              "id": "52.1",
              "name": "Interior & Exterior Painting | Up to 5 colors, Egg Shell Finish",
              "type": null,
              "qty": 1200,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "52.2",
              "name": "Faux Painting",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "53",
          "name": "INTERIOR TRIM AND DOORS",
          "items": [
            {
              "id": "53.1",
              "name": "Int. Trim and Doors Materials",
              "type": null,
              "qty": 3500,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "53.2",
              "name": "Int. Trim & Doors Labor (Solid core doors trimmed and set, 1 piece base, 1 piece windows with stool",
              "type": null,
              "qty": 0,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "53.3",
              "name": "Large Cased Openings and Arched Cased Openings",
              "type": "6-8 HC",
              "qty": 8,
              "unit": "Sgls",
              "unit_cost": null
            },
            {
              "id": "53.4",
              "name": "Crown Moulding Labor",
              "type": null,
              "qty": null,
              "unit": "Dbls",
              "unit_cost": null
            },
            {
              "id": "53.4b",
              "name": "Shiplap Ceiling Material",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "53.4a",
              "name": "Shiplap Ceiling Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "53.5",
              "name": "Coffer Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "53.6",
              "name": "Interior Columns Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "53.7",
              "name": "Built In Nook and Pantry",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "53.8",
              "name": "Closet Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "53.9",
              "name": "Hollow beams installed in greate room sloped ceiling and basement",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "54",
          "name": "STAIRWAY",
          "items": [
            {
              "id": "54.1",
              "name": "Stairway Material",
              "type": null,
              "qty": 0,
              "unit": "Steps",
              "unit_cost": null
            },
            {
              "id": "54.2",
              "name": "Stairway Labor (Wall to Wall) + Landing railing",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "54.3",
              "name": "Circular Staircase",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "54.4",
              "name": "Raised floor media Room",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "55",
          "name": "Landscaping",
          "items": [
            {
              "id": "55.1",
              "name": "Labor and Material for 6 zones irrigation",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "55.1a",
              "name": "Labor and material to install flatstone patios at house",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "55.1b",
              "name": "Labor and material for flatstone walkways",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "55.1c",
              "name": "flabor and material for flatstone areas in drive",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "55.1d",
              "name": "labor & material 2 stack stone wallson right side of house",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "55.1e",
              "name": "Labor & Material 2 stone wallls on left side of house",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "55.1f",
              "name": "Stone Material for all Hardscapes",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "55.2",
              "name": "Labor and  material 15 yds mulch and shovel edging",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "55.3",
              "name": "Plants and trees delivery and labor to install",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "55.4",
              "name": "5 loads topsoil",
              "type": null,
              "qty": 150,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "55.5",
              "name": "5 yards soil mix for flower beds",
              "type": null,
              "qty": 150,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "55.6",
              "name": "Labor to install Brick Edging for 2 Flower Beds and 8 18x18 columns",
              "type": null,
              "qty": 1,
              "unit": "@",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "56",
          "name": "Entrance Budget",
          "items": [
            {
              "id": "56.1",
              "name": "Labor and equipment to install sod",
              "type": null,
              "qty": 40,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "56.2",
              "name": "Landscaping Lighting, timer, 41 lights L&M",
              "type": null,
              "qty": 40,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "56.3",
              "name": "Labor and material 550 sq ft flat stone walkway",
              "type": null,
              "qty": 75,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "56.4",
              "name": "Labor and Equipment to clean up debris and do first and final grade",
              "type": null,
              "qty": 75,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "56.4a",
              "name": "Cardboard Floor Cover Material",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "56.4b",
              "name": "Cardboard Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "56.4c",
              "name": "Floor Prep and Freight Allowance",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "56.5",
              "name": "Tile Material",
              "type": null,
              "qty": 80,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "56.6",
              "name": "Tile Labor",
              "type": null,
              "qty": 80,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "56.6a",
              "name": "Glass Block System",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "56.6b",
              "name": "Glass Block Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "56.7",
              "name": "Outdoor Labor for waerproofing",
              "type": null,
              "qty": 0,
              "unit": "@",
              "unit_cost": null
            },
            {
              "id": "56.8",
              "name": "Outdoor Materials forwaterproofing",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "56.9",
              "name": "FLOORING MATERIALS COMBINED and TILE",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "56.9a",
              "name": "Hardwood Material",
              "type": null,
              "qty": 1800,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "56.9b",
              "name": "Hardwood Install and Sand & Finish Labor",
              "type": null,
              "qty": 1800,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "56.9c",
              "name": "Basement LVP Labor",
              "type": null,
              "qty": 1100,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "56.9d",
              "name": "Underlayment Materials",
              "type": null,
              "qty": 5,
              "unit": "@",
              "unit_cost": null
            },
            {
              "id": "56.9e",
              "name": "Rubber Interlocking",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "56.9f",
              "name": "Rubber interlocking labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "57",
          "name": "CLEANUP",
          "items": [
            {
              "id": "57.5a",
              "name": "General Labor  / Cleanup",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "57.5b",
              "name": "Final Cleaning",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "57.5c",
              "name": "Window Scraping",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "57.5d",
              "name": "Pressure Washing",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "58",
          "name": "Bob Wallace Appliance",
          "items": [
            {
              "id": "58",
              "name": "Bob Wallace Appliance",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "59",
          "name": "Cabinets",
          "items": [
            {
              "id": "59",
              "name": "Cabinets",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "60",
          "name": "COUNTERTOPS",
          "items": [
            {
              "id": "60.1",
              "name": "Kitchen Granite",
              "type": null,
              "qty": 45,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "60.2",
              "name": "Bathroom Solid Surface / Cultured Marble",
              "type": null,
              "qty": 30,
              "unit": "SF",
              "unit_cost": null
            },
            {
              "id": "60.3",
              "name": "Laundry",
              "type": null,
              "qty": 4,
              "unit": "LF",
              "unit_cost": null
            },
            {
              "id": "60.4",
              "name": "Master Bath",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "60.5",
              "name": "Powder Bath",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "60.6",
              "name": "Guest Bath",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "60.7",
              "name": "Basement Guest",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "60.8",
              "name": "Basement Den Bath",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "60.9",
              "name": "Basement Bar",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "60.1",
              "name": "Kitchen Backsplash Material-ALLOWANCE",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "60.11",
              "name": "Kitchen Backsplash Labor- ALLOWANCE",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "61",
          "name": "Mirrors",
          "items": [
            {
              "id": "61",
              "name": "Mirrors",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "62",
          "name": "Bathroom Accessories",
          "items": [
            {
              "id": "62.1",
              "name": "Bath Accessory Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "63",
          "name": "DOOR HARDWARE",
          "items": [
            {
              "id": "63.1",
              "name": "Exterior Door Hardware",
              "type": null,
              "qty": 1,
              "unit": "Each",
              "unit_cost": null
            },
            {
              "id": "63.2",
              "name": "Interior Door Hardware",
              "type": null,
              "qty": 8,
              "unit": "Each",
              "unit_cost": null
            },
            {
              "id": "63.3",
              "name": "Door Hardward Install Labor",
              "type": null,
              "qty": 9,
              "unit": "Each",
              "unit_cost": null
            },
            {
              "id": "63.4",
              "name": "Shoe Mold Labor",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "64",
          "name": "Shower Doors",
          "items": [
            {
              "id": "64",
              "name": "Shower Doors",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "65",
          "name": "Lighting Fixtures",
          "items": [
            {
              "id": "65",
              "name": "Lighting Fixtures",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "66",
          "name": "Plumbing Fixtures and Bath Accessories",
          "items": [
            {
              "id": "66",
              "name": "Plumbing Fixtures and Bath Accessories",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "67",
          "name": "LAWN & GARDEN",
          "items": [
            {
              "id": "67.09999999999999",
              "name": "Irrigation",
              "type": null,
              "qty": 0,
              "unit": "ZONES",
              "unit_cost": 250
            },
            {
              "id": "67.2",
              "name": "Landscaping",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            },
            {
              "id": "67.3",
              "name": "Retaining Walls",
              "type": null,
              "qty": null,
              "unit": "SF",
              "unit_cost": 17.5
            },
            {
              "id": "66.2",
              "name": "Retainer Wall Allowance Daylight Basement",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "67b",
          "name": "Interior Finish Design + Schedules and Project Consultant",
          "items": [
            {
              "id": "67b",
              "name": "Interior Finish Design + Schedules and Project Consultant",
              "type": null,
              "qty": null,
              "unit": "Sf",
              "unit_cost": null
            }
          ]
        }
      ]
    },
    {
      "id": "miscellaneous",
      "name": "Miscellaneous",
      "sections": [
        {
          "id": "700",
          "name": "Closing Costs",
          "items": [
            {
              "id": "700",
              "name": "Closing Costs",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        },
        {
          "id": "705",
          "name": "Construction Loan Interest",
          "items": [
            {
              "id": "705",
              "name": "Construction Loan Interest",
              "type": null,
              "qty": 3,
              "unit": "Mo.",
              "unit_cost": 2000
            }
          ]
        },
        {
          "id": "710",
          "name": "Sales Commission",
          "items": [
            {
              "id": "710",
              "name": "Sales Commission",
              "type": null,
              "qty": null,
              "unit": "%",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "715",
          "name": "Contingency Factor",
          "items": [
            {
              "id": "715",
              "name": "Contingency Factor",
              "type": null,
              "qty": null,
              "unit": "%",
              "unit_cost": null
            }
          ]
        },
        {
          "id": "68",
          "name": "Builders Fee and Overhead",
          "items": [
            {
              "id": "68",
              "name": "Builders Fee and Overhead",
              "type": null,
              "qty": null,
              "unit": null,
              "unit_cost": null
            }
          ]
        }
      ]
    }
  ]
};
