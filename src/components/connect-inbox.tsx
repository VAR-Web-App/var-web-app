"use client";

// "Connect your inbox" card — the builder-grade path to email correspondence.
// One click → Unipile's hosted auth → sign in with Google/Microsoft → done.
// No forward rules, no verification codes. Shows connected mailboxes once
// linked. Lives on the Inbox above the unassigned-forward queue.

import { useCallback, useEffect, useState } from "react";
import { EnvelopeIcon, CheckCircleIcon, PlusIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import Tooltip from "@/components/tooltip";
import { listEmailAccounts } from "@/lib/store";
import type { EmailAccount } from "@/types/builder";

// Unipile reports provider types like "GOOGLE_OAUTH" / "OUTLOOK" / "MAIL" —
// normalize to a friendly label. Check Google first ("GMAIL" contains "MAIL").
function providerLabel(provider: string | null): string {
  const t = (provider ?? "").toUpperCase();
  if (t.includes("GOOGLE") || t.includes("GMAIL")) return "Gmail";
  if (t.includes("OUTLOOK") || t.includes("MICROSOFT")) return "Outlook";
  if (t.includes("MAIL") || t.includes("IMAP")) return "IMAP";
  return "Connected";
}

export default function ConnectInbox() {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profile?.org_ref) return;
    const a = await listEmailAccounts(profile.org_ref).catch(() => []);
    setAccounts(a);
    setLoaded(true);
  }, [profile?.org_ref]);

  useEffect(() => {
    void refresh();
    // If the user just came back from a successful connect, the webhook may
    // land a beat later — re-check shortly after mount.
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      const t = window.setTimeout(() => void refresh(), 2500);
      return () => window.clearTimeout(t);
    }
  }, [refresh]);

  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  async function syncNow() {
    setSyncMsg("Syncing…");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/unipile/sync", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const d = (await res.json()) as { scanned?: number; filed?: number; error?: string };
      setSyncMsg(
        d.error
          ? `Sync failed: ${d.error}`
          : `Scanned ${d.scanned ?? 0}, filed ${d.filed ?? 0} onto deals.`,
      );
    } catch {
      setSyncMsg("Sync failed.");
    }
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/unipile/connect", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url; // hand off to Unipile's hosted screen
        return;
      }
      throw new Error(data.error ?? "Couldn't start the connection");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (!loaded) return null;

  const connected = accounts.length > 0;

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <EnvelopeIcon className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Email inbox</h2>
      </header>

      {connected ? (
        <div className="px-4 py-3">
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.account_id} className="flex items-center gap-2 text-sm">
                <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="font-medium text-slate-900">
                  {a.email ?? providerLabel(a.provider)}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {providerLabel(a.provider)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-4">
            <Tooltip
              label="Pull in recent mail now (new mail files itself automatically)"
              placement="top"
            >
              <button
                onClick={() => void syncNow()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                Sync recent mail
              </button>
            </Tooltip>
            <Tooltip label="Connect another mailbox" placement="top">
              <button
                onClick={() => void connect()}
                disabled={busy}
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800 disabled:opacity-50"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                {busy ? "Opening…" : "Connect another inbox"}
              </button>
            </Tooltip>
          </div>
          {syncMsg && <p className="mt-2 text-xs text-slate-500">{syncMsg}</p>}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <div className="px-4 py-4">
          <p className="text-sm text-slate-600">
            Connect your email and project correspondence files itself onto the
            right deal automatically. Sign in with Google or Microsoft — no
            forwarding rules to set up.
          </p>
          <Tooltip
            label="Sign in with Google or Microsoft (read-only)"
            placement="top"
          >
            <button
              onClick={() => void connect()}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
            >
              <EnvelopeIcon className="h-4 w-4" />
              {busy ? "Opening…" : "Connect your inbox"}
            </button>
          </Tooltip>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}
