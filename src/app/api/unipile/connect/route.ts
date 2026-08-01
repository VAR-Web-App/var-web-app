// POST /api/unipile/connect — mint a Unipile hosted-auth link for the
// signed-in builder. The client sends its Firebase ID token as a Bearer
// header; we verify it and use the uid as org_ref (so the connected inbox
// binds to the right org via the notify webhook's `name`). Returns { url }
// for the client to redirect to.

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminConfigured } from "@/lib/firebase-admin";
import { unipileConfigured, createHostedAuthLink } from "@/lib/unipile";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!unipileConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  // Verify the caller — uid is the org_ref. This stops anyone minting a link
  // that would bind their inbox into someone else's org.
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let orgRef: string;
  try {
    orgRef = (await adminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const origin = req.nextUrl.origin;
  const key = process.env.INBOUND_PARSE_SECRET ?? "";
  const expiresOn = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  try {
    const url = await createHostedAuthLink({
      orgRef,
      notifyUrl: `${origin}/api/unipile/notify${key ? `?key=${encodeURIComponent(key)}` : ""}`,
      successUrl: `${origin}/inbox?connected=1`,
      failureUrl: `${origin}/inbox?connected=0`,
      expiresOn,
    });
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 502 },
    );
  }
}
