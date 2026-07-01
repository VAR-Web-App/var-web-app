"use client";

// Settings → Team. An org owner invites a teammate by email; the invitee sees
// a Join banner on their next sign-in (see join-org-banner.tsx). Lightweight:
// no seats/roles UI yet — invited members get full access to the org's data.
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  createInvite,
  listOrgInvites,
  revokeInvite,
  type OrgInvite,
} from "@/lib/store";

export default function TeamInviteCard() {
  const { profile } = useAuth();
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const orgName = profile?.display_name || profile?.email || "your team";

  useEffect(() => {
    if (!profile?.org_ref) return;
    listOrgInvites(profile.org_ref).then(setInvites).catch(() => {});
  }, [profile?.org_ref]);

  // Only the org owner sends invites.
  if (!profile || profile.role !== "owner") return null;

  async function send() {
    if (!profile || !email.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await createInvite(email, profile.org_ref, orgName, profile.email);
      setEmail("");
      setInvites(await listOrgInvites(profile.org_ref));
      setMsg("Invite sent — they'll see a Join prompt next time they sign in.");
    } catch {
      setMsg("Couldn't send the invite. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(em: string) {
    await revokeInvite(em);
    if (profile) setInvites(await listOrgInvites(profile.org_ref));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Team</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Invite a teammate by email. They sign in with that Google address and
          tap Join to access this org&rsquo;s projects.
        </p>
      </div>
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@email.com"
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="min-w-[220px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !email.trim()}
            className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
        {msg ? <p className="text-xs text-slate-500">{msg}</p> : null}
        {invites.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {invites.map((inv) => (
              <li
                key={inv.email}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="text-slate-700">{inv.email}</span>
                <button
                  type="button"
                  onClick={() => revoke(inv.email)}
                  className="text-xs font-medium text-slate-500 hover:text-red-600"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">No pending invites.</p>
        )}
      </div>
    </section>
  );
}
