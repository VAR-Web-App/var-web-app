// Server-side GC notification sender. Reads the org's settings + notification
// prefs and fans a message out across the enabled channels (email / web push /
// SMS), pruning dead push subscriptions inline. Admin-only (adminDb) — call
// from API routes and server handlers, never the client.

import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/email";
import { isLikelyEmail } from "@/lib/email-compose";
import { sendPushToAll } from "@/lib/push";
import { toE164 } from "@/lib/sms";
import type { OrgSettings } from "@/types";
import { resolveChannels } from "./events";

export interface GcNotice {
  title: string;
  body: string;
  /** In-app path to deep-link to (push click / email CTA). */
  url?: string;
}

/** Send a GC notice for `eventId` to the org's configured channels, honoring
 *  the org's per-event routing + quiet hours. No-ops silently when the org
 *  has no settings doc or the chosen channels aren't reachable. */
export async function notifyGc(
  orgRef: string,
  eventId: string,
  notice: GcNotice,
): Promise<void> {
  const db = adminDb();
  const snap = await db.collection("settings").doc(orgRef).get();
  if (!snap.exists) return;
  const settings = snap.data() as OrgSettings;
  const ch = resolveChannels(settings.notification_prefs, eventId);

  // ── email ──
  if (ch.email && isLikelyEmail(settings.company_email)) {
    void sendEmail({
      to: settings.company_email!,
      subject: notice.title,
      text: notice.url ? `${notice.body}\n\n${notice.url}` : notice.body,
    });
  }

  // ── web push (prune stale) ──
  if (ch.push) {
    const subs = settings.push_subscriptions ?? [];
    if (subs.length > 0) {
      const active = await sendPushToAll(subs, {
        title: notice.title,
        body: notice.body,
        ...(notice.url ? { url: notice.url } : {}),
        tag: eventId,
      });
      if (active.length !== subs.length) {
        await db
          .collection("settings")
          .doc(orgRef)
          .update({ push_subscriptions: active })
          .catch(() => {});
      }
    }
  }

  // ── SMS (direct Twilio; sms.ts sendSms is client-only) ──
  if (ch.sms) {
    const to = toE164(settings.company_phone ?? "");
    if (to) await sendGcSms(settings, to, `${notice.title}: ${notice.body}`);
  }
}

/** Server-side Twilio send, mirroring the from-number allow-listing used by
 *  the sub-bid route. Silent no-op when Twilio env isn't configured. */
async function sendGcSms(
  settings: OrgSettings,
  to: string,
  body: string,
): Promise<void> {
  const orgFrom = settings.sms_config?.from_number?.trim();
  const platformFrom = process.env.TWILIO_FROM_NUMBER;
  const allowedExtra = (process.env.TWILIO_ALLOWED_FROM_NUMBERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const from =
    orgFrom && (orgFrom === platformFrom || allowedExtra.includes(orgFrom))
      ? orgFrom
      : platformFrom;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !from) {
    console.warn("[notify] TWILIO_* not set — skipping GC SMS");
    return;
  }
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );
  if (!res.ok) {
    console.warn(`[notify] twilio_error_${res.status}`, (await res.text()).slice(0, 200));
  }
}
