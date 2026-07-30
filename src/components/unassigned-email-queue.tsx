"use client";

// The review queue for forwarded email the matcher couldn't confidently place
// (deal_ref = null). Cross-project, lives on the Inbox. One-tap "assign to a
// project" files it onto the deal. Self-hides when empty.

import { useEffect, useState } from "react";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { listEmailMessages, assignEmailMessage, listDeals } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import type { EmailMessage } from "@/types/builder";
import type { Deal } from "@/types";

export default function UnassignedEmailQueue() {
  const { profile } = useAuth();
  const [msgs, setMsgs] = useState<EmailMessage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile?.org_ref) return;
    let active = true;
    void (async () => {
      const [all, ds] = await Promise.all([
        listEmailMessages(profile.org_ref).catch(() => []),
        listDeals(profile.org_ref).catch(() => []),
      ]);
      if (!active) return;
      setMsgs(all.filter((m) => m.deal_ref === null));
      setDeals(ds);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [profile?.org_ref]);

  async function assign(m: EmailMessage, dealId: string) {
    if (!dealId) return;
    await assignEmailMessage(m.id, dealId);
    setMsgs((prev) => prev.filter((x) => x.id !== m.id));
  }

  if (!loaded || msgs.length === 0) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60 shadow-sm">
      <header className="flex items-center gap-2 border-b border-amber-200 px-4 py-3">
        <EnvelopeIcon className="h-4 w-4 text-amber-700" />
        <h2 className="text-sm font-semibold text-slate-900">Unassigned email</h2>
        <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
          {msgs.length}
        </span>
        <span className="hidden text-xs text-slate-500 sm:inline">
          — couldn&rsquo;t auto-match; pick the project.
        </span>
      </header>
      <ul className="divide-y divide-amber-100">
        {msgs.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {m.subject || "(no subject)"}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {m.from_email} · {m.snippet}
              </p>
            </div>
            <select
              defaultValue=""
              onChange={(e) => assign(m, e.target.value)}
              className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none"
            >
              <option value="">Assign to…</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}
