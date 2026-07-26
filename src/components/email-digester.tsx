"use client";

// Email Digester — paste a forwarded email, Claude routes it to the right
// project and pulls out a summary, action items, and a draft reply. Lives at
// the top of the Inbox.

import { useState } from "react";
import Link from "next/link";
import {
  EnvelopeIcon,
  SparklesIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/lib/auth-context";
import { listDeals } from "@/lib/store";
import type { EmailDigest } from "@/app/api/email/digest/route";

const CONF_STYLE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-600",
};

export default function EmailDigester() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<EmailDigest | null>(null);
  const [reply, setReply] = useState("");
  const [copied, setCopied] = useState(false);

  async function run() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    setDigest(null);
    try {
      const deals = profile?.org_ref ? await listDeals(profile.org_ref) : [];
      const projects = deals.map((d) => ({
        id: d.id,
        name: d.name,
        client: d.account_name || d.poc_name || undefined,
      }));
      const res = await fetch("/api/email/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, projects }),
      });
      const data = (await res.json()) as { ok: boolean; digest?: EmailDigest; error?: string };
      if (!data.ok || !data.digest) {
        setError(data.error || "Couldn't process that email.");
      } else {
        setDigest(data.digest);
        setReply(data.digest.suggested_reply || "");
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyReply() {
    try {
      await navigator.clipboard.writeText(reply);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <EnvelopeIcon className="h-4 w-4 text-sky-700" />
        <span className="text-sm font-semibold text-slate-900">Digest a forwarded email</span>
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700">
          Add-on
        </span>
        <span className="ml-auto text-xs font-medium text-sky-700">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          <p className="text-xs text-slate-500">
            Paste a forwarded client or sub email. Claude routes it to the right
            project and pulls out what needs doing + a reply you can send.
          </p>
          <textarea
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            rows={6}
            placeholder="Paste the full email text here…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
              {error}
            </div>
          )}
          <button
            onClick={run}
            disabled={busy || !email.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            <SparklesIcon className="h-4 w-4" />
            {busy ? "Digesting…" : "Digest email"}
          </button>

          {digest && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {/* routing */}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Project:
                </span>
                {digest.matched_project_id ? (
                  <Link
                    href={`/deals/${digest.matched_project_id}`}
                    className="font-medium text-sky-700 hover:underline"
                  >
                    {digest.matched_project_name || "View project"}
                  </Link>
                ) : (
                  <span className="text-slate-500">No clear match</span>
                )}
                {digest.confidence && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CONF_STYLE[digest.confidence] ?? CONF_STYLE.low}`}>
                    {digest.confidence}
                  </span>
                )}
              </div>

              {digest.summary && <p className="text-sm text-slate-700">{digest.summary}</p>}

              {digest.action_items && digest.action_items.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Action items
                  </div>
                  <ul className="space-y-1">
                    {digest.action_items.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm text-slate-700">
                        <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sky-600" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Draft reply
                  </span>
                  <button
                    onClick={copyReply}
                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                  >
                    {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={5}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
