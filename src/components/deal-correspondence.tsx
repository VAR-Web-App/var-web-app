"use client";

// The "Email Correspondence" card on a deal — the emails forwarded/filed onto
// it via /api/email/inbound. Self-hides until there's mail (no empty clutter).
// Tap a row to expand the body.

import { useEffect, useState } from "react";
import { EnvelopeIcon, PaperClipIcon } from "@heroicons/react/24/outline";
import { listEmailMessages } from "@/lib/store";
import type { EmailMessage } from "@/types/builder";
import type { Deal } from "@/types";

export default function DealCorrespondence({ deal }: { deal: Deal }) {
  const [msgs, setMsgs] = useState<EmailMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const all = await listEmailMessages(deal.org_ref).catch(() => []);
      if (!active) return;
      setMsgs(all.filter((m) => m.deal_ref === deal.id));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [deal.id, deal.org_ref]);

  if (loaded && msgs.length === 0) return null; // no clutter until mail arrives

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
        <EnvelopeIcon className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Correspondence</h2>
        <span className="text-xs text-slate-400">
          {msgs.length} email{msgs.length === 1 ? "" : "s"}
        </span>
      </header>
      {!loaded ? (
        <p className="px-4 py-5 text-sm text-slate-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {msgs.map((m) => (
            <li key={m.id} className="px-4 py-3 sm:px-6">
              <button
                onClick={() => setOpenId(openId === m.id ? null : m.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {m.subject || "(no subject)"}
                    </span>
                    {m.has_attachments && (
                      <PaperClipIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {m.from_email} · {new Date(m.received_at).toLocaleDateString()}
                  </p>
                  {openId !== m.id && (
                    <p className="mt-0.5 truncate text-xs text-slate-400">{m.snippet}</p>
                  )}
                </div>
              </button>
              {openId === m.id && m.body_text && (
                <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                  {m.body_text}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
