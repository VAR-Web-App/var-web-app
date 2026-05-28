"use client";

// Client-side push subscription helpers — register the service worker,
// ask for notification permission, subscribe via PushManager, and
// POST the subscription to the server (where it's saved on the sub's
// distributor record).
//
// Browser support gates: every modern browser supports PushManager
// EXCEPT Safari before installing the PWA to home screen. On iOS,
// pushSubscribed() returns false until the user adds-to-home-screen.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type PushSupportState =
  | "unsupported" // browser lacks ServiceWorker or PushManager
  | "ios-needs-install" // iOS Safari, not yet installed as PWA
  | "permission-denied" // user said no, blocked at OS level
  | "not-subscribed" // supported + permitted, no subscription yet
  | "subscribed"; // active subscription, push works

/** Detect the current state of push support + subscription on this
 *  device. Call from useEffect to drive the UI. */
export async function detectPushState(): Promise<PushSupportState> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // iOS Safari has SW but NOT PushManager until PWA install. Use
    // the iOS UA hint as a separate state so we show a different
    // prompt (install first, then subscribe).
    const ua = navigator.userAgent;
    const isIosSafari =
      /iPad|iPhone|iPod/.test(ua) && !("PushManager" in window);
    return isIosSafari ? "ios-needs-install" : "unsupported";
  }

  // Already in standalone mode?
  interface IosNavigator extends Navigator {
    standalone?: boolean;
  }
  const isStandalone =
    (navigator as IosNavigator).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;

  // iOS gates push behind PWA-install AND user permission. Check the
  // platform marker so we can show "install first" rather than the
  // generic permission prompt.
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !isStandalone) {
    return "ios-needs-install";
  }

  if (Notification.permission === "denied") return "permission-denied";

  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return "not-subscribed";
  const existing = await reg.pushManager.getSubscription();
  return existing ? "subscribed" : "not-subscribed";
}

/** Register the service worker, request permission, subscribe, and
 *  POST the subscription to /api/push/subscribe?token=X. Throws on
 *  fatal errors (user denied, server rejected). */
export async function subscribeToPush(token: string): Promise<void> {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — push isn't configured.",
    );
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications aren't supported on this device.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied.");
  }

  const reg =
    (await navigator.serviceWorker.getRegistration("/sw.js")) ??
    (await navigator.serviceWorker.register("/sw.js"));
  // Wait for the worker to be ready before subscribing.
  await navigator.serviceWorker.ready;

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast to BufferSource — Uint8Array satisfies it at runtime but
      // recent TS lib types narrow this to ArrayBuffer-backed buffers.
      applicationServerKey: urlBase64ToUint8Array(
        VAPID_PUBLIC_KEY,
      ) as BufferSource,
    });
  }

  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  const res = await fetch(
    `/api/push/subscribe?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        device_label: deriveDeviceLabel(),
      }),
    },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Server rejected subscription.");
  }
}

/** Unsubscribe locally + tell the server to drop this subscription. */
export async function unsubscribeFromPush(token: string): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await fetch(
    `/api/push/subscribe?token=${encodeURIComponent(token)}&endpoint=${encodeURIComponent(endpoint)}`,
    { method: "DELETE" },
  );
}

/** Fire-and-forget push notification to a sub's registered devices.
 *  Server looks up subscriptions via admin SDK and dispatches via the
 *  web-push library. Failures resolve to { ok: false } — never throw,
 *  so a push problem can't break the caller's primary action.
 *
 *  Pair this with sendSms + sendEmail at the call site for full
 *  multi-channel coverage. */
export async function pushNotifySub(
  subRef: string,
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<{ ok: boolean; sent?: number; reason?: string }> {
  try {
    const res = await fetch("/api/push/send-to-sub", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sub_ref: subRef, payload }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      sent?: number;
      reason?: string;
      error?: string;
    };
    return {
      ok: !!data.ok,
      sent: data.sent,
      reason: data.reason || data.error,
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "network_error",
    };
  }
}

/** "iPhone — Safari", "Pixel 7 — Chrome", etc. Best-effort UA parse;
 *  the value is just a label for the sub to recognize the device. */
function deriveDeviceLabel(): string {
  const ua = navigator.userAgent;
  let device = "Device";
  if (/iPhone/.test(ua)) device = "iPhone";
  else if (/iPad/.test(ua)) device = "iPad";
  else if (/Android/.test(ua)) device = "Android";
  else if (/Macintosh/.test(ua)) device = "Mac";
  else if (/Windows/.test(ua)) device = "Windows";

  let browser = "browser";
  if (/CriOS|Chrome/.test(ua)) browser = "Chrome";
  else if (/FxiOS|Firefox/.test(ua)) browser = "Firefox";
  else if (/Safari/.test(ua)) browser = "Safari";
  else if (/Edg/.test(ua)) browser = "Edge";

  return `${device} — ${browser}`;
}

/** Convert a base64url-encoded VAPID public key into the Uint8Array
 *  format PushManager.subscribe wants for applicationServerKey. */
function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
