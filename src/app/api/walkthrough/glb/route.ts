// GET /api/walkthrough/glb — the Maddox house as a binary glTF, at a stable
// public URL so Android's Scene Viewer can fetch it for AR. (Scene Viewer
// does a plain GET and can't use a browser blob: URL, so this has to be a
// real server endpoint.)
//
// Deterministic: builds the packed Maddox layout → solid massing mesh → GLB,
// at a ~200 mm longest side (a ~0.2 m dollhouse in AR).

import { NextResponse } from "next/server";
import { buildHouseMesh } from "@/lib/model3d";
import { meshToGlb } from "@/lib/model3d/glb";
import { maddoxLayout } from "@/lib/model3d/sample-house";

export const runtime = "nodejs";

export function GET() {
  const mesh = buildHouseMesh(maddoxLayout(), { targetLongestMm: 200 });
  const glb = meshToGlb(mesh);
  return new NextResponse(glb as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "model/gltf-binary",
      "Content-Disposition": 'inline; filename="maddox-house.glb"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
