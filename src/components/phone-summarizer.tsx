"use client";

// Phone Call Summarization — paste a call transcript, Claude routes it to a
// project, recaps it, and pulls out action items you can save to the project
// notes in one click. Lives on the Inbox alongside the Email Digester.

import { useState } from "react";
import Link from "next/link";
import {
  PhoneIcon,
  SparklesIcon,
  CheckIcon,
  DocumentPlusIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/lib/auth-context";
import { listDeals, saveDeal } from "@/lib/store";
import type { Deal } from "@/types";
import type { CallSummary } from "@/app/api/phone/summarize/route";

const CONF_STYLE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-600",
};

export default function PhoneSummarizer() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [saved, setSaved] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  // When Claude can't confidently match a project, the user picks one here so
  // the summary is never a dead end.
  const [chosenId, setChosenId] = useState("");

  async function run() {
    if (!transcript.trim() || busy) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    setSaved(false);
    setChosenId("");
    try {
      const ds = profile?.org_ref ? await listDeals(profile.org_ref) : [];
      setDeals(ds);
      const projects = ds.map((d) => ({
        id: d.id,
        name: d.name,
        client: d.account_name || d.poc_name || undefined,
      }));
      const res = await fetch("/api/phone/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, projects }),
      });
      const data = (await res.json()) as { ok: boolean; summary?: CallSummary; error?: string };
      if (!data.ok || !data.summary) setError(data.error || "Couldn't summarize that call.");
      else setSummary(data.summary);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveToProject() {
    if (!summary || savingNote) return;
    const targetId = summary.matched_project_id || chosenId;
    if (!targetId) return;
    const deal = deals.find((d) => d.id === targetId);
    if (!deal) return;
    setSavingNote(true);
    try {
      const stamp = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
      const block =
        `[Call summary — ${stamp}${summary.caller ? ` · ${summary.caller}` : ""}]\n` +
        `${summary.summary ?? ""}` +
        (summary.action_items && summary.action_items.length > 0
          ? `\nAction items:\n${summary.action_items.map((a) => `- ${a}`).join("\n")}`
          : "");
      const nextNotes = deal.notes ? `${deal.notes}\n\n${block}` : block;
      await saveDeal({ ...deal, notes: nextNotes, updated_at: new Date().toISOString() });
      setSaved(true);
    } catch {
      setError("Couldn't save to project notes.");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <PhoneIcon className="h-4 w-4 text-sky-700" />
        <span className="text-sm font-semibold text-slate-900">Summarize a call</span>
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700">
          Add-on
        </span>
        <span className="ml-auto text-xs font-medium text-sky-700">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          <p className="text-xs text-slate-500">
            Paste a call transcript (or notes). Claude routes it to the right
            project, recaps it, and pulls out action items to save to the log.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            placeholder="Paste the call transcript or your notes here…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
              {error}
            </div>
          )}
          <button
            onClick={run}
            disabled={busy || !transcript.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            <SparklesIcon className="h-4 w-4" />
            {busy ? "Summarizing…" : "Summarize call"}
          </button>

          {summary && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Project:</span>
                {summary.matched_project_id ? (
                  <Link href={`/deals/${summary.matched_project_id}`} className="font-medium text-sky-700 hover:underline">
                    {summary.matched_project_name || "View project"}
                  </Link>
                ) : (
                  <span className="text-slate-500">No clear match</span>
                )}
                {summary.confidence && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CONF_STYLE[summary.confidence] ?? CONF_STYLE.low}`}>
                    {summary.confidence}
                  </span>
                )}
                {summary.caller && <span className="text-xs text-slate-500">· {summary.caller}</span>}
              </div>

              {summary.summary && <p className="text-sm text-slate-700">{summary.summary}</p>}

              {summary.action_items && summary.action_items.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Action items</div>
                  <ul className="space-y-1">
                    {summary.action_items.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm text-slate-700">
                        <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sky-600" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!summary.matched_project_id && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    No project matched — pick one to save this to:
                  </label>
                  <select
                    value={chosenId}
                    onChange={(e) => { setChosenId(e.target.value); setSaved(false); }}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">Select a project…</option>
                    {deals.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(summary.matched_project_id || chosenId) && (
                <button
                  onClick={saveToProject}
                  disabled={savingNote || saved}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                    saved ? "bg-emerald-50 text-emerald-700" : "bg-sky-700 text-white hover:bg-sky-800"
                  } disabled:cursor-not-allowed`}
                >
                  {saved ? <CheckIcon className="h-3.5 w-3.5" /> : <DocumentPlusIcon className="h-3.5 w-3.5" />}
                  {saved ? "Saved to project notes" : savingNote ? "Saving…" : "Save to project notes"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
