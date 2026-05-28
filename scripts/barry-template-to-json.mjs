// Parses Barry's "Estimate template house.xlsx" → typed JSON the app
// can ship as default data. Writes src/lib/estimate-template-default.ts.
//
// Schema:
//   { sections: [
//       { id: "1", name: "Lot Purchase", items: [
//           { id: "2.1", name: "Prints", qty: null, unit: null,
//             unit_cost: null, est_method: null }
//         ] }
//     ] }
//
// Sections are whole-number Cat IDs (1, 2, 3...). Items are the
// decimal Cat IDs that follow under each section (2.1, 2.2, 24.1, etc.).
// Quantities, units, and unit costs come straight from the sheet where
// present — Barry will edit pricing in the app later.

import { readFileSync, writeFileSync } from "node:fs";

const tmpDir = "C:\\Users\\cmadd\\AppData\\Local\\Temp\\xlsx_extract";

const sharedXml = readFileSync(`${tmpDir}/xl/sharedStrings.xml`, "utf8");
const strings = [];
{
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(sharedXml))) {
    const inner = m[1];
    const text = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((mt) => mt[1])
      .join("");
    strings.push(
      text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .trim(),
    );
  }
}

const sheetXml = readFileSync(`${tmpDir}/xl/worksheets/sheet2.xml`, "utf8");
const rowRe = /<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
const cellRe = /<c\b[^>]*r="([A-Z]+\d+)"(?:[^>]*t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g;

const rows = [];
let m;
while ((m = rowRe.exec(sheetXml))) {
  const cellsXml = m[2];
  const cells = {};
  let cm;
  while ((cm = cellRe.exec(cellsXml))) {
    const ref = cm[1];
    const type = cm[2];
    const innerXml = cm[3];
    const valMatch = innerXml.match(/<v>([\s\S]*?)<\/v>/);
    if (!valMatch) continue;
    const raw = valMatch[1];
    const col = ref.match(/^[A-Z]+/)[0];
    cells[col] = type === "s" ? (strings[Number(raw)] ?? "") : raw;
  }
  rows.push(cells);
}

function isSectionId(id) {
  // Whole-number cat id (e.g. "1", "21", "700") — no decimal or letter.
  return /^\d+$/.test(id);
}
function isItemId(id) {
  // Decimal sub-id (e.g. "2.1", "21.5a") under a section.
  return /^\d+\.\d+[a-z]?$/.test(id);
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const sections = [];
let currentSection = null;
for (const r of rows) {
  const catId = (r.A ?? "").toString().trim();
  const name = (r.B ?? "").toString().trim();
  if (!catId) continue;

  if (isSectionId(catId) && name) {
    currentSection = {
      id: catId,
      name,
      items: [],
    };
    sections.push(currentSection);
    continue;
  }

  if (isItemId(catId) && currentSection) {
    currentSection.items.push({
      id: catId,
      name,
      // Column C is "Type" — sometimes free text ("Estimate", "LF"),
      // sometimes a numeric method code. Preserve as a hint.
      type: (r.C ?? "").toString().trim() || null,
      // Column E is Qty, F is Unit, G is Unit Cost. Barry leaves G
      // blank in the template; he'll fill in via the app.
      qty: num(r.E),
      unit: (r.F ?? "").toString().trim() || null,
      unit_cost: num(r.G),
    });
  }
}

const out = { sections };
console.error(
  `Built ${sections.length} sections, ${sections.reduce((s, x) => s + x.items.length, 0)} items`,
);

// Write as a TypeScript module so the app can import it directly.
const ts = `// Auto-generated from Barry McCluskey's "Estimate template house.xlsx"
// (Good Faith Estimate template) by scripts/barry-template-to-json.mjs.
//
// 70 sections, ~210 line items. Sections are whole-number Cat IDs
// (1, 2, 21, 700, etc.); items are decimal sub-IDs (2.1, 21.5a, etc.).
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

export interface EstimateTemplate {
  sections: EstimateTemplateSection[];
}

export const DEFAULT_ESTIMATE_TEMPLATE: EstimateTemplate = ${JSON.stringify(out, null, 2)};
`;

const outPath = "src/lib/estimate-template-default.ts";
writeFileSync(outPath, ts, "utf8");
console.error(`Wrote ${outPath}`);
