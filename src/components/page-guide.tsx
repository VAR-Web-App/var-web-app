"use client";

// "How to use this page" — a guide card at the top of each builder-facing
// action page. Explains what the page does and the key moves. Visibility is
// controlled by ONE global toggle (default on) — see lib/page-guides + the
// sidebar switch — so a user turns them all on/off in one place.
//
// Builder pages only — client/sub/designer portal views don't get it.

import { useEffect, useState } from "react";
import { InformationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  getPageGuidesOn,
  setPageGuidesOn,
  onPageGuidesChange,
} from "@/lib/page-guides";

export default function PageGuide({
  title,
  what,
  steps,
}: {
  /** Stable per-page key (kept for call-site clarity; not used for storage). */
  id: string;
  /** Page name, e.g. "Inbox". */
  title: string;
  /** One line: what this page is for. */
  what: string;
  /** The key things you can do here. */
  steps: string[];
}) {
  const [on, setOn] = useState(false); // hidden until we read the pref
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setOn(getPageGuidesOn());
    sync();
    setReady(true);
    return onPageGuidesChange(sync);
  }, []);

  if (!ready || !on) return null;

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
          onClick={() => setPageGuidesOn(false)}
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600"
          title="Hide page guides (turn back on from the sidebar)"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
