"use client";

// "How to use this page" — a dismissible guide card at the top of each
// builder-facing action page. Explains what the page does and the key moves,
// so a first-time user (or Barry on a walkthrough) always has orientation.
// Dismissal is remembered per-page in localStorage; once dismissed it collapses
// to a small "How to use this page" reopener so it's never gone for good.
//
// Builder pages only — client/sub/designer portal views don't get it.

import { useEffect, useState } from "react";
import {
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export default function PageGuide({
  id,
  title,
  what,
  steps,
}: {
  /** Stable per-page key for remembering dismissal. */
  id: string;
  /** Page name, e.g. "Inbox". */
  title: string;
  /** One line: what this page is for. */
  what: string;
  /** The key things you can do here. */
  steps: string[];
}) {
  const key = `pageguide.${id}`;
  // Start collapsed to avoid a flash before we read localStorage; the effect
  // opens it on first visit (when nothing's stored yet).
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOpen(localStorage.getItem(key) !== "1");
    setReady(true);
  }, [key]);

  if (!ready) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-sky-700"
      >
        <InformationCircleIcon className="h-4 w-4" />
        How to use this page
      </button>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50/70 p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {title} — what this page does
          </p>
          <p className="mt-0.5 text-sm text-slate-700">{what}</p>
          {steps.length > 0 && (
            <ul className="mt-2 space-y-1">
              {steps.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-xs text-slate-600"
                >
                  <span className="mt-0.5 font-bold text-sky-600">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={() => {
            localStorage.setItem(key, "1");
            setOpen(false);
          }}
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600"
          title="Got it — hide this"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
