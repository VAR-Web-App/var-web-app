// POST /api/plan-extract — accepts a residential plan PDF (floor plan,
// full build-plan set, or marketed design plan), runs it through
// Claude's document-vision API, and returns a structured JSON extraction
// the UI can present for verification before applying to an estimate.
//
// One-shot (not streamed): Claude returns the entire extraction in a
// single response, typically 5–15 seconds for a residential plan.
//
// The response shape is intentionally tied to what builders need for
// schematic estimating, NOT for precise takeoff (Togal/CubiCasa territory).
// The verification UI lets the user fix anything Claude got wrong before
// it touches the estimate.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Vision calls on multi-page PDFs can take 15–30s. Vercel's default 10s
// timeout would kill this. 60s ceiling is plenty for residential plans.
export const maxDuration = 60;
export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are an architectural plan analyzer helping a custom home builder produce a schematic estimate.

You will receive a residential plan PDF — could be a floor plan, a full build-plan set (cover + floor plans + elevations + sections + framing + electrical), or a marketed design plan. Extract the following as structured JSON. Be honest about confidence — the builder verifies your output before quoting, so erring toward "ask for confirmation" is fine. NEVER fabricate numbers.

Output JSON ONLY (no prose, no markdown fences). Schema:

{
  "plan_name": string | null,                    // e.g. "Plan 46380L" or descriptive name
  "total_sqft": number | null,                   // Total heated/conditioned sqft
  "first_floor_sqft": number | null,
  "second_floor_sqft": number | null,
  "bonus_sqft": number | null,                   // Unfinished bonus, attic, etc.
  "porch_sqft": number | null,                   // Total covered porch / patio area
  "garage_sqft": number | null,
  "garage_cars": number | null,
  "bedrooms": number | null,
  "full_baths": number | null,
  "half_baths": number | null,
  "footprint_dimensions": string | null,         // e.g. "72'-9\" × 82'-7\""
  "max_ridge_height": string | null,             // e.g. "34'-0\""
  "stories": number | null,
  "foundation_type": string | null,              // "crawl", "slab", "basement", etc.
  "exterior_wall_type": string | null,           // e.g. "2x6"
  "ceiling_heights": string | null,              // e.g. "First 10', Second 9'"
  "rooms": Array<{
    "name": string,
    "dimensions": string | null,                 // e.g. "12'-0\" × 14'-2\""
    "sqft": number | null,
    "level": "main" | "second" | "basement" | "bonus" | null
  }>,
  "doors_windows": {
    "exterior_doors_estimated": number | null,
    "windows_estimated": number | null
  },
  "notable_features": string[],                  // load-bearing walls, vaulted ceilings, etc.
  "ambiguity_notes": string[],                   // anything you couldn't read or are uncertain about
  "confidence": "high" | "medium" | "low"
}

Rules:
- Numbers must be numbers (or null), never strings.
- If the plan has a printed sqft summary (typical for marketed plans), prefer those numbers over your own measurements.
- If you cannot read a value with confidence, return null and add a note in ambiguity_notes.
- Do not estimate dimensions beyond what's printed/labeled. Custom architect drawings often have only a few labeled dimensions; surface that limitation in ambiguity_notes.
- If multiple floors exist, list rooms across all floors with the appropriate "level" field.
- Confidence: "high" only if all major values came directly from printed labels. "low" if you had to estimate most values from drawing geometry.`;

interface ExtractionResult {
  plan_name: string | null;
  total_sqft: number | null;
  first_floor_sqft: number | null;
  second_floor_sqft: number | null;
  bonus_sqft: number | null;
  porch_sqft: number | null;
  garage_sqft: number | null;
  garage_cars: number | null;
  bedrooms: number | null;
  full_baths: number | null;
  half_baths: number | null;
  footprint_dimensions: string | null;
  max_ridge_height: string | null;
  stories: number | null;
  foundation_type: string | null;
  exterior_wall_type: string | null;
  ceiling_heights: string | null;
  rooms: Array<{
    name: string;
    dimensions: string | null;
    sqft: number | null;
    level: "main" | "second" | "basement" | "bonus" | null;
  }>;
  doors_windows: {
    exterior_doors_estimated: number | null;
    windows_estimated: number | null;
  };
  notable_features: string[];
  ambiguity_notes: string[];
  confidence: "high" | "medium" | "low";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured on the server" },
      { status: 500 }
    );
  }

  // The client uploads the PDF directly to Vercel Blob first (see
  // /api/upload), then calls this route with just the resulting URL.
  // Keeping the request body tiny dodges Vercel's 4.5MB function-body
  // ceiling — important because plan-set PDFs routinely run 5-30MB.
  const body = (await req.json().catch(() => null)) as
    | { blob_url?: string; filename?: string }
    | null;
  if (!body || typeof body.blob_url !== "string") {
    return NextResponse.json(
      { error: "Expected JSON body with { blob_url: string }" },
      { status: 400 }
    );
  }

  // Fetch the file from Blob storage. We trust the URL because it
  // came from our own /api/upload handshake; there's no XSS path
  // where a third party could plant a malicious URL here (the route
  // is auth-gated by Vercel's blob token issuance).
  let buffer: Buffer;
  try {
    const blobRes = await fetch(body.blob_url);
    if (!blobRes.ok) {
      return NextResponse.json(
        { error: `Could not fetch uploaded PDF (${blobRes.status})` },
        { status: 502 }
      );
    }
    buffer = Buffer.from(await blobRes.arrayBuffer());
  } catch (e) {
    return NextResponse.json(
      {
        error: "Failed to download uploaded PDF",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    );
  }
  if (buffer.length === 0) {
    return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
  }
  if (buffer.length > 32 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File exceeds 32MB limit (Claude PDF input cap)" },
      { status: 413 }
    );
  }

  // PDFs supported directly via Claude's document content blocks.
  const base64 = buffer.toString("base64");

  const client = new Anthropic({ apiKey });

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
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
                data: base64,
              },
            },
            {
              type: "text",
              text: "Extract the structured JSON for this plan. JSON only, no markdown.",
            },
          ],
        },
      ],
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Claude API error",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    );
  }

  // Claude returns a content array; we expect a single text block with JSON.
  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json(
      { error: "No text content in Claude response" },
      { status: 502 }
    );
  }

  // Strip any accidental markdown fences in case Claude ignored the rule.
  let raw = textBlock.text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  let extraction: ExtractionResult;
  try {
    extraction = JSON.parse(raw);
  } catch (e) {
    return NextResponse.json(
      {
        error: "Could not parse Claude response as JSON",
        detail: e instanceof Error ? e.message : String(e),
        raw_response: raw.slice(0, 500),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    extraction,
    model: MODEL,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });
}
