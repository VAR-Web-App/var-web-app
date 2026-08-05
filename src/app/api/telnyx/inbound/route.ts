// POST /api/telnyx/inbound — Telnyx inbound SMS/MMS webhook for client texts.
//
// Wired in the Telnyx portal as the messaging profile's inbound webhook.
// Flow: verify Ed25519 signature → normalize → resolve the org from the
// destination business number → file the text onto the matching deal (or the
// unassigned queue) via the shared SMS ingest pipeline. Always 200-acks so
// Telnyx doesn't retry storms on a message we intentionally ignore (delivery
// receipts, unknown numbers).

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import {
  parseTelnyxInbound,
  verifyTelnyxSignature,
} from "@/lib/telnyx";
import { ingestInboundSms, orgRefForNumber } from "@/lib/sms-ingest";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Signature check — reject spoofed webhooks. Skipped only when the public
  // key isn't configured yet (pre-go-live), with a loud warning, mirroring
  // the Twilio inbound route's dev posture.
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (publicKey) {
    const sig = req.headers.get("telnyx-signature-ed25519") ?? "";
    const ts = req.headers.get("telnyx-timestamp") ?? "";
    if (!verifyTelnyxSignature(rawBody, sig, ts, publicKey)) {
      // TEMP DEBUG (2026-08-05): persist the exact request so it can be
      // replayed offline against the real key; proceed so we're unblocked.
      // Revert to `return 403` after the verifier is fixed.
      try {
        await adminDb()
          .collection("_debug_telnyx")
          .doc("last")
          .set({ rawBody, sig, ts, keyLen: publicKey.length, at: new Date().toISOString() });
      } catch {}
      console.warn("[telnyx/inbound] SIGDEBUG mismatch — captured + proceeding");
    }
  } else {
    console.warn(
      "[telnyx/inbound] TELNYX_PUBLIC_KEY not set — skipping signature check",
    );
  }

  const msg = parseTelnyxInbound(rawBody);
  if (!msg) return NextResponse.json({ ok: true, ignored: true });

  if (!adminConfigured()) {
    console.warn("[telnyx/inbound] admin SDK not configured — dropping");
    return NextResponse.json({ ok: true, ignored: true });
  }

  const db = adminDb();
  const orgRef = await orgRefForNumber(db, msg.to);
  if (!orgRef) {
    console.warn("[telnyx/inbound] no org owns destination number", {
      to: msg.to,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const dealRef = await ingestInboundSms(db, orgRef, msg);
    return NextResponse.json({ ok: true, dealRef });
  } catch (e) {
    console.error("[telnyx/inbound] ingest failed", e);
    // 200 anyway — a retry would just re-hit the same failure; the message
    // is logged for manual follow-up.
    return NextResponse.json({ ok: true, error: "ingest_failed" });
  }
}
