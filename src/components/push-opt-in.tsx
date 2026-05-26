"use client";

// Small in-portal banner that asks the sub to enable push notifications
// after they've installed the PWA. Detects current support state and
// shows whichever message applies:
//   - "Install first" (iOS Safari, not installed) → dismiss only, the
//     install hint elsewhere handles the actual flow.
//   - "Enable alerts" → button that triggers subscribe.
//   - "Already on" (subscribed) → quiet badge, no nag.
//   - "Blocked by OS" (permission denied) → settings link nudge.
//   - "Not supported" → hide.
//
// Dismissable to localStorage. Re-appears if state changes (e.g. user
// installs the PWA then comes back).

import { useEffect, useState } from "react";
import {
  detectPushState,
  subscribeToPush,
  type PushSupportState,
} from "@/lib/push-client";

const DISMISS_KEY = "frameflow.push-opt-in.dismissed";

export default function PushOptIn({ token }: { token: string }) {
  const [state, setState] = useState<PushSupportState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    void detectPushState().then((s) => {
      if (active) setState(s);
    });
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") {
        setDismissed(true);
      }
    } catch {
      // private mode — show anyway
    }
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush(token);
      setState("subscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  // Hide entirely on unsupported / already-subscribed (no need to nag)
  // or when the user has dismissed.
  if (!state || state === "unsupported" || state === "subscribed") return null;
  if (dismissed) return null;

  if (state === "ios-needs-install") {
    return (
      <Banner tone="info" onDismiss={dismiss}>
        <strong>Get instant alerts</strong> — install FrameFlow to your home
        screen first (Share → Add to Home Screen), then come back here to turn
        on push.
      </Banner>
    );
  }

  if (state === "permission-denied") {
    return (
      <Banner tone="warn" onDismiss={dismiss}>
        <strong>Notifications blocked.</strong> Enable in your phone&apos;s
        Settings → Notifications → FrameFlow to get instant schedule alerts.
      </Banner>
    );
  }

  // state === "not-subscribed"
  return (
    <Banner tone="action" onDismiss={dismiss}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            Turn on instant alerts
          </p>
          <p className="text-xs text-slate-600">
            Get notified the moment a new phase is scheduled or rescheduled,
            without checking texts.
          </p>
          {error && (
            <p className="mt-1 text-[11px] text-red-700">{error}</p>
          )}
        </div>
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="shrink-0 rounded-md bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:bg-sky-300"
        >
          {busy ? "…" : "Enable"}
        </button>
      </div>
    </Banner>
  );
}

function Banner({
  tone,
  onDismiss,
  children,
}: {
  tone: "info" | "warn" | "action";
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : tone === "action"
        ? "border-sky-300 bg-sky-50"
        : "border-slate-200 bg-white";
  return (
    <div
      className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${cls}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-1 text-slate-400 hover:bg-black/5 hover:text-slate-700"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden>
          <path
            d="M5 5 L15 15 M15 5 L5 15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>
    </div>
  );
}
