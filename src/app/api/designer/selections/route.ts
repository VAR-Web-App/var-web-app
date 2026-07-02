// GET /api/designer/selections?token=… — Designer-side read endpoint.
//
// The designer portal at /d/[token] calls this on load. The token in the
// query string is the *only* auth: the server verifies it resolves to a
// DesignerLink, then returns the selections for that link's project.
// project_selections is an auth-gated collection, so this read has to be
// mediated server-side (admin SDK) — the designer never signs in.
//
// Failure modes:
//   - token missing           → 400
//   - admin SDK not configured → 503
//   - token doesn't resolve    → 404

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import type { DesignerLink, ProjectSelection } from "@/types/builder";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const db = adminDb();
  const linkSnap = await db.collection("designer_links").doc(token).get();
  if (!linkSnap.exists) {
    return NextResponse.json({ ok: false, error: "token_not_found" }, { status: 404 });
  }
  const link = linkSnap.data() as DesignerLink;

  const snap = await db
    .collection("project_selections")
    .where("deal_ref", "==", link.deal_ref)
    .get();
  const selections = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectSelection, "id">) }))
    .sort((a, b) => a.number.localeCompare(b.number));

  return NextResponse.json({
    ok: true,
    link: {
      project_name: link.project_name,
      builder_name: link.builder_name,
    },
    selections,
  });
}
