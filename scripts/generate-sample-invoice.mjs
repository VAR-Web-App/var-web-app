// Generates a realistic construction-supplier invoice PDF to feed the Track-2
// invoice parser (vendor + invoice # + date + line items + total). Output to
// Downloads so it's easy to grab and upload.
// Run: node scripts/generate-sample-invoice.mjs
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync } from "node:fs";

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const page = doc.addPage([612, 792]);
const dark = rgb(0.1, 0.12, 0.15);
const gray = rgb(0.42, 0.45, 0.5);
let y = 740;
const T = (t, x, yy, f = font, s = 10, c = dark) =>
  page.drawText(String(t), { x, y: yy, size: s, font: f, color: c });

// Header
T("Coosa Valley Building Supply", 40, y, bold, 18);
y -= 18;
T("1420 Industrial Blvd · Wetumpka, AL 36092 · (334) 567-2200", 40, y, font, 9, gray);
T("INVOICE", 470, 740, bold, 22);
T("Invoice #: INV-24815", 470, 712, font, 10);
T("Date: 06/28/2026", 470, 698, font, 10);
T("Terms: Net 30", 470, 684, font, 10);

y = 690;
T("Bill To:", 40, y, bold, 10);
y -= 14;
T("McCluskey Custom Homes LLC", 40, y);
y -= 13;
T("Project: Maddox Country House — 118 Ridge Rd, Auburn AL", 40, y, font, 9, gray);

// Table header
y -= 34;
page.drawRectangle({ x: 40, y: y - 4, width: 532, height: 20, color: rgb(0.93, 0.94, 0.96) });
T("Description", 46, y, bold, 9);
T("Qty", 360, y, bold, 9);
T("Unit", 405, y, bold, 9);
T("Amount", 505, y, bold, 9);
y -= 24;

const lines = [
  ["2x10 #2 SYP framing lumber, 16'", "148 ea", "$21.40", 3167.2],
  ['7/16" OSB wall sheathing, 4x8', "96 sht", "$18.75", 1800.0],
  ["Tyvek HomeWrap, 9' x 150' roll", "6 roll", "$168.00", 1008.0],
  ["Simpson hangers & framing hardware (lot)", "1 lot", "$742.50", 742.5],
  ['16d galvanized nails, 50 lb', "12 box", "$61.00", 732.0],
  ["Delivery — flatbed to site", "1 ea", "$185.00", 185.0],
];
let subtotal = 0;
for (const [desc, qty, unit, amt] of lines) {
  T(desc, 46, y, font, 9);
  T(qty, 360, y, font, 9);
  T(unit, 405, y, font, 9);
  T(`$${amt.toFixed(2)}`, 505, y, font, 9);
  subtotal += amt;
  y -= 18;
}
const tax = +(subtotal * 0.09).toFixed(2);
const total = +(subtotal + tax).toFixed(2);
y -= 10;
T("Subtotal", 405, y, font, 10);
T(`$${subtotal.toFixed(2)}`, 505, y, font, 10);
y -= 16;
T("Sales tax (9%)", 405, y, font, 10);
T(`$${tax.toFixed(2)}`, 505, y, font, 10);
y -= 18;
T("Total Due", 405, y, bold, 12);
T(`$${total.toFixed(2)}`, 505, y, bold, 12);

const bytes = await doc.save();
const out = "C:/Users/cmadd/Downloads/sample-vendor-invoice.pdf";
writeFileSync(out, bytes);
console.log(`wrote ${out} — vendor: Coosa Valley Building Supply, total: $${total.toFixed(2)}`);
