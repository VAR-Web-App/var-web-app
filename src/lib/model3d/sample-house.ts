// Deterministic Maddox — Country Dream House layout (plan 46380L) for the
// server-side AR/GLB route. The client demo uses the LLM placer; Android's
// Scene Viewer needs a stable GET URL, so this shelf-packs the rooms without
// the LLM — same house, deterministic arrangement.

import type { PlacedRoom, WalkthroughLayout } from "@/app/api/walkthrough/layout/route";

interface RoomDef {
  name: string;
  w: number; // feet along x
  d: number; // feet along z
  level: "main" | "second";
}

// Rooms + dimensions straight off the labeled floor plan.
const ROOMS: RoomDef[] = [
  { name: "Foyer", w: 12, d: 12, level: "main" },
  { name: "Study", w: 12, d: 12, level: "main" },
  { name: "Dining", w: 12, d: 12, level: "main" },
  { name: "Bedroom 2", w: 12, d: 12, level: "main" },
  { name: "Bedroom 3", w: 12, d: 12, level: "main" },
  { name: "Vaulted Family", w: 17, d: 19, level: "main" },
  { name: "Kitchen", w: 11, d: 24, level: "main" },
  { name: "Owner's Suite", w: 16, d: 17, level: "main" },
  { name: "Garage", w: 26, d: 33, level: "main" },
  { name: "Bedroom 4", w: 12, d: 14, level: "second" },
  { name: "Bedroom 5", w: 12, d: 14, level: "second" },
  { name: "Bonus / 6th BR", w: 12, d: 19, level: "second" },
];

const FOOTPRINT_W = 73; // 72'9"

/** Shelf-pack one level's rooms left→right, wrapping rows within the width. */
function packLevel(level: "main" | "second"): PlacedRoom[] {
  const out: PlacedRoom[] = [];
  let x = 0;
  let z = 0;
  let rowDepth = 0;
  for (const r of ROOMS.filter((rm) => rm.level === level)) {
    if (x > 0 && x + r.w > FOOTPRINT_W) {
      x = 0;
      z += rowDepth;
      rowDepth = 0;
    }
    out.push({ name: r.name, level, x, z, width: r.w, depth: r.d });
    x += r.w;
    rowDepth = Math.max(rowDepth, r.d);
  }
  return out;
}

export function maddoxLayout(): WalkthroughLayout {
  const rooms = [...packLevel("main"), ...packLevel("second")];
  const maxX = Math.max(...rooms.map((r) => r.x + r.width), 0);
  const maxZ = Math.max(...rooms.map((r) => r.z + r.depth), 0);
  return { footprint: { width: maxX, depth: maxZ }, rooms };
}
