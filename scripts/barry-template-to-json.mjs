// Parses Barry's "Estimate template house.xlsx" → typed JSON the app
// can ship as default data. Writes src/lib/estimate-template-default.ts.
//
// Schema (categories → sections → items, mirroring how Barry's sheet
// is laid out visually):
//
//   { categories: [
//       { id: "pre-construction",
//         name: "PRE-CONSTRUCTION (1-19)",
//         sections: [
//           { id: "1", name: "Lot Purchase", items: [
//               { id: "1", name: "Lot Purchase", qty: null, unit: null,
//                 unit_cost: null, type: null }
//             ] },
//           { id: "2", name: "PRINTS & PERMITS", items: [
//               { id: "2.1", name: "Prints", ... },
//               ...
//             ] }
//         ] }
//     ] }
//
// Classification rules (driven by Barry's actual styling):
//   - Bold-not-italic row (font index 7) → main heading (category)
//   - Italic row (font index 8/9/11/15/16) → subheading (section)
//   - Whole-number Cat ID (1, 2, ..., 700) → ALSO a subheading, even
//     if not styled italic. Barry uses these as group rows when there
//     are decimal children; we promote singletons (no children) to
//     a one-item section so the UI is uniform.
//   - Decimal Cat ID (2.1, 21.5a, 56.9, etc.) → item under the most
//     recent section.
//
// Every section ends up with at least one item. Sections that had no
// children get a single synthetic item carrying any qty/unit/cost
// data that was on the section row itself.

import { readFileSync, writeFileSync } from "node:fs";

const tmpDir = "C:\\Users\\cmadd\\AppData\\Local\\Temp\\xlsx_extract";

// ---- styles ----
// We need font.italic to tell a subheading row from a plain item row.
const stylesXml = readFileSync(`${tmpDir}/xl/styles.xml`, "utf8");

const fontsBlock = stylesXml.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/)[1];
const fonts = [];
{
  const re = /<font\b[^>]*>([\s\S]*?)<\/font>/g;
  let m;
  while ((m = re.exec(fontsBlock))) {
    const inner = m[1];
    fonts.push({
      bold: /<b\s+val="1"/.test(inner) || /<b\/>/.test(inner),
      italic: /<i\s+val="1"/.test(inner) || /<i\/>/.test(inner),
    });
  }
}

const cellXfsBlock = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)[1];
const cellXfs = [];
{
  const re = /<xf\b[^>]*>/g;
  let m;
  while ((m = re.exec(cellXfsBlock))) {
    const tag = m[0];
    const fontM = tag.match(/fontId="([^"]+)"/);
    cellXfs.push(fontM ? Number(fontM[1]) : 0);
  }
}

function fontOfStyle(styleIdx) {
  if (styleIdx == null) return null;
  const f = cellXfs[styleIdx];
  if (f == null) return null;
  return fonts[f] ?? null;
}

// ---- shared strings ----
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

// ---- rows ----
const sheetXml = readFileSync(`${tmpDir}/xl/worksheets/sheet2.xml`, "utf8");
const rowRe = /<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
const cellRe = /<c\b[^>]*r="([A-Z]+\d+)"((?:\s+[a-zA-Z]+="[^"]*")*)>([\s\S]*?)<\/c>/g;

const rows = [];
let m;
while ((m = rowRe.exec(sheetXml))) {
  const cellsXml = m[2];
  const cells = {};
  let cm;
  while ((cm = cellRe.exec(cellsXml))) {
    const ref = cm[1];
    const attrs = cm[2];
    const innerXml = cm[3];
    const typeM = attrs.match(/\st="([^"]+)"/);
    const styleM = attrs.match(/\ss="([^"]+)"/);
    const type = typeM ? typeM[1] : null;
    const style = styleM ? Number(styleM[1]) : null;
    const valMatch = innerXml.match(/<v>([\s\S]*?)<\/v>/);
    const raw = valMatch ? valMatch[1] : null;
    const col = ref.match(/^[A-Z]+/)[0];
    const value = raw == null ? null : (type === "s" ? (strings[Number(raw)] ?? "") : raw);
    cells[col] = { value, style };
  }
  rows.push(cells);
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function trimStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Some Cat IDs come back as floats like "67.09999999999999" because
// Excel stored 67.1 as a double. Round those to one decimal and back
// to a string so the UI shows "67.1" instead of garbage.
function normalizeCatId(raw) {
  const s = String(raw).trim();
  if (s === "") return null;
  // Already clean (e.g. "1", "21.5", "21.5a") — keep as-is.
  if (/^\d+(\.\d+[a-z]?)?$/.test(s)) return s;
  // Long float — round to 2 decimal places, strip trailing zeros.
  const n = Number(s);
  if (Number.isFinite(n)) {
    return n.toFixed(2).replace(/\.?0+$/, "");
  }
  return s;
}

function isSectionId(id) {
  return /^\d+$/.test(id);
}
function isItemId(id) {
  return /^\d+\.\d+[a-z]?$/.test(id);
}

// Slugify a heading like "PRE-CONSTRUCTION (1-19)" → "pre-construction".
function categorySlug(name) {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const categories = [];
let currentCategory = null;
let currentSection = null;

// Track used section IDs to disambiguate (Barry's sheet has Cat ID 67
// used twice — once for LAWN & GARDEN, once for Interior Finish Design).
const usedSectionIds = new Set();
function uniqueSectionId(base) {
  if (!usedSectionIds.has(base)) {
    usedSectionIds.add(base);
    return base;
  }
  let suffix = "b";
  while (usedSectionIds.has(`${base}${suffix}`)) {
    suffix = String.fromCharCode(suffix.charCodeAt(0) + 1);
  }
  const id = `${base}${suffix}`;
  usedSectionIds.add(id);
  return id;
}

for (const r of rows) {
  const catIdRaw = r.A?.value ?? "";
  const name = trimStr(r.B?.value);
  const bFont = fontOfStyle(r.B?.style);

  // Main heading: bold-not-italic column-B cell, no Cat ID in col A.
  // (The col-9 "Cat ID Categories" header row is bold but has "Cat ID"
  //  in col A — skip it.)
  if (bFont?.bold && !bFont?.italic && name && !catIdRaw) {
    currentCategory = {
      id: categorySlug(name) || `cat-${categories.length + 1}`,
      name,
      sections: [],
    };
    categories.push(currentCategory);
    currentSection = null;
    continue;
  }

  const catId = normalizeCatId(catIdRaw);
  if (!catId || !name) continue;

  const rowType = trimStr(r.C?.value);
  const rowQty = num(r.E?.value);
  const rowUnit = trimStr(r.F?.value);
  const rowCost = num(r.G?.value);

  // Subheading: whole-number Cat ID. The italicized rows ALSO have
  // whole-number Cat IDs, so this single rule catches both. Pure
  // styling-based detection would miss the unstyled group rows like
  // "50 Insulation" and "52 Painting".
  if (isSectionId(catId)) {
    if (!currentCategory) {
      // Shouldn't happen if the sheet is well-formed, but guard anyway.
      currentCategory = {
        id: `cat-${categories.length + 1}`,
        name: "Uncategorized",
        sections: [],
      };
      categories.push(currentCategory);
    }
    currentSection = {
      id: uniqueSectionId(catId),
      name,
      items: [],
      // Stash the row's own data so we can decide later whether to
      // promote it to an item (only if no decimal children show up).
      _rowData: { type: rowType, qty: rowQty, unit: rowUnit, unit_cost: rowCost },
    };
    currentCategory.sections.push(currentSection);
    continue;
  }

  // Item: decimal Cat ID under the current section.
  if (isItemId(catId) && currentSection) {
    currentSection.items.push({
      id: catId,
      name,
      type: rowType,
      qty: rowQty,
      unit: rowUnit,
      unit_cost: rowCost,
    });
  }
}

// Post-processing: every section must have at least one item.
// - If a section had decimal children AND row data on the section row,
//   drop the row data (it was just group metadata).
// - If a section had no children, materialize the row data as a single
//   synthetic item.
// - If a section had no children AND no row data, create a placeholder
//   item with the section's name so the UI doesn't show an empty card.
for (const cat of categories) {
  for (const sec of cat.sections) {
    const rd = sec._rowData;
    if (sec.items.length === 0) {
      sec.items.push({
        id: sec.id,
        name: sec.name,
        type: rd?.type ?? null,
        qty: rd?.qty ?? null,
        unit: rd?.unit ?? null,
        unit_cost: rd?.unit_cost ?? null,
      });
    }
    delete sec._rowData;
  }
}

// Quick sanity report so we can eyeball changes.
const totalSections = categories.reduce((n, c) => n + c.sections.length, 0);
const totalItems = categories.reduce(
  (n, c) => n + c.sections.reduce((m, s) => m + s.items.length, 0),
  0,
);
const itemsWithUnit = categories.reduce(
  (n, c) =>
    n +
    c.sections.reduce(
      (m, s) => m + s.items.filter((it) => it.unit != null).length,
      0,
    ),
  0,
);
console.error(
  `Built ${categories.length} categories, ${totalSections} sections, ${totalItems} items (${itemsWithUnit} with units)`,
);
for (const cat of categories) {
  console.error(
    `  ${cat.name}: ${cat.sections.length} sections, ${cat.sections.reduce((m, s) => m + s.items.length, 0)} items`,
  );
}

// Verify every item has an ID (paranoia — the user asked).
let missing = 0;
for (const cat of categories) {
  for (const sec of cat.sections) {
    for (const it of sec.items) {
      if (!it.id) missing++;
    }
  }
}
if (missing > 0) {
  console.error(`!! ${missing} items missing IDs`);
  process.exit(1);
}

const out = { categories };

const ts = `// Auto-generated from Barry McCluskey's "Estimate template house.xlsx"
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

export const DEFAULT_ESTIMATE_TEMPLATE: EstimateTemplate = ${JSON.stringify(out, null, 2)};
`;

const outPath = "src/lib/estimate-template-default.ts";
writeFileSync(outPath, ts, "utf8");
console.error(`Wrote ${outPath}`);
