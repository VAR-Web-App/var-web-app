"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./sidebar";
import MobileTopBar from "./mobile-top-bar";
import { useAuth } from "@/lib/auth-context";

// Auth-gated shell. Unauthenticated users get bounced to /login.
// Anyone who wants to browse without an account can hit /demo, which is
// its own non-shelled route with seed data.
//
// Mobile (< md): sidebar slides in from the left as an off-canvas
// drawer; mobile top bar with hamburger lives above the content.
// Desktop (md+): sidebar is pinned-left and the content shifts right
// by its width.

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
      <MobileTopBar onMenuClick={() => setMobileNavOpen(true)} />
      <Sidebar
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      {/* Backdrop for the mobile drawer. Tap to dismiss. Hidden on md+. */}
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-slate-900/50 md:hidden"
        />
      )}
      {/* Content offset:
       *  - Mobile: leave room for the fixed top bar (hamburger row +
       *    iOS safe-area-inset-top so the notch / dynamic island
       *    doesn't overlap content).
       *  - Desktop: shift right by the sidebar width.
       *  px shrinks on phones for more usable width.  */}
      <main className="pt-[calc(env(safe-area-inset-top)+3.5rem)] md:ml-56 md:pt-0">
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
