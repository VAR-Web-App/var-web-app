"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./sidebar";
import { useAuth } from "@/lib/auth-context";

// Auth-gated shell. Unauthenticated users get bounced to /login.
// Anyone who wants to browse without an account can hit /demo, which is
// its own non-shelled route with seed data.

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

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
      <Sidebar />
      <main className="ml-56 p-6">{children}</main>
    </div>
  );
}
