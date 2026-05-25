// POST /api/sms — relay a single SMS through Twilio.
//
// Body: { to: string (E.164), body: string }.
//
// Twilio is optional: if TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
// TWILIO_FROM_NUMBER aren't set, the route no-ops and returns
// { ok: true, delivered: false, reason: "sms_not_configured" }. That
// lets the scheduling flow run end-to-end before the carrier account
// (Twilio + A2P 10DLC registration) is live — wiring the env vars is
// the only step to turn real delivery on.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { to?: string; body?: string; from?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const to = (body.to || "").trim();
  const text = (body.body || "").trim();
  if (!to || !text) {
    return NextResponse.json(
      { ok: false, error: "Missing 'to' or 'body'" },
      { status: 400 }
    );
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  // Per-org dedicated number (Option C / Phase 2) wins when provided;
  // otherwise we fall back to the platform shared number (Option A).
  // The whitelist is intentionally simple — TWILIO_ALLOWED_FROM_NUMBERS
  // is a comma-separated list of E.164 numbers under our account, used
  // to prevent a malicious client from impersonating an arbitrary number.
  const platformFrom = process.env.TWILIO_FROM_NUMBER;
  const allowedExtra = (process.env.TWILIO_ALLOWED_FROM_NUMBERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const requestedFrom = (body.from || "").trim();
  const from =
    requestedFrom &&
    (requestedFrom === platformFrom || allowedExtra.includes(requestedFrom))
      ? requestedFrom
      : platformFrom;

  if (!sid || !token || !from) {
    console.warn("[sms] TWILIO_* env vars not set — skipping send", { to });
    return NextResponse.json({ ok: true, delivered: false, reason: "sms_not_configured" });
  }

  const params = new URLSearchParams({ To: to, From: from, Body: text });

  let res: Response;
  try {
    res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        delivered: false,
        reason: e instanceof Error ? e.message : "twilio_unreachable",
      },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { ok: false, delivered: false, reason: `twilio_error_${res.status}`, detail },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, delivered: true });
}
