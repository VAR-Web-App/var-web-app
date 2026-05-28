// Web-push delivery — server-side push notifications via the web-push
// library to Apple APNs / Google FCM, which forward to installed PWAs.
//
// SERVER-ONLY (imports the web-push library + uses the VAPID private
// key). Never import this from client code. Client-side subscribe /
// unsubscribe is in lib/push-client.ts.
//
// VAPID keys gate authentication with the push services. Generate once
// with `npx web-push generate-vapid-keys`; store as:
//   VAPID_PUBLIC_KEY   (also exposed to client as NEXT_PUBLIC_VAPID_PUBLIC_KEY)
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT      ("mailto:you@example.com" — required by spec)
//
// Failure mode: send failures resolve to { ok: false }, never throw.
// Stale subscriptions (410 Gone from the push service) signal the
// device unsubscribed — the caller should remove that record.

import webpush from "web-push";
import type { PushSubscriptionRecord } from "@/types";

let configured = false;

/** Lazy VAPID configuration. Returns true if all three env vars are
 *  set, false otherwise (caller should skip the send gracefully). */
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) return false;
  try {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
    return true;
  } catch (e) {
    console.warn("[push] VAPID setup failed", e);
    return false;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path the notification opens when tapped — e.g. /s/{token}. */
  url?: string;
  /** Optional dedupe tag — same tag replaces a prior notification
   *  rather than stacking. Useful for reminders that update. */
  tag?: string;
}

export interface SendPushResult {
  ok: boolean;
  /** True when the push service returned 410 (Gone) — the caller
   *  should remove this subscription from storage since the device
   *  has unsubscribed or uninstalled. */
  gone?: boolean;
  reason?: string;
}

/** Send one push to one subscription. Fire-and-forget — failures are
 *  logged but never thrown. */
export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<SendPushResult> {
  if (!ensureConfigured()) {
    console.warn("[push] VAPID env vars not set — skipping send");
    return { ok: false, reason: "not_configured" };
  }
  const json = JSON.stringify(payload);
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      json,
      // TTL: how long the push service should hold the message if
      // the device is offline. 24h is reasonable for scheduling
      // notifications — anything older isn't worth delivering.
      { TTL: 60 * 60 * 24 },
    );
    return { ok: true };
  } catch (e) {
    const err = e as { statusCode?: number; body?: string };
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription is gone — caller should remove it from storage.
      return { ok: false, gone: true, reason: "gone" };
    }
    console.warn("[push] send failed", {
      endpoint: subscription.endpoint.slice(0, 80),
      status: err.statusCode,
      body: err.body,
    });
    return {
      ok: false,
      reason: err.body || (e instanceof Error ? e.message : "send_failed"),
    };
  }
}

/** Send the same payload to every subscription on the list, in
 *  parallel. Returns the list with stale subscriptions removed —
 *  caller persists this back. */
export async function sendPushToAll(
  subscriptions: PushSubscriptionRecord[],
  payload: PushPayload,
): Promise<PushSubscriptionRecord[]> {
  if (subscriptions.length === 0) return subscriptions;
  const results = await Promise.all(
    subscriptions.map(async (s) => ({
      sub: s,
      result: await sendPush(s, payload),
    })),
  );
  // Drop any subscription the push service told us is gone.
  return results.filter((r) => !r.result.gone).map((r) => r.sub);
}
