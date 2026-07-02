// POST /api/notify/photo — notify client when a new build photo is uploaded.
//
// Body: { deal_id, deal_name, client_email, phase, caption, photo_count }
//
// Sends a simple email to the client with the project name and phase.
// Fire-and-forget — failures don't break the upload flow.

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { deal_name, client_email, phase, caption, photo_count } = body;

  if (!client_email) {
    return NextResponse.json({ ok: false, reason: "no_email" });
  }

  const subject = `New photo update: ${deal_name || "your project"}`;
  const text = [
    `A new build photo has been uploaded to your project${deal_name ? ` "${deal_name}"` : ""}.`,
    "",
    phase ? `Phase: ${phase}` : "",
    caption ? `Caption: ${caption}` : "",
    photo_count ? `Total photos: ${photo_count}` : "",
    "",
    "Log in to your project portal to view the latest progress.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await sendEmail({ to: client_email, subject, text });
  return NextResponse.json({ ok: result.ok, delivered: result.delivered });
}
