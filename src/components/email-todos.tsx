"use client";

// "Needs reply" — the Inbox action surface for client email. A received,
// deal-linked message is a to-do until the builder marks it addressed. Each
// row links to the deal and clears itself on "Mark addressed". Self-hides
// when the list is empty.

import { useEffect, useState } from "react";
import Link from "next/link";
import { EnvelopeIcon, CheckIcon } from "@heroicons/react/24/outline";
import { listAttentionEmails, markEmailAddressed, listDeals } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import type { EmailMessage } from "@/types/builder";

export default function EmailTodos() {
  const { profile } = useAuth();
  const [items, setItems] = useState<EmailMessage[]>([]);
  const [dealNames, setDealNames] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile?.org_ref) return;
    let active = true;
    void (async () => {
      const [emails, deals] = await Promise.all([
        listAttentionEmails(profile.org_ref).catch(() => []),
        listDeals(profile.org_ref).catch(() => []),
      ]);
      if (!active) return;
      setItems(emails);
      setDealNames(Object.fromEntries(deals.map((d) => [d.id, d.name])));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [profile?.org_ref]);

  async function address(id: string) {
    setItems((prev) => prev.filter((m) => m.id !== id)); // optimistic
    await markEmailAddressed(id).catch(() => {});
  }

  if (!loaded || items.length === 0) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-sky-200 bg-sky-50/50 shadow-sm">
      <header className="flex items-center gap-2 border-b border-sky-200 px-4 py-3">
        <EnvelopeIcon className="h-4 w-4 text-sky-700" />
        <h2 className="text-sm font-semibold text-slate-900">Needs reply</h2>
        <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {items.length}
        </span>
      </header>
      <ul className="divide-y divide-sky-100">
        {items.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <Link
              href={`/deals/${m.deal_ref}`}
              className="min-w-0 flex-1 hover:opacity-80"
            >
              <p className="truncate text-sm font-medium text-slate-900">
                {m.subject || "(no subject)"}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {m.from || m.from_email}
                {m.deal_ref && dealNames[m.deal_ref]
                  ? ` · ${dealNames[m.deal_ref]}`
                  : ""}
              </p>
            </Link>
            <button
              onClick={() => void address(m.id)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <CheckIcon className="h-3.5 w-3.5" />
              Addressed
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
