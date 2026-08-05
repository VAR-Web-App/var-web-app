"use client";

// Inline reply composer. Email threads send from the builder's connected
// inbox via /api/unipile/send; SMS threads send from the org's business line
// via /api/telnyx/send. Either way the reply is threaded and recorded on the
// deal. Email: a read-only inbox prompts a reconnect. SMS: a not-yet-approved
// A2P campaign explains the wait.

import { useState } from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { auth } from "@/lib/firebase";

export default function ReplyBox({
  to,
  subject,
  replyTo,
  dealRef,
  threadId,
  channel = "email",
  onSent,
}: {
  to: string;
  subject: string;
  replyTo?: string;
  dealRef?: string | null;
  threadId?: string;
  channel?: "email" | "sms";
  onSent?: () => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSms = channel === "sms";

  async function send() {
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const endpoint = isSms ? "/api/telnyx/send" : "/api/unipile/send";
      const payload = isSms
        ? { to, body, dealRef, threadId }
        : { to, subject, body, replyTo, dealRef, threadId };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const d = (await res.json()) as {
        ok: boolean;
        error?: string;
        needsReconnect?: boolean;
        pendingA2p?: boolean;
      };
      if (d.ok) {
        setSent(true);
        onSent?.();
      } else if (isSms) {
        setError(
          d.pendingA2p
            ? "Texting isn't live yet — your carrier registration (A2P) is still being approved. Inbound texts work now; replies will send once it clears."
            : d.error === "no_business_line"
              ? "No business text line is set up for your account yet."
              : d.error || "Couldn't send the text",
        );
      } else {
        setError(
          d.needsReconnect
            ? "Your inbox is connected read-only — reconnect it (on the Inbox) to enable sending."
            : d.error || "Couldn't send the reply",
        );
      }
    } catch {
      setError(isSms ? "Couldn't send the text" : "Couldn't send the reply");
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
