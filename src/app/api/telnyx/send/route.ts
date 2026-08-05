// POST /api/telnyx/send — send an SMS reply from the builder's business line.
// The SMS twin of /api/unipile/send: verifies the caller (uid = org_ref),
// sends via Telnyx from the org's configured number, and records the outbound
// text on the deal so it's part of the correspondence log + paper trail.

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminConfigured, adminDb } from "@/lib/firebase-admin";
import { sendTelnyxSms, telnyxConfigured } from "@/lib/telnyx";
import { toE164 } from "@/lib/sms";

export const runtime = "nodejs";

const snippetOf = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 300);

export async function POST(req: NextRequest) {
  if (!telnyxConfigured() || !adminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
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

  let b: { to?: string; body?: string; dealRef?: string; threadId?: string };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const to = toE164(b.to ?? "");
  const body = (b.body ?? "").trim();
  if (!to || !body) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const db = adminDb();
  const settings = await db.collection("settings").doc(orgRef).get();
  const from = settings.data()?.sms_config?.from_number as string | undefined;
  if (!from) {
    // No business line provisioned for this org yet.
    return NextResponse.json({ ok: false, error: "no_business_line" }, { status: 400 });
  }

  const result = await sendTelnyxSms({ from, to, text: body });
  if (!result.ok) {
    // A2P-campaign-not-approved and similar carrier gates come back as Telnyx
    // 4xx — flag them so the UI can explain the wait rather than a raw error.
    const pendingA2p = /10dlc|campaign|not.?registered|unregistered|brand/i.test(
      result.reason ?? "",
    );
    return NextResponse.json(
      { ok: false, error: result.reason, pendingA2p },
      { status: 502 },
    );
  }

  // Record the sent reply on the deal (direction "out" → log, not a to-do).
  if (b.dealRef) {
    const now = new Date().toISOString();
    const id = `sms_out_${Date.now()}`;
    await db
      .collection("email_messages")
      .doc(id)
      .set({
        id,
        org_ref: orgRef,
        deal_ref: b.dealRef,
        status: "matched",
        from,
        from_email: "",
        from_phone: from,
        to_phone: to,
        subject: "",
        snippet: snippetOf(body),
        body_text: body.slice(0, 20000),
        has_attachments: false,
        received_at: now,
        source: "sms",
        direction: "out",
        thread_id: b.threadId ?? null,
      });
  }

  return NextResponse.json({ ok: true });
}
