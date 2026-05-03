// Generates a synthetic federal-award-style PDF for parser development.
// Everything is fake — fake company, fake parts, fake addresses, fake
// contracting officer. Produces samples/synthetic-award.pdf.
//
// Run: node scripts/generate-synthetic-award.mjs

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

// Cover page — metadata only, no BOM. The LLM picks fields out of this.
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

draw(cover, "AWARD/CONTRACT", 220, 740, { size: 16, bold: true });
draw(cover, "Department of Sample Administration", 180, 720, { size: 11 });

draw(cover, "Contract No.", 50, 680, { bold: true });
draw(cover, "DSA-26-P-0042", 200, 680);
draw(cover, "Solicitation No.", 50, 660, { bold: true });
draw(cover, "DSA-26-Q-0019", 200, 660);
draw(cover, "Award Date", 50, 640, { bold: true });
draw(cover, "2026-04-21", 200, 640);
draw(cover, "Period of Performance", 50, 620, { bold: true });
draw(cover, "2026-05-01 through 2027-04-30", 200, 620);
draw(cover, "Total Award Amount", 50, 600, { bold: true });
draw(cover, "$54,759.45", 200, 600);

draw(cover, "Place of Delivery / Performance:", 50, 560, { bold: true });
draw(cover, "Acme Federal Solutions, attn: Receiving Dock B", 50, 545);
draw(cover, "1500 Sample Plaza Drive, Suite 200", 50, 530);
draw(cover, "Springfield, VA 22150", 50, 515);

draw(cover, "Receiving Point of Contact:", 50, 480, { bold: true });
draw(cover, "Jordan Sample, IT Operations Manager", 50, 465);
draw(cover, "jsample@dsa.gov", 50, 450);
draw(cover, "(703) 555-0142", 50, 435);

draw(cover, "Contracting Officer:", 50, 400, { bold: true });
draw(cover, "Robin Example", 50, 385);
draw(cover, "rexample@dsa.gov", 50, 370);

// Page 2 — the BOM table. Header row + 4 data rows + total.
const page2 = doc.addPage([pageWidth, pageHeight]);
draw(page2, "SECTION B — SCHEDULE OF SUPPLIES/SERVICES", 50, 750, { size: 12, bold: true });

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

// Header row
for (const c of cols) {
  draw(page2, c.header, c.x + 2, y - 12, { bold: true, size: 9 });
}
line(page2, 50, y - rowHeight + 2, 555, y - rowHeight + 2);
y -= rowHeight;

const lines = [
  { item: "1", part: "FAKE-SW-9300", desc: "Catalyst Sample Switch 24-port",       qty: 4,  unit: 5234.50, ext: 20938.00 },
  { item: "2", part: "FAKE-SFP-10G",  desc: "10G SFP+ Optical Transceiver",         qty: 16, unit: 287.25,  ext: 4596.00  },
  { item: "3", part: "FAKE-AP-9120",  desc: "Wi-Fi 6 Access Point Indoor",          qty: 12, unit: 1245.00, ext: 14940.00 },
  { item: "4", part: "FAKE-CON-3YR",  desc: "Smartcare Service 3yr (per device)",  qty: 32, unit: 446.42,  ext: 14285.45 },
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

// Total row
const total = lines.reduce((s, l) => s + l.ext, 0);
draw(page2, "TOTAL", cols[4].x + 2, y - 12, { bold: true, size: 10 });
draw(page2, total.toFixed(2), cols[5].x + 2, y - 12, { bold: true, size: 10 });

const bytes = await doc.save();
const outPath = join(outDir, "synthetic-award.pdf");
writeFileSync(outPath, bytes);
console.log(`wrote ${outPath} (${bytes.length} bytes, total = ${total.toFixed(2)})`);
