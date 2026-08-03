"use client";

// "Needs reply" — the Inbox action surface for client email. A received,
// deal-linked message is a to-do until the builder marks it addressed. Each
// row links to the deal and clears itself on "Mark addressed". Self-hides
// when the list is empty.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  EnvelopeIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import {
  watchAttentionEmails,
  markEmailAddressed,
  listDeals,
  logEmailAsRequest,
} from "@/lib/store";
import { ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/lib/auth-context";
import type { EmailMessage } from "@/types/builder";

// Deep-link to the actual message in Gmail so the builder can reply. Uses
// the RFC822 Message-ID search operator (reliable across Gmail accounts).
function gmailLink(messageId?: string): string | null {
  if (!messageId) return null;
  const clean = messageId.replace(/[<>]/g, "").trim();
  if (!clean) return null;
  return `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(clean)}`;
}

export default function EmailTodos() {
  const { profile } = useAuth();
  const [items, setItems] = useState<EmailMessage[]>([]);
  const [dealNames, setDealNames] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile?.org_ref) return;
    listDeals(profile.org_ref)
      .then((deals) =>
        setDealNames(Object.fromEntries(deals.map((d) => [d.id, d.name]))),
      )
      .catch(() => {});
    // Live — new client mail shows up here without a resync or reload.
    const unsub = watchAttentionEmails(profile.org_ref, (emails) => {
      setItems(emails);
      setLoaded(true);
    });
    return unsub;
  }, [profile?.org_ref]);

  async function address(id: string) {
    setItems((prev) => prev.filter((m) => m.id !== id)); // optimistic
    await markEmailAddressed(id).catch(() => {});
  }

  const [logged, setLogged] = useState<Set<string>>(new Set());
  async function logReq(m: EmailMessage) {
    setLogged((prev) => new Set(prev).add(m.id));
    await logEmailAsRequest(m).catch(() => {});
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
        {items.map((m) => {
          const reply = gmailLink(m.message_id);
          return (
            <li key={m.id} className="px-4 py-3">
              <Link
                href={`/deals/${m.deal_ref}`}
                className="block hover:opacity-80"
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
              <div className="mt-2 flex items-center gap-2">
                {reply && (
                  <a
                    href={reply}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                  >
                    <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                    Reply
                  </a>
                )}
                {logged.has(m.id) || m.request_ref ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" />
                    Logged as request
                  </span>
                ) : (
                  <button
                    onClick={() => void logReq(m)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" />
                    Log request
                  </button>
                )}
                <button
                  onClick={() => void address(m.id)}
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Mark done
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
