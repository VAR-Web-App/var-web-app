// POST /api/walkthrough/layout — Path-B 3D walkthrough (POC).
//
// The plan extractor gives room NAMES + SIZES but no positions. This route
// asks Claude to lay those rooms out into a plausible, non-overlapping 2D
// floor plan per level, which the three.js viewer then extrudes into a
// navigable model — no CubiCasa / paid API. Approximate, not survey-accurate.

import { NextRequest, NextResponse } from "next/server";
import { extractMetadataWithLlm } from "@/lib/parsers/llm-metadata";

export const runtime = "nodejs";

export interface PlacedRoom {
  name: string;
  level: "main" | "second";
  /** Feet from the front-left corner: x = left→right, z = front→back. */
  x: number;
  z: number;
  /** Feet. width runs along x, depth along z. */
  width: number;
  depth: number;
}

export interface WalkthroughLayout {
  footprint: { width: number; depth: number };
  rooms: PlacedRoom[];
}

interface RoomIn {
  name: string;
  dimensions?: string;
  sqft?: number;
  level?: string;
}
interface Body {
  rooms?: RoomIn[];
  footprint?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const rooms = body.rooms ?? [];
  if (rooms.length === 0) {
    return NextResponse.json({ ok: false, error: "no_rooms" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Walkthrough not configured (missing ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  const roomList = rooms
    .map((r) => `- ${r.name} | ${r.dimensions ?? "?"} | ${r.sqft ?? "?"} sqft | level: ${r.level ?? "main"}`)
    .join("\n");

  try {
    const layout = await extractMetadataWithLlm<WalkthroughLayout>({
      systemPrompt:
        "You are an architect who lays out single-family home floor plans. You return ONLY a JSON object — no prose, no markdown fences.",
      fieldsPrompt: `Lay these rooms out into a realistic, NON-OVERLAPPING 2D floor plan, one arrangement PER LEVEL.

Footprint (approx): ${body.footprint ?? "unknown"}
Rooms (name | dimensions WxD in feet | sqft | level):
${roomList}

Rules:
- Coordinates in FEET. Origin at the front-left corner: x increases left→right, z increases front→back (deeper into the house).
- Parse each room's dimensions for its width (along x) and depth (along z). If missing, estimate a square from sqft.
- Pack rooms edge-to-edge with minimal gaps; rooms on the SAME level must not overlap.
- Respect sensible adjacencies: kitchen next to dining and great room; master bath adjacent to master suite; foyer/entry at the front (small z); bedrooms clustered.
- Each level's rooms should roughly fit within the footprint.

Return a JSON object:
{
  "footprint": { "width": <feet>, "depth": <feet> },
  "rooms": [ { "name": "...", "level": "main" | "second", "x": <feet>, "z": <feet>, "width": <feet>, "depth": <feet> }, ... ]
}`,
      documentText: `Rooms to place:\n${roomList}`,
      maxTokens: 2000,
    });
    return NextResponse.json({ ok: true, layout });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "layout_failed" },
      { status: 502 },
    );
  }
}
