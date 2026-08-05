"use client";

// The "Messages" thread on a deal — every text (and email) with this client as
// a chat-style conversation: their messages on the left, yours on the right,
// oldest to newest. A composer at the bottom texts the client from the org's
// business line via /api/telnyx/send, so this is where you actually talk to
// them, not just a read-only log.
//
// Live: subscribes to email_messages so webhook-filed texts + sent replies
// appear without a reload. Self-hides until there's a message or a client
// phone to start one.

import { useEffect, useRef, useState } from "react";
import {
  PaperClipIcon,
  ClipboardDocumentCheckIcon,
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import Tooltip from "@/components/tooltip";
import { auth } from "@/lib/firebase";
import { watchEmailMessages, logEmailAsRequest } from "@/lib/store";
import type { EmailMessage } from "@/types/builder";
import type { Deal } from "@/types";

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function DealCorrespondence({ deal }: { deal: Deal }) {
  const [msgs, setMsgs] = useState<EmailMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = watchEmailMessages(deal.org_ref, (all) => {
      setMsgs(all.filter((m) => m.deal_ref === deal.id));
      setLoaded(true);
    });
    return unsub;
  }, [deal.id, deal.org_ref]);

  // Oldest → newest, like a chat.
  const thread = [...msgs].sort((a, b) =>
    (a.received_at || "").localeCompare(b.received_at || ""),
  );

  // Text the client from here: their number, or the number of the most recent
  // inbound text if the contact card isn't filled in yet.
  const latestInboundSms = [...thread]
    .reverse()
    .find((m) => m.source === "sms" && m.direction !== "out");
  const recipientPhone =
    deal.ship_to_poc_phone || latestInboundSms?.from_phone || "";

  // Keep the newest message in view when the thread updates.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread.length]);

  async function logReq(m: EmailMessage) {
    setLogged((prev) => new Set(prev).add(m.id));
    await logEmailAsRequest(m).catch(() => {});
  }

  async function sendText() {
    if (!draft.trim() || sending || !recipientPhone) return;
    setSending(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/telnyx/send", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ to: recipientPhone, body: draft, dealRef: deal.id }),
      });
      const d = (await res.json()) as {
        ok: boolean;
        error?: string;
        pendingA2p?: boolean;
      };
      if (d.ok) {
        setDraft(""); // the sent bubble appears via the live listener
      } else {
        setError(
          d.pendingA2p
            ? "Texting isn't live yet — your carrier registration (A2P) is still being approved. It'll send once that clears."
            : d.error === "no_business_line"
              ? "No business text line is set up for your account yet."
              : d.error || "Couldn't send the text",
        );
      }
    } catch {
      setError("Couldn't send the text");
    } finally {
      setSending(false);
    }
  }

  // Nothing to show and no way to start a conversation → stay hidden.
  if (loaded && msgs.length === 0 && !recipientPhone) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
        <ChatBubbleLeftRightIcon className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Messages</h2>
        {msgs.length > 0 && (
          <span className="text-xs text-slate-400">
            {msgs.length} message{msgs.length === 1 ? "" : "s"}
          </span>
        )}
      </header>

      {!loaded ? (
        <p className="px-4 py-5 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="max-h-96 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          {thread.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">
              No messages yet — send the first text below.
            </p>
          ) : (
            thread.map((m) => {
              const out = m.direction === "out";
              const isSms = m.source === "sms";
              const canLog = !out && !m.request_ref && !logged.has(m.id);
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${out ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      out
                        ? "rounded-br-sm bg-sky-600 text-white"
                        : "rounded-bl-sm bg-slate-100 text-slate-800"
                    }`}
                  >
                    {!isSms && m.subject && (
                      <p
                        className={`mb-0.5 text-xs font-semibold ${out ? "text-sky-100" : "text-slate-500"}`}
                      >
                        {m.subject}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">
                      {m.body_text || m.snippet || (m.has_attachments ? "" : "—")}
                    </p>
                    {m.has_attachments && (
                      <Link
                        href={`/deals/${deal.id}/files`}
                        className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${out ? "text-sky-100 hover:text-white" : "text-blue-700 hover:underline"}`}
                      >
                        <PaperClipIcon className="h-3.5 w-3.5" />
                        Attachment in Files
                      </Link>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 px-1 text-[10px] text-slate-400">
                    {isSms ? (
                      <span className="font-semibold uppercase tracking-wider text-emerald-600">
                        Text
                      </span>
                    ) : (
                      <EnvelopeIcon className="h-3 w-3" />
                    )}
                    <span>{fmtTime(m.received_at)}</span>
                    {canLog && (
                      <Tooltip label="Track this as a request on the project" placement="top">
                        <button
                          onClick={() => void logReq(m)}
                          className="inline-flex items-center gap-0.5 font-medium text-sky-600 hover:text-sky-700"
                        >
                          <ClipboardDocumentCheckIcon className="h-3 w-3" />
                          Log as request
                        </button>
                      </Tooltip>
                    )}
                    {m.request_ref && (
                      <Link
                        href={`/deals/${deal.id}#requests`}
                        className="inline-flex items-center gap-0.5 font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        <ClipboardDocumentCheckIcon className="h-3 w-3" />
                        View request →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      )}

      {/* Composer — texts the client from the business line. */}
      {loaded &&
        (recipientPhone ? (
          <div className="border-t border-slate-200 p-3 sm:px-6">
            {error && (
              <p className="mb-2 text-xs text-red-600">{error}</p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendText();
                  }
                }}
                rows={1}
                placeholder={`Text ${deal.ship_to_poc_name || "the client"}…`}
                className="max-h-32 min-h-[38px] flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <button
                onClick={() => void sendText()}
                disabled={sending || !draft.trim()}
                className="inline-flex h-[38px] items-center gap-1 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                {sending ? "…" : "Send"}
              </button>
            </div>
          </div>
        ) : (
          <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400 sm:px-6">
            Add the client&rsquo;s phone on the Client Contact card to text them
            here.
          </p>
        ))}
    </section>
  );
}
