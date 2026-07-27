// GET /api/notify/channels — reports which delivery channels are actually
// configured on the server, so the Settings UI can flag Email/SMS as
// "needs setup" instead of silently no-op'ing when a user toggles them on.
//
// Returns only booleans — no keys or secrets are ever exposed.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const email = !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);
  const sms = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
  // Web push is bundled with the app (VAPID) and always available to enable.
  return NextResponse.json({ push: true, email, sms });
}
