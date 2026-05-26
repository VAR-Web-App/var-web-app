"use client";

// One-time "Add to Home Screen" hint for iOS Safari users. Apple
// doesn't auto-prompt for PWA install the way Chrome on Android does,
// so the user has to know to tap Share → Add to Home Screen. This
// banner tells them — once — then stays dismissed forever via
// localStorage.
//
// Render conditions (all must be true):
//   1. Browser is mobile Safari (not Chrome, not Android, not desktop).
//   2. Not already running as an installed PWA.
//   3. User hasn't dismissed before.
//
// Android Chrome handles its own auto-install banner from the manifest,
// so nothing to do there. Desktop browsers don't get a hint either —
// the PWA value prop is mobile.

import { useEffect, useState } from "react";

const DISMISS_KEY = "keystonepro.ios-install-hint.dismissed";

export default function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed → window.navigator.standalone === true on iOS.
    // (Chrome uses display-mode: standalone; we only care about iOS.)
    interface IosNavigator extends Navigator {
      standalone?: boolean;
    }
    const nav = window.navigator as IosNavigator;
    if (nav.standalone === true) return;

    // iOS Safari detection. CriOS / FxiOS = Chrome / Firefox on iOS —
    // those *can* install PWAs but go through Share menu the same way,
    // so we include them. Exclude Android Chrome explicitly.
    const ua = window.navigator.userAgent;
    const isIosDevice = /iPad|iPhone|iPod/.test(ua);
    if (!isIosDevice) return;

    // User dismissed in a prior session.
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // Private browsing / storage disabled — show anyway, can't track
      // dismissals but the hint is small and not annoying.
    }

    setShow(true);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Install KeystonePro"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 64 64"
              width="24"
              height="24"
              aria-hidden
            >
              <path
                d="M18 40 L32 24 L46 40"
                stroke="#ffffff"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              Install KeystonePro
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              Tap{" "}
              <span className="inline-flex items-baseline gap-0.5 align-baseline">
                <ShareIcon />
                Share
              </span>{" "}
              then <strong>Add to Home Screen</strong> for a one-tap launch
              with no browser bar.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install hint"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              width="18"
              height="18"
              aria-hidden
            >
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
      </div>
    </div>
  );
}

// Native iOS Share icon (square with up-arrow) — drawn inline so the
// hint doesn't ship an icon font for one glyph.
function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width="12"
      height="12"
      className="mb-[1px] inline-block"
      aria-hidden
    >
      <path
        d="M10 2 L10 13 M6 6 L10 2 L14 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M4 10 L4 17 L16 17 L16 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
