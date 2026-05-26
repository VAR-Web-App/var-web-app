// Email notification channel — SendGrid-backed fallback for subs
// (or builders) who don't have valid SMS / consent.
//
// SERVER-ONLY. This file imports the SendGrid SDK; never import it
// from client code. Compose helpers live in lib/email-compose.ts
// (pure functions, client-safe).
//
// Trust model: send happens server-side only (SENDGRID_API_KEY is
// secret). Client code routes through /api/email which calls this.
//
// Failure mode: send failures are logged but never thrown. A
// notification problem must not break the caller's primary action.

import sgMail from "@sendgrid/mail";
import { isLikelyEmail } from "./email-compose";

let configured = false;

/** Lazy SendGrid configuration. Returns true if the API key was set
 *  successfully, false if SENDGRID_API_KEY isn't configured. */
function ensureConfigured(): boolean {
  if (configured) return true;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return false;
  sgMail.setApiKey(apiKey);
  configured = true;
  return true;
}

export interface SendEmailResult {
  ok: boolean;
  delivered: boolean;
  reason?: string;
}

/** Fire-and-forget email send. Never throws — failures resolve to
 *  { ok: false } so a notification problem can't break the caller's
 *  primary action (assigning a sub, saving a milestone, etc.). */
export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  if (!isLikelyEmail(args.to)) {
    return { ok: false, delivered: false, reason: "invalid_email" };
  }
  if (!ensureConfigured()) {
    console.warn(
      "[email] SENDGRID_API_KEY not set — skipping send",
      { to: args.to, subject: args.subject },
    );
    return { ok: false, delivered: false, reason: "not_configured" };
  }
  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!from) {
    console.warn(
      "[email] SENDGRID_FROM_EMAIL not set — skipping send",
      { to: args.to },
    );
    return { ok: false, delivered: false, reason: "no_from_address" };
  }
  const fromName = process.env.SENDGRID_FROM_NAME || "KeystonePro";

  try {
    await sgMail.send({
      to: args.to,
      from: { email: from, name: fromName },
      subject: args.subject.slice(0, 200),
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
    });
    return { ok: true, delivered: true };
  } catch (e) {
    console.warn("[email] send failed", {
      to: args.to,
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      delivered: false,
      reason: e instanceof Error ? e.message : "send_failed",
    };
  }
}
