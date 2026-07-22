// Dynamic /sw.js handler — emits the service worker JS with a build
// stamp baked in, so each deploy produces a byte-different file. The
// browser compares /sw.js byte-for-byte to decide whether a SW update
// is available. With a static public/sw.js, the content never changes
// and users stay on stale bundles indefinitely. Stamping the build
// SHA (or a timestamp fallback during local dev) is the standard
// trick for forcing PWA refreshes.
//
// SW body lives here too — kept in sync with what was at public/sw.js
// before. Source of truth is this file; public/sw.js was removed.

import { NextResponse } from "next/server";

const SW_BODY = `// KeystonePro service worker — see app/sw.js/route.ts for the source.

self.addEventListener("install", () => {
  // Take over immediately so subsequent pushes can fire even if the
  // user never reloads the page after install.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "KeystonePro", body: "" };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  const options = {
    body: payload.body,
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: payload.tag || "keystonepro",
    data: { url: payload.url || "/" },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          if ("focus" in c && "navigate" in c) {
            c.navigate(targetUrl);
            return c.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
`;

export const dynamic = "force-dynamic";

// Computed ONCE per server process. In local dev VERCEL_GIT_COMMIT_SHA is
// unset; computing `dev-${Date.now()}` per *request* made every /sw.js fetch
// byte-different, so the browser saw a "new" SW on every load →
// install → skipWaiting → clients.claim() → controllerchange → the
// SwAutoUpdate component reloaded the page → repeat, forever. Stamping once
// per process keeps /sw.js byte-stable within a dev session (it changes on
// restart — one intended reload). Prod is unaffected: it uses the commit SHA.
const DEV_BUILD_ID = `dev-${Date.now()}`;

export function GET(): NextResponse {
  // VERCEL_GIT_COMMIT_SHA is set automatically on every Vercel build; falls
  // back to the per-process dev id above. The sole purpose is to give each
  // deploy a different SW body so the browser detects an update.
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA || DEV_BUILD_ID;
  const body = `// build: ${buildId}\n${SW_BODY}`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Don't let CDNs/browsers cache the SW file — defeats the
      // whole point of the build stamp.
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
