// POST /api/sms/inbound — Twilio inbound SMS webhook.
//
// Wired up in the Twilio console under the From-number's
// "A Message Comes In" webhook. Handles A2P 10DLC compliance behaviors
// that carriers spot-check on campaign review:
//   - STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT → confirm opt-out
//   - HELP / INFO → return support info (REQUIRED for campaign approval)
//   - anything else → silent ack
//
// Delivery suppression: Twilio enforces STOP at the carrier level the
// moment it arrives — future Messages.create calls to that number get
// blocked automatically. So opt-out is *already in effect* before this
// route runs; our response is purely the user-visible confirmation text.
//
// Firestore consent flip (sms_consent → false on the Distributor) is a
// follow-up that lands when firebase-admin is added to the server. Until
// then, inbound events are logged and the carrier-level block keeps the
// sub protected.

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

const STOP_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);
const HELP_KEYWORDS = new Set(["HELP", "INFO"]);

export async function POST(req: NextRequest) {
  // Twilio webhooks arrive as application/x-www-form-urlencoded.
  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);
  const from = params.get("From") ?? "";
  const body = (params.get("Body") ?? "").trim();
  const messageSid = params.get("MessageSid") ?? "";

  // Signature check — protects against spoofed STOP/HELP traffic from any
  // public endpoint that knows our URL. Skipped only when the auth token
  // isn't configured (dev / not-yet-live), with a loud warning.
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const sig = req.headers.get("x-twilio-signature");
    if (!sig || !verifyTwilioSignature(req.url, rawBody, sig, authToken)) {
      console.warn("[sms/inbound] signature mismatch — rejecting", {
        from,
        messageSid,
      });
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else {
    console.warn(
      "[sms/inbound] TWILIO_AUTH_TOKEN not set — skipping signature check",
    );
  }

  const keyword = body.toUpperCase().split(/\s+/)[0] ?? "";

  if (STOP_KEYWORDS.has(keyword)) {
    console.warn("[sms/inbound] STOP received", { from, messageSid });
    // TODO(firebase-admin): flip sms_consent → false on the Distributor
    //   whose normalized phone matches `from`. Until firebase-admin is
    //   wired, Twilio's carrier-level STOP enforcement keeps the sub
    //   safe from further messages — the DB flip is only for UI status.
    return twiml(stopReply());
  }

  if (HELP_KEYWORDS.has(keyword)) {
    console.warn("[sms/inbound] HELP received", { from, messageSid });
    return twiml(helpReply());
  }

  // Any other inbound — log for follow-up but stay silent so we don't
  // start an inadvertent conversation thread.
  console.warn("[sms/inbound] other inbound", { from, messageSid, body });
  return twiml("");
}

/** Build a TwiML response with an optional reply Body. Empty body = no auto-reply. */
function twiml(replyBody: string): NextResponse {
  const xml = replyBody
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(replyBody)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stopReply(): string {
  const name = process.env.SMS_PRODUCT_NAME || "this app";
  return `You've been unsubscribed from ${name} scheduling texts. No more messages will be sent. Reply START to opt back in.`;
}

function helpReply(): string {
  const name = process.env.SMS_PRODUCT_NAME || "this app";
  const support = process.env.SMS_SUPPORT_EMAIL || "";
  const supportTail = support ? ` Support: ${support}.` : "";
  return `${name} scheduling notifications. Reply STOP to unsubscribe. Msg & data rates may apply.${supportTail}`;
}

/**
 * Twilio webhook signature verification (HMAC-SHA1).
 *
 * Recipe:
 *   1. Take the full request URL exactly as Twilio called it.
 *   2. For form-encoded bodies, append every parameter sorted by name
 *      as `${name}${value}` (no separators).
 *   3. HMAC-SHA1 with the account's auth token, base64-encoded.
 *   4. Compare with `x-twilio-signature` header.
 */
function verifyTwilioSignature(
  url: string,
  rawBody: string,
  signature: string,
  authToken: string,
): boolean {
  const params = new URLSearchParams(rawBody);
  const sortedKeys = Array.from(params.keys()).sort();
  let payload = url;
  for (const k of sortedKeys) payload += k + (params.get(k) ?? "");
  const computed = createHmac("sha1", authToken)
    .update(payload, "utf8")
    .digest("base64");
  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
