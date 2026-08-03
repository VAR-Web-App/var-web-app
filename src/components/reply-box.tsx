"use client";

// Inline reply composer — sends from the builder's connected inbox via
// /api/unipile/send (threads the reply, records it on the deal). If the inbox
// was connected read-only, the send fails with a reconnect prompt.

import { useState } from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { auth } from "@/lib/firebase";

export default function ReplyBox({
  to,
  subject,
  replyTo,
  dealRef,
  threadId,
  onSent,
}: {
  to: string;
  subject: string;
  replyTo?: string;
  dealRef?: string | null;
  threadId?: string;
  onSent?: () => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/unipile/send", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ to, subject, body, replyTo, dealRef, threadId }),
      });
      const d = (await res.json()) as {
        ok: boolean;
        error?: string;
        needsReconnect?: boolean;
      };
      if (d.ok) {
        setSent(true);
        onSent?.();
      } else {
        setError(
          d.needsReconnect
            ? "Your inbox is connected read-only — reconnect it (on the Inbox) to enable sending."
            : d.error || "Couldn't send the reply",
        );
      }
    } catch {
      setError("Couldn't send the reply");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <p className="text-xs font-medium text-emerald-700">✓ Reply sent to {to}</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Reply to <span className="font-medium text-slate-700">{to}</span>
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Type your reply…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void send()}
          disabled={sending || !body.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          <PaperAirplaneIcon className="h-3.5 w-3.5" />
          {sending ? "Sending…" : "Send reply"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
