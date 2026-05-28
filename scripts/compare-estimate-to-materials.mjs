// One-off comparison: AI-generated estimate (CSV from /quote → Export CSV)
// vs the architect's official materials list (PDF). Sends both to Claude
// with a structured prompt and dumps a markdown report.
//
// Usage:
//   node scripts/compare-estimate-to-materials.mjs <quote.csv> <materials.pdf>
//
// Env: ANTHROPIC_API_KEY (read from .env.local or shell env)
//
// What it does:
//   1. Parses the CSV. If it detects a duplicate-apply pattern (two
//      blocks of similar phase names), uses only the latter block —
//      that's the more recent and usually-bigger extraction.
//   2. Loads the materials PDF as a base64 document content block.
//   3. Sends both to Claude with a comparison prompt asking for:
//        - Matched items (with quantity sanity check)
//        - Categories the AI estimate covered
//        - Items in materials list that the AI missed (gaps)
//        - Items the AI included that aren't in the materials list
//          (extras / different approach)
//        - Overall coverage summary + recommendations
//   4. Writes a markdown report to stdout AND to
//      <csv-basename>-vs-<pdf-basename>.md next to the CSV.

import { readFile, writeFile } from "node:fs/promises";
import { resolve, basename, dirname, extname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

const [, , csvPathArg, pdfPathArg] = process.argv;
if (!csvPathArg || !pdfPathArg) {
  console.error("Usage: node scripts/compare-estimate-to-materials.mjs <quote.csv> <materials.pdf>");
  process.exit(1);
}

const csvPath = resolve(csvPathArg);
const pdfPath = resolve(pdfPathArg);

// Load .env.local for ANTHROPIC_API_KEY without pulling in a dep.
async function loadEnv() {
  if (process.env.ANTHROPIC_API_KEY) return;
  try {
    const env = await readFile(resolve(".env.local"), "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    // .env.local missing — fine if key is in shell env
  }
}
await loadEnv();
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set. Add it to .env.local or your shell env.");
  process.exit(1);
}

// Parse the CSV. Naive but enough for our export shape — assumes the
// header is "Line,Phase,Description,Qty,...". Splits on commas
// respecting quoted fields.
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const csvRaw = await readFile(csvPath, "utf8");
const allRows = csvRaw.trim().split("\n").slice(1).map(parseCsvLine);
const lineItems = allRows.map((r) => ({
  line: Number(r[0]),
  phase: r[1],
  description: r[2],
  qty: Number(r[3]),
  unit_cost: Number(r[4]),
  line_total: Number(r[7]),
}));

// Detect duplicate-apply: if the same Phase+Description appears twice,
// keep only the LATTER occurrence (more recent extraction).
const seen = new Map();
for (const item of lineItems) {
  const key = `${item.phase}::${item.description}`;
  seen.set(key, item); // overwrite — last one wins
}
const dedupedItems = [...seen.values()];

const wasDeduped = dedupedItems.length < lineItems.length;
console.error(
  `Loaded ${lineItems.length} CSV line items` +
    (wasDeduped ? ` → ${dedupedItems.length} after dedup` : "")
);

// Format the line items as a compact table for Claude.
const aiEstimateTable = [
  "| Phase | Description | Qty | Unit Cost | Line Total |",
  "|---|---|---:|---:|---:|",
  ...dedupedItems.map(
    (i) =>
      `| ${i.phase} | ${i.description} | ${i.qty.toFixed(2)} | $${i.unit_cost.toFixed(2)} | $${i.line_total.toFixed(2)} |`,
  ),
].join("\n");

const pdfBuffer = await readFile(pdfPath);
const pdfBase64 = pdfBuffer.toString("base64");

const SYSTEM_PROMPT = `You are an estimating consultant comparing an AI-generated construction estimate against the architect's official materials list for the same residential project. The builder wants to know how accurate the AI's estimate is and where the gaps are.

Be honest and specific. Do NOT pad your answer. The AI estimate is at the assembly level (foundation = X cubic yards of concrete) and the architect's list is at the line-item level (1,191 8x8x16 CMU blocks). They will NOT match 1-to-1; the right comparison is at the scope/coverage level.

Output a markdown report with these sections:

# Estimate Accuracy Report

## Quick verdict
2-3 sentences. What % of scope is covered? Where's the biggest gap? Is the AI estimate usable as a starting point, or does it need major rework?

## Categories covered
Bullet list. Categories the AI estimate has, organized by trade (foundation, framing, roofing, etc.). Note which are present in the materials list too.

## Categories missing
Bullet list. Trades/scopes in the materials list that the AI estimate doesn't cover at all. This is the gap-to-fill list.

## Approach differences (substituted materials)
Where both lists cover the same scope but with different materials. Example: "Architect specs CMU foundation wall (1,191 blocks); AI estimate uses cast-in-place concrete. Both achieve the same scope but cost/labor profiles differ." Note whether the AI's substitution is reasonable or if it suggests it didn't read the plan correctly.

## Quantity sanity check
For 5-10 categories where both lists have comparable items, give a qty comparison. Format: "Framing studs: AI = 600 LF 2x6 | Architect = 12,000 LF 2x6 — 20× delta, AI likely underestimating." Flag anything off by more than 30%.

## Items in AI estimate but NOT in materials list
What did the AI include that the architect didn't spec? These are either extras (good — captures things architect omitted) or false positives (bad — AI hallucinated scope).

## Top 5 fixes
Ordered list of concrete things to adjust on the AI estimate to make it match the build plans. Prioritized by impact on total cost.

## Honest assessment
1 paragraph. Would you let this estimate go to a homeowner as a starting point, or is it too rough? What level of human review does it need before quoting?`;

const userText = `Here is the AI-generated estimate from the app (deduped — the source CSV had a double-apply, this is the latter, larger application):

${aiEstimateTable}

And here is the architect's official materials list as a PDF (attached). Run the comparison.`;

console.error("Calling Claude…");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const response = await client.messages.create({
  model: MODEL,
  max_tokens: 8192,
  system: SYSTEM_PROMPT,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdfBase64,
          },
        },
        {
          type: "text",
          text: userText,
        },
      ],
    },
  ],
});

const textBlock = response.content.find((c) => c.type === "text");
if (!textBlock || textBlock.type !== "text") {
  console.error("No text in Claude response");
  process.exit(1);
}

const report = textBlock.text.trim();

// Print to stdout AND save next to the CSV.
console.log(report);

const outPath = resolve(
  dirname(csvPath),
  `${basename(csvPath, extname(csvPath))}-vs-${basename(pdfPath, extname(pdfPath))}.md`,
);
await writeFile(outPath, report, "utf8");
console.error(`\nSaved to ${outPath}`);
console.error(
  `Tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`,
);
