// POST /api/email/inbound — SendGrid Inbound Parse webhook (the "forward-in"
// path). A builder auto-forwards project email to their per-org parse address
// `u-<orgId>@parse.keystonepro.app`; SendGrid POSTs the parsed message here.
//
// We resolve the ORG from the recipient address, try to MATCH a deal by
// substring-matching the subject+body against that org's deal identifiers, and
// file the message into `email_messages` (deal_ref = null → "unassigned"
// review queue rather than a risky misroute). Admin SDK write — no user auth;
// secured by an optional shared secret on the webhook URL (?key=…).
//
// Provider-agnostic: works for ANY email host (Gmail, Yahoo, Outlook, ISP) —
// the builder just sets a forward rule. See COMMS_HUB_SPEC.md.

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

/** Pull the org id out of a `u-<orgId>@…` recipient (handles multi-recipient). */
function orgFromRecipient(addr: string): string | null {
  const m = addr.match(/u-([A-Za-z0-9_-]+)@/);
  return m ? m[1] : null;
}

const snippetOf = (text: string) =>
  text.replace(/\s+/g, " ").trim().slice(0, 300);

export async function POST(req: NextRequest) {
  // Optional shared secret appended to the webhook URL in SendGrid.
  const secret = process.env.INBOUND_PARSE_SECRET;
  if (secret && req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 });
  }

  const to = String(form.get("to") ?? "");
  const from = String(form.get("from") ?? "");
  const subject = String(form.get("subject") ?? "");
  const text = String(form.get("text") ?? "");
  const attachments = parseInt(String(form.get("attachments") ?? "0"), 10) || 0;

  // The `envelope` field carries the true SMTP recipient (the parse address)
  // even when the visible To: header is the original inbox.
  let envelopeTo = to;
  try {
    const env = JSON.parse(String(form.get("envelope") ?? "{}")) as { to?: string[] };
    if (Array.isArray(env.to) && env.to.length) envelopeTo = env.to.join(",");
  } catch {}

  const orgId = orgFromRecipient(envelopeTo) || orgFromRecipient(to);
  if (!orgId) {
    // Not a per-org parse address — ack 200 so SendGrid doesn't retry.
    return NextResponse.json({ ok: true, ignored: "no_org_address" });
  }

  const db = adminDb();

  // Match a deal by longest identifier substring in subject+body.
  const dealsSnap = await db.collection("deals").where("org_ref", "==", orgId).get();
  const hay = `${subject}\n${text}`.toLowerCase();
  let dealRef: string | null = null;
  let bestLen = 4; // ignore very short identifiers
  for (const d of dealsSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const ids = [data.name, data.solicitation_number, data.customer_po, data.ship_to_address].filter(
      (v): v is string => typeof v === "string" && v.length > 4,
    );
    for (const idv of ids) {
      if (idv.length > bestLen && hay.includes(idv.toLowerCase())) {
        dealRef = d.id;
        bestLen = idv.length;
      }
    }
  }

  const fromEmail = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
  const now = new Date().toISOString();
  const id = `em_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.collection("email_messages").doc(id).set({
    id,
    org_ref: orgId,
    deal_ref: dealRef, // null → "unassigned" review queue
    status: dealRef ? "matched" : "unassigned",
    from,
    from_email: fromEmail,
    subject,
    snippet: snippetOf(text),
    body_text: text.slice(0, 20000),
    has_attachments: attachments > 0,
    received_at: now,
  });

  return NextResponse.json({ ok: true, org: orgId, deal_ref: dealRef, matched: !!dealRef });
}
