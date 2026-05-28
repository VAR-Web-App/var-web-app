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

// Vision calls on multi-page PDFs can take 15–30s on simple floor
// plans and 60–180s on full custom build sets with the expanded
// rules in this system prompt (~21KB of counting rules + schema).
// Vercel Pro allows up to 300s; we use 240s to leave headroom for
// the post-processing + blob cleanup that runs after the Claude call.
export const maxDuration = 240;
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
  "garage_doors_estimated": number | null,         // count of OVERHEAD garage doors — see GARAGE RULES below
  "stone_veneer_sqft": number | null,              // architect-labeled stone veneer accent area; null if unlabeled
  "floor_joist_count_estimated": number | null,    // architect-listed floor joist count if a schedule exists; null otherwise
  "bedrooms": number | null,
  "full_baths": number | null,
  "half_baths": number | null,
  "footprint_dimensions": string | null,         // overall building envelope L×W including porches/garage/overhangs (see FOOTPRINT RULES)
  "conditioned_footprint_dimensions": string | null,  // heated/cooled first-floor footprint ONLY, excludes porch+garage (see FOOTPRINT RULES)
  "roof_area_sqft": number | null,               // total roof finish area in SF if directly labeled; null if not printed
  "roof_type": "gable" | "hip" | "gable+hip" | "complex" | null,  // see ROOF RULES
  "roof_pitch_in_12": number | null,             // primary pitch rise (e.g. 8 for "8/12"); null if multiple major pitches or unreadable
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

WRITING ambiguity_notes — these strings render to a custom home builder in a verification checklist, NOT to a developer. Write them in plain English a builder would say out loud on a job site.

DO:
- Speak in normal builder language: "Couldn't tell the porch dimensions" / "Confirm the master bath layout — the wall callout was hard to read"
- Reference real-world things by name: rooms, dimensions, schedules, materials
- Tell the builder what to look at on the plan to verify

DON'T include any of the following in ambiguity_notes (or in any other string field):
- JSON field names like garage_cars, first_floor_sqft, roof_pitch_in_12, conditioned_footprint_dimensions, etc. Refer to those concepts in builder English ("the first floor area", "the roof pitch", "the conditioned-area dimensions").
- Code or schema references (camelCase, snake_case, type names, brackets, backticks).
- Programmer phrasing like "field is null", "estimated from geometry", "returned null". Builders don't think this way.
- File paths, URLs, or any debugging context.

Bad: "garage_cars set to 2, but garage_sqft was null in the extraction"
Good: "Garage shown as 2-car but the square footage isn't labeled on the plan — confirm it's at least 400 SF"

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

windows_estimated counts individual window units. Typical residential homes have 15-50 windows; custom 5,000+ SF plans can exceed 60. Count rules:

- COUNT EACH unit in a "ganged" group as a separate window. Architect schedules use shorthand like "(2) 2'-8" × 5'-0"" or "[3] 36×72 CASEMENT" — the parenthetical number is the quantity to use; that callout represents 2 or 3 separate window units that you should add to the total. DO NOT count it as 1 window.
- COUNT separate sashes within a bay or bow window assembly (typical bay = 3 sashes; count as 3).
- DO NOT count individual panes within a single mullioned sash (a single window with 6 grilles is 1 window, not 6).
- DO NOT count transom or sidelite glass at exterior doors as windows — those are part of the door unit.
- DO read the window schedule (every plan set has one) — the total at the bottom or right side of the schedule is your most reliable number. If totals are printed there, prefer them over your own count.
- If you find yourself returning fewer than 15 on a 3+ bedroom custom plan, double-check the schedule for grouped callouts you may have read as 1.

GARAGE RULES — separate "how many cars fit" from "how many doors there are" from "how big is it."

garage_cars is a bay-capacity number (1, 2, 3, 4). Read it from the architect's label ("2-CAR GARAGE", "3-CAR GARAGE") on the floor plan or the elevation drawing.

garage_sqft is the floor area of the garage in square feet. Read it from the architect's printed area summary when available (typical residential plan sets list garage SF in a sqft schedule on the cover sheet). When no schedule is printed:
- Measure the labeled garage dimensions from the floor plan (e.g. "24' × 22'" = 528 SF)
- DO NOT estimate from car count alone — architects often size garages much larger than the minimum (a "2-car" garage can run 400-700 SF; a "3-car" garage can run 700-1,400 SF depending on shop space, workbench, storage alcove)
- Typical ranges to sanity-check against:
  - 1-car: 200-300 SF
  - 2-car: 400-700 SF
  - 3-car: 700-1,100 SF
  - 4-car or oversized: 1,000-1,500 SF
- If your number falls outside the typical range for the car count, double-check the floor plan dimensions before returning — the architect's listed SF is authoritative

If you cannot read the garage dimensions, return null and note in ambiguity_notes that you couldn't measure.

garage_doors_estimated is the count of OVERHEAD garage doors (not service doors — those are exterior doors). Read each door opening on the front (and any side) elevation:
- A typical 2-car garage with one wide opening = 1 overhead door (a 16' double)
- A typical 2-car garage with two narrow openings = 2 overhead doors (two 8' singles)
- A 3-car garage is most commonly "1 wide + 1 narrow" = 2 doors, but sometimes "3 narrow" = 3 doors
- Count exactly what you see on the elevation; do not infer from the car count

If you cannot read the front elevation clearly, return null and note in ambiguity_notes which detail you couldn't make out.

STONE VENEER RULES — stone_veneer_sqft reflects only the labeled accent area for cultured / natural stone applied as an accent (porch column wraps, chimney chase, foundation reveal, wainscot). Sources to read:
- Material schedule or finish schedule listing stone veneer with a labeled area
- Elevation callouts (cross-hatch pattern with a "STONE" or "CULTURED STONE" tag and a dimension)
- Any plan note giving a square footage for stone

Do NOT estimate from drawing geometry — if no number is labeled, return null and add to ambiguity_notes ("Stone accent shown on porch columns but the square footage isn't called out — confirm with the supplier"). Typical labeled values run 50–300 SF on a custom plan.

FLOOR JOIST RULES — floor_joist_count_estimated reflects the architect-listed total joist count when a floor framing schedule or joist schedule is printed. These look like a small table on the framing plan listing joist sizes and quantities (e.g. "6 ea 16'", "14 ea 14'", "20 ea 12'" — you'd return 6 + 14 + 20 = 40). When there's a clear schedule, summing it is the most reliable count we can get.

Do NOT estimate from floor area or joist spacing — return null when no schedule exists; downstream will fall back to a length-and-spacing formula. Custom plans typically show 80–200 first-floor joists; a small ranch might show 30–50. If the schedule covers only one floor of a multi-floor plan, return that floor's count and note which floor in ambiguity_notes.

FOOTPRINT RULES — getting these two fields right matters a lot, because downstream math splits framing scope (which uses conditioned area) from roof/siding scope (which uses overall envelope).

footprint_dimensions = the OVERALL building envelope. Length × Width measured to the outermost edges of the structure as it sits on the lot. INCLUDES attached porches, attached garage, and any covered outdoor area under the main roof. This is the dimension a surveyor would write on a site plan; it's typically larger than the conditioned area. Read from the OVERALL BUILDING DIMENSIONS callout on the foundation plan or first-floor plan, NOT from the conditioned-space label.

conditioned_footprint_dimensions = the FIRST-FLOOR HEATED/COOLED area only. Length × Width of just the main house envelope, EXCLUDING porches, decks, attached garage, and any unconditioned outdoor space. If the plan labels the conditioned area's dimensions separately, use those. If not, you can derive: take the first_floor_sqft value (assuming you read it) and present it as the largest rectangle that fits that area — but PREFER any printed dimensions from the plan over derivations.

When both are equal: the building has no attached porch or garage; both fields can carry the same value.
When you only have one: prefer to return BOTH (with the same value) rather than null, unless the difference is meaningful and you genuinely can't read the other.

roof_area_sqft = total roof finish area (shingle/metal panel coverage area) ONLY when the plan explicitly labels it. Many plan sets print this on the roof plan or in a roof finish schedule (e.g. "TOTAL ROOF AREA: 4,250 SF"). Do NOT calculate or estimate this from footprint × pitch — return null and let downstream do that. The point of this field is to capture a labeled value if one exists, so we use the architect's number rather than our calculated estimate.

ROOF RULES — these drive eave LF and gutter LF calculations downstream, so getting them right has real $ impact.

roof_type classifies the primary roof shape from the roof plan or front/rear elevations:
- "gable" — triangular wall ends; eaves run ONLY on the two long sides (typical simple builder roof). Pure gable has zero hip planes.
- "hip" — all four sides slope; eaves run on EVERY side of the structure (typical southern / coastal residential look).
- "gable+hip" — a mix of gable and hip planes (e.g. main house is hip but the garage or great room has a gable end). Common on custom plans.
- "complex" — three or more distinct roof planes / multiple intersecting ridges / dormers / cross-gables / clipped gables. Custom architect plans often land here.
- null — can't tell from the plan; downstream will assume "complex" as a safer default.

roof_pitch_in_12 = the rise of the PRIMARY roof slope per 12 inches of run. Plan callouts show this as a small triangle with "8/12" or "10/12" labeled on it, usually on the elevation drawings or roof plan. Return the rise number only (the "8" or "10"). Common residential pitches: 4/12 (low), 6/12 (median), 8/12 (standard custom), 10/12 (steeper / Craftsman), 12/12 (very steep). Return null when:
- Multiple major pitches dominate (e.g. 8/12 main + 4/12 porch — flag in ambiguity_notes which is primary)
- The pitch isn't labeled on the elevations (don't guess from drawing geometry; null is fine)`;

interface ExtractionResult {
  plan_name: string | null;
  total_sqft: number | null;
  first_floor_sqft: number | null;
  second_floor_sqft: number | null;
  bonus_sqft: number | null;
  porch_sqft: number | null;
  garage_sqft: number | null;
  garage_cars: number | null;
  garage_doors_estimated: number | null;
  stone_veneer_sqft: number | null;
  floor_joist_count_estimated: number | null;
  bedrooms: number | null;
  full_baths: number | null;
  half_baths: number | null;
  footprint_dimensions: string | null;
  conditioned_footprint_dimensions: string | null;
  roof_area_sqft: number | null;
  roof_type: "gable" | "hip" | "gable+hip" | "complex" | null;
  roof_pitch_in_12: number | null;
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
