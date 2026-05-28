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
import { del as deleteBlob } from "@vercel/blob";

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
  "footprint_dimensions": string | null,         // overall building envelope L×W including porches/garage/overhangs (see FOOTPRINT RULES)
  "conditioned_footprint_dimensions": string | null,  // heated/cooled first-floor footprint ONLY, excludes porch+garage (see FOOTPRINT RULES)
  "roof_area_sqft": number | null,               // total roof finish area in SF if directly labeled; null if not printed
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
    "exterior_doors_estimated": number | null,   // SEE COUNTING RULES BELOW
    "interior_doors_estimated": number | null,   // SEE COUNTING RULES BELOW
    "pocket_doors_estimated": number | null,     // count of pocket / sliding-into-wall doors, included in interior count above
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
- Confidence: "high" only if all major values came directly from printed labels. "low" if you had to estimate most values from drawing geometry.

COUNTING RULES — doors_windows (this is where extractors most often go wrong, please be careful):

exterior_doors_estimated counts ONLY doors that lead from inside the home to the outside world. This is typically 3–8 for a residential home. Specifically include:
- Front entry door
- Back / rear entry door
- Side entry door
- Garage-to-exterior service door (NOT the overhead garage door — that's a separate "garage_cars" field)
- Patio / deck / porch doors (including French doors and sliding glass doors that lead outside)
- Mud room / utility room exterior door

DO NOT include in exterior_doors_estimated:
- Interior doors (bedroom, bathroom, closet, pantry, mechanical room) — these belong in a separate interior count, not here
- Pocket doors, barn doors, or any other interior partition doors
- The vehicle-bay garage door itself (counted via garage_cars)
- Door schedule labels on framing or structural details — those are descriptive labels, not doors to count
- Door openings or rough-opening callouts (these refer to wall openings, not finished doors)

If you find yourself returning a number larger than 10 for exterior_doors_estimated, you almost certainly miscounted — re-check by listing each exterior door's location before counting. A 5,000 SF custom home rarely has more than 6–8 exterior doors. If you can't tell from the plan, return null and note it in ambiguity_notes.

interior_doors_estimated counts every door INSIDE the home — finished doors AND pocket / sliding-into-wall doors. Custom homes typically run 25-50 interior doors; a tiny ranch might be 12-15. Include each of:
- Bedroom door (one per bedroom)
- Bathroom door (one per full + half bath)
- Walk-in closet door (one per closet)
- Reach-in closet door (count bifold and bypass closet doors as ONE per opening, not per panel)
- Pantry door
- Mechanical / utility / laundry room door
- Office, den, mud room, sitting room, library, bonus room doors
- Pocket doors (count them here AND in pocket_doors_estimated; pocket count is a subset of interior count, not separate)
- Barn doors / sliding doors used inside the home
- Cased openings WITHOUT a door (NOT a door — exclude from this count)

DO NOT include in interior_doors_estimated:
- Exterior doors (already counted in exterior_doors_estimated)
- Garage overhead doors (counted via garage_cars)
- Cased openings with no door installed (these are openings, not doors)
- Cabinet doors, vanity doors, appliance doors

If the plan has a door schedule, READ IT — schedules are the most reliable count. If you find yourself returning fewer than 12 doors on a custom plan with 3+ bedrooms, double-check; you've probably missed closet, bath, and utility doors. If you can't read a count from the plan, estimate from rooms: bedrooms + bedrooms (closet) + full_baths + half_baths + 5 baseline (pantry, laundry, mech, mud room, bonus). Note your method in ambiguity_notes.

pocket_doors_estimated counts ONLY pocket / sliding-into-wall doors. Subset of interior_doors_estimated. Pocket doors are common in custom homes (8-15 each) — usually pantry, master bath, walk-in closet, ensuite entry. If the door schedule annotates them ("P" or "POCKET"), count those. If no schedule callout is visible, return null and note in ambiguity_notes rather than estimating.

windows_estimated counts individual window units (including each window in a "ganged" pair if they're separate sashes). Typical residential homes have 15–40 windows; if you see significantly more, double-check that you're counting units and not panes within mullioned windows.

FOOTPRINT RULES — getting these two fields right matters a lot, because downstream math splits framing scope (which uses conditioned area) from roof/siding scope (which uses overall envelope).

footprint_dimensions = the OVERALL building envelope. Length × Width measured to the outermost edges of the structure as it sits on the lot. INCLUDES attached porches, attached garage, and any covered outdoor area under the main roof. This is the dimension a surveyor would write on a site plan; it's typically larger than the conditioned area. Read from the OVERALL BUILDING DIMENSIONS callout on the foundation plan or first-floor plan, NOT from the conditioned-space label.

conditioned_footprint_dimensions = the FIRST-FLOOR HEATED/COOLED area only. Length × Width of just the main house envelope, EXCLUDING porches, decks, attached garage, and any unconditioned outdoor space. If the plan labels the conditioned area's dimensions separately, use those. If not, you can derive: take the first_floor_sqft value (assuming you read it) and present it as the largest rectangle that fits that area — but PREFER any printed dimensions from the plan over derivations.

When both are equal: the building has no attached porch or garage; both fields can carry the same value.
When you only have one: prefer to return BOTH (with the same value) rather than null, unless the difference is meaningful and you genuinely can't read the other.

roof_area_sqft = total roof finish area (shingle/metal panel coverage area) ONLY when the plan explicitly labels it. Many plan sets print this on the roof plan or in a roof finish schedule (e.g. "TOTAL ROOF AREA: 4,250 SF"). Do NOT calculate or estimate this from footprint × pitch — return null and let downstream do that. The point of this field is to capture a labeled value if one exists, so we use the architect's number rather than our calculated estimate.`;

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
  conditioned_footprint_dimensions: string | null;
  roof_area_sqft: number | null;
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
    interior_doors_estimated: number | null;
    pocket_doors_estimated: number | null;
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

  // Fetch the file from Blob storage. We use public blobs because
  // Vercel's client-side private-upload flow has token quirks we'd
  // need to chase further (the PUT to vercel.com/api/blob 400s when
  // the token doesn't carry an access field). Public is acceptable
  // here because the store-id'd URL is unguessable and we del() the
  // blob immediately after extraction completes.
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

  // Clean up the uploaded PDF — extraction is persisted on the deal,
  // the blob has no further use. Fire-and-forget; a delete failure
  // shouldn't break the user-visible response (the blob's lifecycle
  // policy will eventually catch it anyway).
  deleteBlob(body.blob_url).catch((e) => {
    console.warn("[plan-extract] post-extraction blob cleanup failed", e);
  });

  return NextResponse.json({
    ok: true,
    extraction,
    model: MODEL,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });
}
