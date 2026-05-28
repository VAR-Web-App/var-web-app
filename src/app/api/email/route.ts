// POST /api/email — relay a single email through SendGrid.
//
// Body: { to: string, subject: string, text: string, html?: string }.
//
// Same shape as /api/sms. SendGrid is optional: if SENDGRID_API_KEY
// or SENDGRID_FROM_EMAIL isn't set, the route no-ops gracefully and
// returns { ok: true, delivered: false, reason: "email_not_configured" }.

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: {
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const to = (body.to || "").trim();
  const subject = (body.subject || "").trim();
  const text = (body.text || "").trim();
  if (!to || !subject || !text) {
    return NextResponse.json(
      { ok: false, error: "Missing 'to', 'subject', or 'text'" },
      { status: 400 },
    );
  }

  const result = await sendEmail({ to, subject, text, html: body.html });
  return NextResponse.json(result);
}
