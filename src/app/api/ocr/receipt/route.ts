// POST /api/ocr/receipt — extract vendor / amount / date from a receipt.
//
// Body: multipart form with a single `file` field (image or single-page
// PDF ≤5MB). Uses Textract's synchronous AnalyzeDocument (FORMS) so a
// phone-camera shot returns extracted fields in a few seconds — no S3
// upload + polling like the multi-page document pipeline.
//
// Response shape:
//   { ok: true,  vendor: string | null, amount: number | null,
//                date: string | null, confidence: "high"|"medium"|"low" }
//   { ok: false, error: string }
//
// When AWS env vars aren't set the route returns 503 with a reason so
// the client can fall back to manual entry without a confusing crash.

import { NextRequest, NextResponse } from "next/server";
import {
  TextractClient,
  AnalyzeDocumentCommand,
  type Block,
} from "@aws-sdk/client-textract";

export const runtime = "nodejs";
// Receipts up to ~5MB — Textract's sync API cap.
export const maxDuration = 30;

const TOTAL_KEY_RX = /\b(grand\s*total|total\s*due|amount\s*due|balance\s*due|total)\b/i;
// Avoid matching subtotal/tax lines as the "total" — these often appear
// numerically larger than the real total in the form-pair output.
const SKIP_KEY_RX = /\b(sub\s*total|subtotal|tax|tip|change|cash|tendered)\b/i;
const VENDOR_KEY_RX = /\b(merchant|vendor|store|business)\b/i;
const DATE_KEY_RX = /\b(date|purchased|transaction)\b/i;

const MONEY_RX = /\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\b/;
const DATE_ISO_RX = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DATE_SLASH_RX = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/;

export async function POST(req: NextRequest) {
  const region = process.env.AWS_REGION;
  const akid = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !akid || !secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "OCR not configured (missing AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Missing `file` field" },
      { status: 400 },
    );
  }
  // Textract sync caps at 5MB. Reject earlier so the user gets a clean error.
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "Receipt too large — keep under 5MB for OCR." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const client = new TextractClient({
    region,
    credentials: { accessKeyId: akid, secretAccessKey: secret },
  });

  let blocks: Block[];
  try {
    const res = await client.send(
      new AnalyzeDocumentCommand({
        Document: { Bytes: bytes },
        FeatureTypes: ["FORMS"],
      }),
    );
    blocks = res.Blocks ?? [];
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Textract failed",
      },
      { status: 502 },
    );
  }

  const extracted = extractReceiptFields(blocks);
  return NextResponse.json({ ok: true, ...extracted });
}

interface Extracted {
  vendor: string | null;
  amount: number | null;
  date: string | null;
  confidence: "high" | "medium" | "low";
}

function extractReceiptFields(blocks: Block[]): Extracted {
  const byId = new Map<string, Block>();
  for (const b of blocks) if (b.Id) byId.set(b.Id, b);

  // Resolve text content for a block by concatenating its CHILD WORD/LINE
  // descendants. Textract's structure: WORD blocks are leaves; LINE and
  // KEY_VALUE_SET blocks link to their words via Relationships[type=CHILD].
  function blockText(block: Block): string {
    if (block.Text) return block.Text;
    const rel = (block.Relationships ?? []).find((r) => r.Type === "CHILD");
    if (!rel?.Ids) return "";
    return rel.Ids.map((id) => byId.get(id)?.Text ?? "")
      .filter(Boolean)
      .join(" ");
  }

  // Find KEY_VALUE_SET pairs.
  const pairs: Array<{ key: string; value: string; conf: number }> = [];
  for (const b of blocks) {
    if (b.BlockType !== "KEY_VALUE_SET") continue;
    if (!b.EntityTypes?.includes("KEY")) continue;
    const valueRel = (b.Relationships ?? []).find((r) => r.Type === "VALUE");
    const valueBlock = valueRel?.Ids?.[0] ? byId.get(valueRel.Ids[0]) : null;
    pairs.push({
      key: blockText(b).trim(),
      value: valueBlock ? blockText(valueBlock).trim() : "",
      conf: (b.Confidence ?? 0) + (valueBlock?.Confidence ?? 0),
    });
  }

  // Vendor: prefer a labeled "Merchant"/"Store"/"Vendor" form pair, else
  // fall back to the first non-trivial LINE block (top of receipt).
  let vendor: string | null = null;
  const vendorPair = pairs.find(
    (p) => VENDOR_KEY_RX.test(p.key) && p.value.length > 1,
  );
  if (vendorPair) {
    vendor = vendorPair.value;
  } else {
    const lines = blocks
      .filter((b) => b.BlockType === "LINE")
      .map((b) => (b.Text ?? "").trim())
      .filter((t) => t.length >= 3 && t.length <= 60);
    vendor = lines[0] ?? null;
  }

  // Amount: find the largest dollar value attached to a "total"-looking
  // key. If no form keys matched, scan all LINE blocks for $X.YY patterns
  // and pick the largest — receipts usually put the total in big print.
  let amount: number | null = null;
  let amountSource: "key" | "scan" | null = null;
  const totalCandidates = pairs
    .filter(
      (p) =>
        TOTAL_KEY_RX.test(p.key) && !SKIP_KEY_RX.test(p.key) && p.value.length > 0,
    )
    .map((p) => parseMoney(p.value))
    .filter((n): n is number => n != null);
  if (totalCandidates.length > 0) {
    amount = Math.max(...totalCandidates);
    amountSource = "key";
  } else {
    const allMoney: number[] = [];
    for (const b of blocks) {
      if (b.BlockType !== "LINE" || !b.Text) continue;
      const m = b.Text.match(MONEY_RX);
      const v = m ? parseMoney(m[0]) : null;
      if (v != null) allMoney.push(v);
    }
    if (allMoney.length > 0) {
      amount = Math.max(...allMoney);
      amountSource = "scan";
    }
  }

  // Date: prefer a "Date" form pair, fall back to scanning all LINE text.
  let date: string | null = null;
  let dateSource: "key" | "scan" | null = null;
  const datePair = pairs.find((p) => DATE_KEY_RX.test(p.key) && p.value.length > 0);
  if (datePair) {
    date = parseDate(datePair.value);
    if (date) dateSource = "key";
  }
  if (!date) {
    for (const b of blocks) {
      if (b.BlockType !== "LINE" || !b.Text) continue;
      const guess = parseDate(b.Text);
      if (guess) {
        date = guess;
        dateSource = "scan";
        break;
      }
    }
  }

  const matched = [amountSource, dateSource].filter((s) => s === "key").length;
  const found = [amount, date, vendor].filter((v) => v != null).length;
  const confidence: Extracted["confidence"] =
    matched >= 2 ? "high" : found >= 2 ? "medium" : "low";

  return { vendor, amount, date, confidence };
}

function parseMoney(text: string): number | null {
  const m = text.match(MONEY_RX);
  if (!m) return null;
  const whole = m[1].replace(/,/g, "");
  const cents = m[2];
  const n = parseFloat(`${whole}.${cents}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDate(text: string): string | null {
  const iso = text.match(DATE_ISO_RX);
  if (iso) {
    const [, y, m, d] = iso;
    return clampDate(+y, +m, +d);
  }
  const slash = text.match(DATE_SLASH_RX);
  if (slash) {
    let [, a, b, c] = slash;
    // Heuristic: 4-digit year always at the end; 2-digit interpret as 20XX.
    const year = c.length === 4 ? +c : 2000 + +c;
    // Default to US-style MM/DD/YYYY; swap to DD/MM if first part > 12.
    const first = +a;
    const second = +b;
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    return clampDate(year, month, day);
  }
  return null;
}

function clampDate(y: number, m: number, d: number): string | null {
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 2000 || y > 2100) return null;
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}
