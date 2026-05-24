// Shared hook for loading a deal record on the per-deal sub-routes.
// Used by /deals/[id], /deals/[id]/schedule, /finances, /files.
//
// Returns the deal + loading flag. Redirects to /deals on missing /
// wrong-org access. Auth context must be present (AppShell guards it).

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDeal, saveDeal } from "./store";
import { useAuth } from "./auth-context";
import type { Deal } from "@/types";

export interface UseDealResult {
  deal: Deal | null;
  loaded: boolean;
  /** Patch the in-memory deal and persist. Optimistic. */
  updateDeal: (patch: Partial<Deal>) => Promise<void>;
}

export function useDeal(id: string): UseDealResult {
  const router = useRouter();
  const { profile } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    void (async () => {
      const d = await getDeal(id);
      if (!active) return;
      if (!d || d.org_ref !== profile.org_ref) {
        router.replace("/deals");
        return;
      }
      setDeal(d);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [id, router, profile]);

  async function updateDeal(patch: Partial<Deal>) {
    if (!deal) return;
    const next = {
      ...deal,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    setDeal(next);
    await saveDeal(next);
  }

  return { deal, loaded, updateDeal };
}
