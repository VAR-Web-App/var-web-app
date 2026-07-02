"use client";

// Shown at the top of the app when the signed-in user has a pending team
// invite to an org other than the one they're currently in. "Join" repoints
// their profile at the invited org and reloads so the whole app re-scopes.
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getInviteForEmail, acceptInvite, type OrgInvite } from "@/lib/store";

export default function JoinOrgBanner() {
  const { profile } = useAuth();
  const [invite, setInvite] = useState<OrgInvite | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!profile?.email) return;
    let cancelled = false;
    getInviteForEmail(profile.email)
      .then((inv) => {
        if (cancelled) return;
        setInvite(inv && inv.org_ref !== profile.org_ref ? inv : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile?.email, profile?.org_ref]);

  if (!invite || !profile) return null;

  async function join() {
    if (!profile || !invite) return;
    setJoining(true);
    try {
      await acceptInvite(profile.uid, invite.org_ref);
      window.location.reload();
    } catch {
      setJoining(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
      <span>
        You&rsquo;ve been invited to join <b>{invite.org_name}</b>
        {invite.invited_by ? ` (by ${invite.invited_by})` : ""}.
      </span>
      <button
        type="button"
        onClick={join}
        disabled={joining}
        className="rounded-md bg-sky-700 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
      >
        {joining ? "Joining…" : `Join ${invite.org_name}`}
      </button>
    </div>
  );
}
