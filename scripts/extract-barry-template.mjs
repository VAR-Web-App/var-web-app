// One-off: parse Barry's "Estimate template house.xlsx" → JSON of
// sections + line items so we can seed a Settings page with his
// taxonomy. Reads the xlsx directly (it's a zip of XML files); no
// extra deps beyond node's built-in zlib + a tiny string parser.

import { readFileSync, writeFileSync } from "node:fs";

// Assumes the xlsx has already been unzipped into this directory.
// (Earlier: `unzip "/c/.../Estimate template house.xlsx" -d /tmp/xlsx_extract`)
const tmpDir = "C:\\Users\\cmadd\\AppData\\Local\\Temp\\xlsx_extract";

// shared strings table — every text cell references one of these by index
const sharedXml = readFileSync(`${tmpDir}/xl/sharedStrings.xml`, "utf8");
const strings = [];
{
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(sharedXml))) {
    // strings can be wrapped in <t> directly or in <r><t></t></r> runs
    const inner = m[1];
    const text = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((mt) => mt[1])
      .join("");
    strings.push(text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
  }
}
console.error(`Loaded ${strings.length} shared strings`);

// Parse Summary sheet (sheet2.xml) — the bulk of Barry's template lives there
const sheetXml = readFileSync(`${tmpDir}/xl/worksheets/sheet2.xml`, "utf8");
const rowRe = /<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
const cellRe = /<c\b[^>]*r="([A-Z]+\d+)"(?:[^>]*t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g;

const rows = [];
let m;
while ((m = rowRe.exec(sheetXml))) {
  const rowNum = Number(m[1]);
  const cellsXml = m[2];
  const cells = {};
  let cm;
  while ((cm = cellRe.exec(cellsXml))) {
    const ref = cm[1];
    const type = cm[2]; // "s" = shared string, "str" = inline, undefined = number
    const innerXml = cm[3];
    const valMatch = innerXml.match(/<v>([\s\S]*?)<\/v>/);
    if (!valMatch) continue;
    const raw = valMatch[1];
    const col = ref.match(/^[A-Z]+/)[0];
    if (type === "s") {
      cells[col] = strings[Number(raw)] ?? "";
    } else {
      cells[col] = raw;
    }
  }
  rows.push({ rowNum, cells });
}
console.error(`Parsed ${rows.length} rows`);

// Dump every row's columns A through F so we can eyeball structure
console.log("Row\tA\tB\tC\tD\tE\tF\tG");
for (const r of rows) {
  console.log(
    `${r.rowNum}\t${r.cells.A ?? ""}\t${r.cells.B ?? ""}\t${r.cells.C ?? ""}\t${r.cells.D ?? ""}\t${r.cells.E ?? ""}\t${r.cells.F ?? ""}\t${r.cells.G ?? ""}`,
  );
}

writeFileSync(
  `${tmpDir}/raw_rows.json`,
  JSON.stringify(rows, null, 2),
);
console.error(`Wrote ${tmpDir}/raw_rows.json`);
