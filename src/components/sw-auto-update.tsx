"use client";

// Registers the service worker on every page load and silently reloads
// the page when a new SW version takes over. Pairs with the dynamic
// /sw.js route handler (src/app/sw.js/route.ts), which stamps the
// current build SHA into the SW body — so each deploy produces a
// byte-different SW file and the browser fires updatefound.
//
// Flow per deploy:
//   1. User opens the PWA / loads a page on the live URL.
//   2. Browser fetches /sw.js; sees content differs from cached SW.
//   3. Browser installs the new SW alongside the active one.
//   4. The new SW calls skipWaiting() (see route handler body), so
//      it transitions installed → activated → controller swap.
//   5. The controllerchange event fires here; we reload once.
//
// The hasReloaded guard prevents an infinite reload loop on the rare
// case where multiple controllerchange events fire in succession.

import { useEffect } from "react";

export default function SwAutoUpdate() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let hasReloaded = false;
    // Only reload when an EXISTING controller is replaced — i.e. a genuine
    // update to an already-controlled page. On the first-ever install there's
    // no prior controller and the page already has current code, so reloading
    // is pointless. Skipping it (together with the per-process-stable /sw.js
    // stamp in app/sw.js/route.ts) removes the local-dev reload loop.
    const hadController = !!navigator.serviceWorker.controller;
    function onControllerChange() {
      if (!hadController || hasReloaded) return;
      hasReloaded = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    void navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Force an immediate update check on load. Browsers also poll
        // every ~24h on their own, but checking on each load means
        // users on long-lived PWA sessions still pick up new builds
        // promptly.
        void reg.update().catch(() => {});
      })
      .catch((e) => {
        console.warn("[sw] register failed", e);
      });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  return null;
}
