// Service worker — receives web-push events from Apple's APNs /
// Google's FCM and displays them as native OS notifications. Same
// banner / lockscreen / sound treatment as native-app pushes.
//
// Installed when the sub portal calls navigator.serviceWorker.register
// after the PWA is added to the home screen. Lives at /sw.js so the
// scope is the whole origin.
//
// Notification payload shape (set server-side via web-push library):
//   { title, body, url? }
// `url` opens that path when the user taps the notification.

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
    // Malformed payload — fall back to a generic alert so the user
    // at least sees something rather than a silent push.
    if (event.data) payload.body = event.data.text();
  }

  const options = {
    body: payload.body,
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: payload.tag || "keystonepro",
    data: { url: payload.url || "/" },
    // Vibrate pattern doubles as iOS sound cue on installed PWAs.
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
        // If an existing tab is open, focus + navigate it. Otherwise
        // open a new one.
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
