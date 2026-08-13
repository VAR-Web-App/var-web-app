"use client";

// In-app annotation / feedback layer (pre-launch QA aid). Toggle it on, tap
// anything in the app, jot a note, and keep going — no context switch. Notes
// capture the page path + a hint about what you tapped, persist to
// localStorage, and export as a clean markdown list to hand off.
//
// Mirrors the tap-to-note tool in RoofWorks. Always mounted in AppShell so
// it's available on every screen during a test run.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatBubbleBottomCenterTextIcon,
  XMarkIcon,
  TrashIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

interface Note {
  id: string;
  text: string;
  path: string;
  hint: string;
  ts: number;
}

const KEY = "kp_annotations";

/** Best-effort label for whatever the user tapped: an accessible name, the
 *  nearest button/link/heading text, else the tag. Trimmed short. */
function describeTarget(el: Element | null): string {
  let node: Element | null = el;
  for (let i = 0; node && i < 5; i++) {
    const aria = node.getAttribute?.("aria-label");
    if (aria) return aria.trim().slice(0, 60);
    if (/^(BUTTON|A|H1|H2|H3|LABEL|SUMMARY)$/.test(node.tagName)) {
      const t = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (t) return t.slice(0, 60);
    }
    node = node.parentElement;
  }
  const t = (el?.textContent || "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 60) : (el?.tagName?.toLowerCase() ?? "page");
}

export default function AnnotationLayer() {
  const { profile } = useAuth();
  const [on, setOn] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number; hint: string } | null>(null);
  const [draftText, setDraftText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load persisted notes once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setNotes(JSON.parse(raw));
    } catch {}
  }, []);

  const persist = useCallback((next: Note[]) => {
    setNotes(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);

  // Capture a tap while in annotate mode.
  const onCapture = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = document.elementFromPoint(e.clientX, e.clientY);
    setDraft({
      x: Math.min(e.clientX, window.innerWidth - 280),
      y: Math.min(e.clientY, window.innerHeight - 140),
      hint: describeTarget(target),
    });
    setDraftText("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  function saveDraft() {
    if (!draft || !draftText.trim()) {
      setDraft(null);
      return;
    }
    const note: Note = {
      id: `${Date.now()}-${notes.length}`,
      text: draftText.trim(),
      path: window.location.pathname,
      hint: draft.hint,
      ts: Date.now(),
    };
    persist([note, ...notes]);
    // Also save to Firestore so every tester's notes land centrally (readable
    // across devices + by the team), not just in this browser. Best-effort —
    // the local copy is the source of truth for the panel.
    void setDoc(doc(db, "feedback", note.id), {
      id: note.id,
      org_ref: profile?.org_ref ?? null,
      user_email: profile?.email ?? null,
      text: note.text,
      path: note.path,
      hint: note.hint,
      created_at: new Date(note.ts).toISOString(),
    }).catch(() => {});
    setDraft(null);
    setDraftText("");
    setToast("Noted");
    setTimeout(() => setToast(null), 1200);
  }

  function copyAll() {
    const byPath = new Map<string, Note[]>();
    for (const n of [...notes].reverse()) {
      (byPath.get(n.path) ?? byPath.set(n.path, []).get(n.path)!).push(n);
    }
    let md = `# Test notes (${notes.length})\n\n`;
    for (const [path, ns] of byPath) {
      md += `## ${path}\n`;
      for (const n of ns) md += `- ${n.text} _(on: ${n.hint})_\n`;
      md += `\n`;
    }
    navigator.clipboard?.writeText(md).then(
      () => { setToast("Copied all notes"); setTimeout(() => setToast(null), 1400); },
      () => {},
    );
  }

  return (
    <>
      {/* Capture overlay — only while annotate mode is on and no draft is open. */}
      {on && !draft && (
        <div
          onClick={onCapture}
          className="fixed inset-0 z-[70] cursor-crosshair"
          style={{ background: "rgba(2,132,199,0.04)" }}
        >
          <div className="pointer-events-none fixed left-1/2 top-3 z-[71] -translate-x-1/2 rounded-full bg-sky-700 px-3 py-1 text-xs font-semibold text-white shadow">
            Tap anything to leave a note · tap the ✕ to stop
          </div>
        </div>
      )}

      {/* Draft note popover at the tap location. */}
      {draft && (
        <div
          className="fixed z-[80] w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
          style={{ left: draft.x, top: draft.y }}
        >
          <p className="mb-1 truncate text-[11px] text-slate-400">on: {draft.hint}</p>
          <input
            ref={inputRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveDraft();
              if (e.key === "Escape") setDraft(null);
            }}
            placeholder="What's the note?"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className="text-xs text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            <button
              onClick={saveDraft}
              className="rounded-md bg-sky-700 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-800"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Notes panel. */}
      {panelOpen && (
        <div className="fixed bottom-24 right-4 z-[80] max-h-[60vh] w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:bottom-20">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-900">Test notes ({notes.length})</span>
            <div className="flex items-center gap-1">
              <button onClick={copyAll} title="Copy all as markdown" className="rounded p-1 text-slate-500 hover:bg-slate-100">
                <ClipboardDocumentIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => { if (confirm("Clear all notes?")) persist([]); }}
                title="Clear all"
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
              <button onClick={() => setPanelOpen(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[48vh] overflow-y-auto p-2">
            {notes.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">
                No notes yet. Turn on annotate mode and tap anything.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs">
                    <p className="text-slate-800">{n.text}</p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                      {n.path} · {n.hint}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white shadow-lg md:bottom-8">
          {toast}
        </div>
      )}

      {/* Floating controls — bottom-right, above the mobile tab bar. */}
      <div className="fixed bottom-20 right-4 z-[75] flex flex-col items-end gap-2 md:bottom-6">
        {notes.length > 0 && !panelOpen && (
          <button
            onClick={() => setPanelOpen(true)}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {notes.length} note{notes.length === 1 ? "" : "s"}
          </button>
        )}
        <button
          onClick={() => { setOn((v) => !v); setDraft(null); }}
          title={on ? "Stop annotating" : "Leave test notes"}
          className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors ${
            on ? "bg-red-600 text-white hover:bg-red-700" : "bg-sky-700 text-white hover:bg-sky-800"
          }`}
        >
          {on ? <XMarkIcon className="h-5 w-5" /> : <ChatBubbleBottomCenterTextIcon className="h-5 w-5" />}
        </button>
      </div>
    </>
  );
}
