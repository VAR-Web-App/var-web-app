"use client";

// Collapses a panel's deep row-level list behind a summary + toggle, so the
// Finances tab shows counts by default and expands the table on demand
// (UX_PRINCIPLES: collapse supporting detail, never the summary/alert). The
// panel's header, tiles, and alerts stay above this and are always visible.

import { useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

export default function CollapsibleDetail({
  summary,
  defaultOpen = false,
  children,
}: {
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
      >
        <span>{summary}</span>
        <span className="flex items-center gap-1 text-sky-700">
          {open ? "Hide" : "Show"}
          <ChevronDownIcon
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
