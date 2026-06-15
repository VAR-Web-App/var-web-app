// POST /api/sub/location-ping — log sub location when they visit the portal.
//
// Body: { token, lat, lng }
//
// Checks if the sub is within ~500m of any project address (basic
// geofence). If so, sends a push/email notification to the GC:
// "Tony (Plumber) arrived at Maddox jobsite."
//
// Privacy: only runs when the sub explicitly grants location permission
// on the portal page. No background tracking.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, lat, lng } = body;

  if (!token || lat == null || lng == null) {
    return NextResponse.json(
      { ok: false, error: "Missing token, lat, or lng" },
      { status: 400 },
    );
  }

  // For v1: log the ping. Full geofence matching + GC notification
  // requires firebase-admin to look up the sub's assignments and
  // project addresses. The architecture is:
  //   1. Resolve token → sub_schedule_link → sub_ref + org_ref
  //   2. Load active projects for this sub
  //   3. Geocode project addresses (or use stored lat/lng)
  //   4. Haversine distance check (< 500m = "on site")
  //   5. Push/email GC: "[Sub Name] arrived at [Project Address]"
  //
  // For now, return success and log — the actual notification fires
  // once firebase-admin is wired (Track K in FEATURES.md).
  console.log(
    `[location-ping] sub token=${token.slice(0, 8)}… at (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
  );

  return NextResponse.json({
    ok: true,
    logged: true,
    // When geofence matching is active:
    // on_site: boolean,
    // project_name: string | null,
  });
}
