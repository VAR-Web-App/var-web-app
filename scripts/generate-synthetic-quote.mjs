// Generates synthetic-quote.pdf — a federal IT VAR's customer-facing quote.
// Pairs with synthetic-award.pdf to demo the BOM-vs-Quote comparison; the
// two are designed together so the comparison surfaces every state:
//   - 4 lines that match perfectly
//   - 1 line with a small price drift (negotiated down by the customer)
//   - 1 line with a qty change (customer scoped up)
//   - 2 lines only in this quote (customer cut from final award)
//   - (Award has 2 lines not in this quote: install labor + service contract)
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

const lines = [
  { item: "1", part: "FAKE-SW-9300",   desc: "Catalyst Sample Switch 24-port",      qty: 4,  unit: 5300.00, ext: 21200.00 }, // price will drift in award
  { item: "2", part: "FAKE-SFP-10G",   desc: "10G SFP+ Optical Transceiver",         qty: 16, unit: 287.25,  ext: 4596.00  }, // perfect match
  { item: "3", part: "FAKE-AP-9120",   desc: "Wi-Fi 6 Access Point Indoor",          qty: 10, unit: 1245.00, ext: 12450.00 }, // qty will rise in award (10 → 12)
  { item: "4", part: "FAKE-CABLE-3M",  desc: "3m Patch Cable Cat6A Blue",            qty: 50, unit: 24.99,   ext: 1249.50  }, // perfect match
  { item: "5", part: "FAKE-PWR-AC",    desc: "AC Power Supply 1100W",                qty: 4,  unit: 895.00,  ext: 3580.00  }, // perfect match
  { item: "6", part: "FAKE-LIC-DNA",   desc: "DNA Subscription License (1yr)",       qty: 4,  unit: 2150.00, ext: 8600.00  }, // small price drift in award (2150 → 2100)
  { item: "7", part: "FAKE-RACK-RU2",  desc: "2U Rackmount Kit (rail + cable mgmt)", qty: 2,  unit: 850.00,  ext: 1700.00  }, // ONLY IN QUOTE
  { item: "8", part: "FAKE-PSU-RDND",  desc: "Redundant PSU Bracket Assembly",       qty: 4,  unit: 320.00,  ext: 1280.00  }, // ONLY IN QUOTE
];
const total = lines.reduce((s, l) => s + l.ext, 0);

// Cover page
const cover = doc.addPage([pageWidth, pageHeight]);
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
draw(cover, `$${total.toFixed(2)}`, 200, 600);

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
  { x: 50,  header: "Item" },
  { x: 85,  header: "Part #" },
  { x: 165, header: "Description" },
  { x: 365, header: "Qty" },
  { x: 400, header: "Unit Price" },
  { x: 475, header: "Extended Price" },
];
const rowHeight = 28;
let y = 720;

for (const c of cols) {
  draw(page2, c.header, c.x + 2, y - 12, { bold: true, size: 9 });
}
line(page2, 50, y - rowHeight + 2, 555, y - rowHeight + 2);
y -= rowHeight;

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

draw(page2, "TOTAL", cols[4].x + 2, y - 12, { bold: true, size: 10 });
draw(page2, total.toFixed(2), cols[5].x + 2, y - 12, { bold: true, size: 10 });

const bytes = await doc.save();
const outPath = join(outDir, "synthetic-quote.pdf");
writeFileSync(outPath, bytes);
console.log(`wrote ${outPath} (${bytes.length} bytes, total = ${total.toFixed(2)})`);
