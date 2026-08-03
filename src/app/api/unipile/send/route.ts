// POST /api/unipile/send — send a reply from the builder's connected inbox.
// Verifies the caller (uid = org_ref), sends via Unipile from the org's
// connected account, and records the outgoing message on the deal so the
// reply is part of the correspondence log + paper trail.

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminConfigured, adminDb } from "@/lib/firebase-admin";
import { unipileConfigured, sendEmail } from "@/lib/unipile";

export const runtime = "nodejs";

const snippetOf = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 300);

export async function POST(req: NextRequest) {
  if (!unipileConfigured() || !adminConfigured()) {
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

  let b: {
    to?: string;
    subject?: string;
    body?: string;
    replyTo?: string;
    dealRef?: string;
    threadId?: string;
  };
  try {
    b = (await req.json()) as typeof b;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  if (!b.to || !b.body) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const db = adminDb();
  const acc = await db
    .collection("email_accounts")
    .where("org_ref", "==", orgRef)
    .limit(1)
    .get();
  if (acc.empty) {
    return NextResponse.json({ ok: false, error: "no_inbox" }, { status: 400 });
  }
  const account = acc.docs[0].data();
  const accountId = account.account_id as string;
  const self = (account.email as string) || "";

  const subject = /^re:/i.test(b.subject ?? "")
    ? (b.subject as string)
    : `Re: ${b.subject ?? ""}`.trim();

  const result = await sendEmail(accountId, {
    to: b.to,
    subject,
    body: b.body,
    replyTo: b.replyTo,
  });
  if (!result.ok) {
    // A scope/permission error means the inbox was connected read-only.
    const needsReconnect = /403|scope|permission|insufficient/i.test(result.error ?? "");
    return NextResponse.json(
      { ok: false, error: result.error, needsReconnect },
      { status: 502 },
    );
  }

  // Record the sent reply on the deal (direction "out" → log, not a to-do).
  if (b.dealRef) {
    const now = new Date().toISOString();
    const id = `un_sent_${Date.now()}`;
    await db
      .collection("email_messages")
      .doc(id)
      .set({
        id,
        org_ref: orgRef,
        deal_ref: b.dealRef,
        status: "matched",
        from: self,
        from_email: self,
        subject,
        snippet: snippetOf(b.body),
        body_text: b.body.slice(0, 20000),
        has_attachments: false,
        received_at: now,
        source: "unipile",
        direction: "out",
        thread_id: b.threadId ?? null,
      });
  }

  return NextResponse.json({ ok: true });
}
