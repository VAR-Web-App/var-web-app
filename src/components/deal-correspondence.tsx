"use client";

// The "Correspondence" log on a deal — every message with this client, in
// order. A read-only record (the paper trail), not an email reader: each row
// is a static summary (no expand, no body). To actually read/reply, use the
// "Reply" link in the Inbox to-do, which opens the message in Gmail.
//
// Live: subscribes to email_messages so webhook-filed mail appears without a
// resync or reload. Self-hides until there's mail.

import { useEffect, useState } from "react";
import {
  EnvelopeIcon,
  PaperClipIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import Tooltip from "@/components/tooltip";
import { watchEmailMessages, logEmailAsRequest } from "@/lib/store";
import type { EmailMessage } from "@/types/builder";
import type { Deal } from "@/types";

export default function DealCorrespondence({ deal }: { deal: Deal }) {
  const [msgs, setMsgs] = useState<EmailMessage[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsub = watchEmailMessages(deal.org_ref, (all) => {
      setMsgs(all.filter((m) => m.deal_ref === deal.id));
      setLoaded(true);
    });
    return unsub;
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
              <div className="flex items-center gap-1.5">
                {m.direction !== "out" && !m.addressed && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-sky-500"
                    title="Needs reply"
                  />
                )}
                <span className="truncate text-sm font-medium text-slate-900">
                  {m.subject || "(no subject)"}
                </span>
                {m.has_attachments && (
                  <PaperClipIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {m.direction === "out" ? "You" : m.from || m.from_email} ·{" "}
                {new Date(m.received_at).toLocaleDateString()}
              </p>
              {m.snippet && (
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">
                  {m.snippet}
                </p>
              )}
              {m.request_ref ? (
                <Tooltip label="Go to the request on this project" placement="top">
                  <Link
                    href={`/deals/${deal.id}#requests`}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                  >
                    <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" />
                    View request →
                  </Link>
                </Tooltip>
              ) : (
                m.direction !== "out" && (
                  <Tooltip
                    label="Track this email as a request on the project"
                    placement="top"
                  >
                    <button
                      onClick={() => void logEmailAsRequest(m)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800"
                    >
                      <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" />
                      Log as request
                    </button>
                  </Tooltip>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
