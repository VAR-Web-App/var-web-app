// POST /api/unipile/email — Unipile "new email" webhook. Fires on
// mail_received / mail_sent for any connected account. We resolve the org
// from account_id (via email_accounts), match the mail to a deal, and file
// it (matched-only). Secured by the shared ?key= secret. Body is read as
// text then JSON-parsed so it works even if Unipile omits the content-type.

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import { fileUnipileEmail } from "@/lib/unipile-sync";
import type { UnipileEmail } from "@/lib/unipile";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.INBOUND_PARSE_SECRET;
  if (secret && req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await req.text()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const event = typeof body.event === "string" ? body.event : undefined;
  if (event && event !== "mail_received" && event !== "mail_sent") {
    return NextResponse.json({ ok: true, ignored: event });
  }

  const accountId = typeof body.account_id === "string" ? body.account_id : "";
  if (!accountId) return NextResponse.json({ ok: true, ignored: "no_account" });

  const db = adminDb();
  const acctDoc = await db.collection("email_accounts").doc(accountId).get();
  const orgRef = acctDoc.exists
    ? (acctDoc.data()?.org_ref as string | undefined)
    : undefined;
  if (!orgRef) return NextResponse.json({ ok: true, ignored: "unknown_account" });
  const selfEmail = acctDoc.data()?.email as string | undefined;

  const email: UnipileEmail = {
    id: body.email_id as string | undefined,
    provider_id: body.provider_id as string | undefined,
    message_id: body.message_id as string | undefined,
    thread_id: body.thread_id as string | undefined,
    date: body.date as string | undefined,
    subject: body.subject as string | undefined,
    body: body.body as string | undefined,
    body_plain: body.body_plain as string | undefined,
    has_attachments: body.has_attachments as boolean | undefined,
    from_attendee: body.from_attendee as UnipileEmail["from_attendee"],
    to_attendees: body.to_attendees as UnipileEmail["to_attendees"],
    cc_attendees: body.cc_attendees as UnipileEmail["cc_attendees"],
    attachments: body.attachments as UnipileEmail["attachments"],
  };

  const dealRef = await fileUnipileEmail(db, orgRef, email, selfEmail, true);
  return NextResponse.json({ ok: true, filed: !!dealRef, deal_ref: dealRef });
}
