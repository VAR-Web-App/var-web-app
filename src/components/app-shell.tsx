"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./sidebar";
import MobileBottomNav from "./mobile-bottom-nav";
import JoinOrgBanner from "./join-org-banner";
import { useAuth } from "@/lib/auth-context";

// Auth-gated shell. Unauthenticated users get bounced to /login.
// Anyone who wants to browse without an account can hit /demo, which is
// its own non-shelled route with seed data.
//
// Mobile (< md): no top bar — bottom tab bar handles primary nav
// (Projects · Schedule · Subs · More). "More" opens the same sidebar
// as an off-canvas drawer for secondary items (Clients, Contacts,
// Add-ons, Settings, Sign Out).
// Desktop (md+): sidebar is pinned-left, content shifts right by w-56.

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      {/* Backdrop for the mobile "More" drawer. Tap to dismiss. */}
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-slate-900/50 md:hidden"
        />
      )}
      <MobileBottomNav onMoreClick={() => setMobileNavOpen(true)} />
      {/* Content offset:
       *  - Mobile: top padding clears the iPhone notch via safe-area;
       *    bottom padding clears the fixed bottom tab bar (h-14 + safe
       *    area).
       *  - Desktop: shift right by the sidebar width, no top/bottom
       *    chrome.
       *  Outer p shrinks on phones for more usable width.  */}
      <main className="pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+4rem)] md:ml-56 md:pb-0 md:pt-0">
        <JoinOrgBanner />
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
