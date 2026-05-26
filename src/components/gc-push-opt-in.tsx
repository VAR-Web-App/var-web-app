"use client";

// GC-side push opt-in card for the Settings page. Same browser
// detection as PushOptIn (sub-portal version) but writes the
// subscription to OrgSettings.push_subscriptions via the existing
// client-side store (Firebase rules enforce org isolation).
//
// Server reads these subscriptions via admin SDK to dispatch bid
// arrival + conflict notification pushes to the GC.

import { useEffect, useState } from "react";
import {
  detectPushState,
  type PushSupportState,
} from "@/lib/push-client";
import type { OrgSettings, PushSubscriptionRecord } from "@/types";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export default function GCPushOptIn({
  settings,
  onChange,
}: {
  settings: OrgSettings;
  onChange: (next: OrgSettings) => void;
}) {
  const [state, setState] = useState<PushSupportState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thisDeviceLabel, setThisDeviceLabel] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void detectPushState().then((s) => {
      if (active) setState(s);
    });
    setThisDeviceLabel(deriveDeviceLabel());
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    if (!VAPID_PUBLIC_KEY) {
      setError("Push isn't configured — set NEXT_PUBLIC_VAPID_PUBLIC_KEY.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission denied.");
      }
      const reg =
        (await navigator.serviceWorker.getRegistration("/sw.js")) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            VAPID_PUBLIC_KEY,
          ) as BufferSource,
        });
      }
      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error("Subscription incomplete.");
      }
      const record: PushSubscriptionRecord = {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        subscribed_at: new Date().toISOString(),
        device_label: deriveDeviceLabel(),
      };
      const existing = settings.push_subscriptions ?? [];
      const next = [
        ...existing.filter((s) => s.endpoint !== record.endpoint),
        record,
      ];
      onChange({ ...settings, push_subscriptions: next });
      setState("subscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable.");
    } finally {
      setBusy(false);
    }
  }

  async function disable(endpoint: string) {
    setBusy(true);
    try {
      // Unsubscribe locally if this is the active device's subscription.
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (reg) {
        const localSub = await reg.pushManager.getSubscription();
        if (localSub && localSub.endpoint === endpoint) {
          await localSub.unsubscribe();
        }
      }
      const next = (settings.push_subscriptions ?? []).filter(
        (s) => s.endpoint !== endpoint,
      );
      onChange({ ...settings, push_subscriptions: next });
      if (next.length === 0) setState("not-subscribed");
    } finally {
      setBusy(false);
    }
  }

  const subscriptions = settings.push_subscriptions ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Push notifications arrive on this device the moment a sub flags a
        conflict or submits a bid — same look + sound as a text message,
        but free and works even when your phone&apos;s signal is spotty.
      </p>

      {state === "ios-needs-install" && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          On iPhone, install FrameFlow to your home screen first (Safari
          Share → Add to Home Screen), then come back here to enable push.
        </p>
      )}

      {state === "permission-denied" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-200">
          Notifications are blocked at the OS level. Enable in your phone or
          browser&apos;s system settings to turn push on.
        </p>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {subscriptions.length === 0 ? (
        <div>
          <button
            type="button"
            onClick={enable}
            disabled={
              busy ||
              state === "ios-needs-install" ||
              state === "permission-denied" ||
              state === "unsupported"
            }
            className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            {busy ? "Enabling…" : "Enable on this device"}
          </button>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Active subscriptions ({subscriptions.length})
          </p>
          <ul className="space-y-1.5">
            {subscriptions.map((s) => (
              <li
                key={s.endpoint}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">
                    {s.device_label || "Device"}
                    {s.device_label === thisDeviceLabel && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        this device
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Added {new Date(s.subscribed_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void disable(s.endpoint)}
                  disabled={busy}
                  className="shrink-0 text-[11px] font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {state === "not-subscribed" && (
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="mt-3 text-xs font-medium text-sky-700 hover:text-sky-900"
            >
              + Add this device
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function deriveDeviceLabel(): string {
  if (typeof window === "undefined") return "Device";
  const ua = window.navigator.userAgent;
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

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
