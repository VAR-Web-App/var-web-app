// POST /api/invoice/parse — extract structured invoice data from:
//   - Forwarded email body (text/plain or text/html in `body` field)
//   - Uploaded invoice image or PDF (multipart `file` field)
//
// Uses Textract for OCR on images/PDFs, then Claude to extract structured
// fields + line items. For plain-text email bodies, skips Textract and
// goes straight to Claude.
//
// Response shape:
//   { ok: true, invoice: ParsedInvoice }
//   { ok: false, error: string }

import { NextRequest, NextResponse } from "next/server";
import {
  TextractClient,
  AnalyzeDocumentCommand,
  type Block,
} from "@aws-sdk/client-textract";
import { extractMetadataWithLlm } from "@/lib/parsers/llm-metadata";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface ParsedInvoiceLineItem {
  description: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  extended: number;
}

export interface ParsedInvoice {
  vendor_name: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  po_number?: string;
  subtotal?: number;
  tax?: number;
  total: number;
  line_items: ParsedInvoiceLineItem[];
  confidence: "high" | "medium" | "low";
}

const INVOICE_FIELDS_PROMPT = `Extract these fields from the invoice:

- vendor_name (string, required): The company/person who issued the invoice
- invoice_number (string): The invoice number or reference
- invoice_date (string, YYYY-MM-DD): Date the invoice was issued
- due_date (string, YYYY-MM-DD): Payment due date
- po_number (string): Purchase order number if present
- subtotal (number): Subtotal before tax
- tax (number): Tax amount
- total (number, required): Grand total / amount due
- line_items (array): Each line item with:
  - description (string, required): What was purchased or billed
  - quantity (number): Quantity
  - unit (string): Unit of measure (EA, LF, SF, HR, etc.)
  - unit_price (number): Price per unit
  - extended (number, required): Line total (qty × unit price, or just the line amount)

If there are no distinct line items, create a single line item with the total.
Return the total as a plain number (no $ sign, no commas).
If the invoice mentions a project name, job name, or address, include it in the first line item's description.`;

const INVOICE_SYSTEM_PROMPT = `You extract structured data from construction invoices and sub-contractor bills.
You return ONLY a JSON object matching the requested schema. No prose, no markdown, no explanation.
If a field is not present in the document, omit it from the JSON.
Dates must be in ISO format (YYYY-MM-DD).
Dollar amounts must be plain numbers without currency symbols or commas.
For line items, always include at least a description and extended amount.
Construction invoices often reference trades (plumbing, electrical, framing, concrete, etc.) — preserve these in descriptions.`;

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  let documentText: string;
  let source: "email" | "upload" = "upload";

  if (contentType.includes("multipart/form-data")) {
    // File upload path — OCR first, then LLM
    const form = await req.formData();

    // Check if it's a text body (forwarded email) instead of a file
    const body = form.get("body");
    if (typeof body === "string" && body.trim().length > 0) {
      documentText = body.trim();
      source = "email";
    } else {
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: "Missing `file` or `body` field" },
          { status: 400 },
        );
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { ok: false, error: "File too large — keep under 5MB." },
          { status: 413 },
        );
      }

      // OCR via Textract
      const region = process.env.AWS_REGION;
      const akid = process.env.AWS_ACCESS_KEY_ID;
      const secret = process.env.AWS_SECRET_ACCESS_KEY;
      if (!region || !akid || !secret) {
        return NextResponse.json(
          { ok: false, error: "OCR not configured (missing AWS credentials)." },
          { status: 503 },
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
            FeatureTypes: ["FORMS", "TABLES"],
          }),
        );
        blocks = res.Blocks ?? [];
      } catch (e) {
        return NextResponse.json(
          { ok: false, error: e instanceof Error ? e.message : "Textract failed" },
          { status: 502 },
        );
      }

      // Reconstruct text from LINE blocks
      documentText = blocks
        .filter((b) => b.BlockType === "LINE" && b.Text)
        .map((b) => b.Text!)
        .join("\n");

      if (!documentText.trim()) {
        return NextResponse.json(
          { ok: false, error: "Could not extract text from document." },
          { status: 422 },
        );
      }
    }
  } else if (contentType.includes("application/json")) {
    // JSON body with email text
    const json = await req.json();
    if (!json.body || typeof json.body !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing `body` field in JSON" },
        { status: 400 },
      );
    }
    documentText = json.body.trim();
    source = "email";
  } else {
    return NextResponse.json(
      { ok: false, error: "Expected multipart form data or JSON" },
      { status: 400 },
    );
  }

  // Strip HTML tags if present (forwarded emails are often HTML)
  if (documentText.includes("<") && documentText.includes(">")) {
    documentText = documentText
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#?\w+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Truncate to ~15k chars to stay within token budget
  if (documentText.length > 15000) {
    documentText = documentText.substring(0, 15000) + "\n[TRUNCATED]";
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Invoice parser not configured (missing ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  try {
    const parsed = await extractMetadataWithLlm<ParsedInvoice>({
      documentText,
      fieldsPrompt: INVOICE_FIELDS_PROMPT,
      systemPrompt: INVOICE_SYSTEM_PROMPT,
      maxTokens: 4000,
    });

    // Compute confidence
    const hasVendor = !!parsed.vendor_name;
    const hasTotal = typeof parsed.total === "number" && parsed.total > 0;
    const hasLineItems = Array.isArray(parsed.line_items) && parsed.line_items.length > 0;
    const hasInvoiceNum = !!parsed.invoice_number;
    const hasDate = !!parsed.invoice_date;
    const fieldCount = [hasVendor, hasTotal, hasLineItems, hasInvoiceNum, hasDate].filter(Boolean).length;

    const confidence: ParsedInvoice["confidence"] =
      fieldCount >= 4 ? "high" : fieldCount >= 2 ? "medium" : "low";

    return NextResponse.json({
      ok: true,
      source,
      invoice: {
        ...parsed,
        total: parsed.total || 0,
        line_items: parsed.line_items || [],
        confidence,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Parse failed" },
      { status: 502 },
    );
  }
}
