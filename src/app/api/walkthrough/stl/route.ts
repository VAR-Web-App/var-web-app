// POST /api/walkthrough/stl — floor-plan layout → printable STL download.
//
// Server seam for the 3D scale-model add-on. Today it just streams the STL
// back so the client can offer a download / preview. Next: this is where the
// print-on-demand hand-off lives — build the STL, POST it to the POD vendor
// (Treatstock's upload→quote→order API is the current front-runner), and
// return an order + tracking instead of raw bytes.
//
// Body: { layout: WalkthroughLayout, spec?: Partial<ModelSpec> }

import { NextRequest, NextResponse } from "next/server";
import { layoutToStl } from "@/lib/model3d";
import type { WalkthroughLayout } from "@/app/api/walkthrough/layout/route";
import type { ModelSpec } from "@/lib/model3d";

export const runtime = "nodejs";

interface Body {
  layout?: WalkthroughLayout;
  spec?: Partial<ModelSpec>;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const layout = body.layout;
  if (!layout || !Array.isArray(layout.rooms) || layout.rooms.length === 0) {
    return NextResponse.json({ ok: false, error: "no_layout" }, { status: 400 });
  }

  const { bytes, boundsMm, triangleCount } = layoutToStl(layout, body.spec ?? {});

  return new NextResponse(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "model/stl",
      "Content-Disposition": 'attachment; filename="scale-model.stl"',
      // Print dimensions surfaced as headers so a caller can show "prints at
      // N×N×N mm" without re-parsing the STL.
      "X-Model-Bounds-Mm": `${boundsMm.x.toFixed(1)},${boundsMm.y.toFixed(1)},${boundsMm.z.toFixed(1)}`,
      "X-Model-Triangles": String(triangleCount),
    },
  });
}
