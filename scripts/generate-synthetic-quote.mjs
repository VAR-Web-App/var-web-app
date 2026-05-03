// Generates a synthetic "original quote" PDF that pairs with synthetic-award.pdf
// to demo the BOM-vs-Quote comparison. Designed to surface every comparison
// state in a single demo:
//   - Item 1: PRICE mismatch (quote $5300, award $5234.50)
//   - Item 2: perfect match
//   - Item 3: QTY mismatch (quote 10, award 12)
//   - Item 4: only in quote (customer dropped it from the award)
//   - (Award also has Smartcare 3yr, which isn't in this quote → added in award)
//
// Run: node scripts/generate-synthetic-quote.mjs

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "samples");
mkdirSync(outDir, { recursive: true });

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

const pageWidth = 612;
const pageHeight = 792;
const black = rgb(0, 0, 0);

const cover = doc.addPage([pageWidth, pageHeight]);
const draw = (page, text, x, y, opts = {}) => {
  page.drawText(text, {
    x, y,
    size: opts.size ?? 10,
    font: opts.bold ? fontBold : font,
    color: black,
  });
};
const line = (page, x1, y1, x2, y2) => {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: black });
};

draw(cover, "QUOTE", 270, 740, { size: 18, bold: true });
draw(cover, "Acme Federal Solutions", 220, 720, { size: 11 });

draw(cover, "Quote #", 50, 680, { bold: true });
draw(cover, "QT-2026-0419", 200, 680);
draw(cover, "Quote Date", 50, 660, { bold: true });
draw(cover, "2026-04-12", 200, 660);
draw(cover, "Solicitation No.", 50, 640, { bold: true });
draw(cover, "DSA-26-Q-0019", 200, 640);
draw(cover, "Valid Through", 50, 620, { bold: true });
draw(cover, "2026-05-12", 200, 620);
draw(cover, "Quote Total", 50, 600, { bold: true });
draw(cover, "$39,946.00", 200, 600);

draw(cover, "Customer:", 50, 560, { bold: true });
draw(cover, "Department of Sample Administration", 50, 545);
draw(cover, "Attn: Procurement Office", 50, 530);

draw(cover, "Prepared By:", 50, 490, { bold: true });
draw(cover, "Sales Engineering", 50, 475);
draw(cover, "Acme Federal Solutions", 50, 460);

// Page 2 — line items
const page2 = doc.addPage([pageWidth, pageHeight]);
draw(page2, "QUOTE LINE ITEMS", 50, 750, { size: 12, bold: true });

const cols = [
  { x: 50,  w: 35,  header: "Item" },
  { x: 85,  w: 80,  header: "Part #" },
  { x: 165, w: 200, header: "Description" },
  { x: 365, w: 35,  header: "Qty" },
  { x: 400, w: 75,  header: "Unit Price" },
  { x: 475, w: 80,  header: "Extended Price" },
];
const rowHeight = 28;
let y = 720;

for (const c of cols) {
  draw(page2, c.header, c.x + 2, y - 12, { bold: true, size: 9 });
}
line(page2, 50, y - rowHeight + 2, 555, y - rowHeight + 2);
y -= rowHeight;

// Lines designed to surface each comparison state:
//   1: PRICE mismatch with award
//   2: perfect match
//   3: QTY mismatch with award (quote=10, award=12)
//   4: only in this quote (customer cut from award)
const lines = [
  { item: "1", part: "FAKE-SW-9300",  desc: "Catalyst Sample Switch 24-port",      qty: 4,  unit: 5300.00, ext: 21200.00 },
  { item: "2", part: "FAKE-SFP-10G",  desc: "10G SFP+ Optical Transceiver",         qty: 16, unit: 287.25,  ext: 4596.00  },
  { item: "3", part: "FAKE-AP-9120",  desc: "Wi-Fi 6 Access Point Indoor",          qty: 10, unit: 1245.00, ext: 12450.00 },
  { item: "4", part: "FAKE-RACK-RU2", desc: "2U Rackmount Kit (rail + cable mgmt)", qty: 2,  unit: 850.00,  ext: 1700.00  },
];

for (const l of lines) {
  draw(page2, l.item, cols[0].x + 2, y - 12, { size: 9 });
  draw(page2, l.part, cols[1].x + 2, y - 12, { size: 9 });
  draw(page2, l.desc, cols[2].x + 2, y - 12, { size: 9 });
  draw(page2, String(l.qty), cols[3].x + 2, y - 12, { size: 9 });
  draw(page2, l.unit.toFixed(2), cols[4].x + 2, y - 12, { size: 9 });
  draw(page2, l.ext.toFixed(2), cols[5].x + 2, y - 12, { size: 9 });
  line(page2, 50, y - rowHeight + 2, 555, y - rowHeight + 2);
  y -= rowHeight;
}

const total = lines.reduce((s, l) => s + l.ext, 0);
draw(page2, "TOTAL", cols[4].x + 2, y - 12, { bold: true, size: 10 });
draw(page2, total.toFixed(2), cols[5].x + 2, y - 12, { bold: true, size: 10 });

const bytes = await doc.save();
const outPath = join(outDir, "synthetic-quote.pdf");
writeFileSync(outPath, bytes);
console.log(`wrote ${outPath} (${bytes.length} bytes, total = ${total.toFixed(2)})`);
