"use client";

// Named-scenario chip strip for the quote page. Sits above the totals
// bar so the GC can switch between "Standard / Premium / Budget" at
// the kitchen table with the client without losing their place.
//
// One chip per saved scenario + a "+ Save as new" tile. Active chip
// has a sky outline + checkmark. Per-chip menu (kebab) exposes
// rename + delete. Switching loads the scenario's full estimate
// state — assemblies, quote lines, soft costs — back into the
// working draft.

import { useEffect, useRef, useState } from "react";
import {
  CheckCircleIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import type { QuoteScenario } from "@/types";

const fmtMoney = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

export default function ScenariosBar({
  scenarios,
  activeScenarioId,
  hasUnsavedChanges,
  onSaveAsNew,
  onSwitch,
  onRename,
  onDelete,
  onUpdateActive,
}: {
  scenarios: QuoteScenario[];
  activeScenarioId: string | undefined;
  /** True when the working state differs from the active scenario's
   *  snapshot — drives the "unsaved changes" pill + the switch
   *  confirmation prompt. */
  hasUnsavedChanges: boolean;
  onSaveAsNew: (name: string) => void;
  onSwitch: (scenarioId: string) => void;
  onRename: (scenarioId: string, name: string) => void;
  onDelete: (scenarioId: string) => void;
  /** Sync the current working state back into the active scenario's
   *  snapshot. Triggered by the "Update {name}" button when there
   *  are unsaved edits and a scenario is active. */
  onUpdateActive: () => void;
}) {
  const [savingNew, setSavingNew] = useState(false);
  const [newName, setNewName] = useState("");

  function commitSave() {
    const clean = newName.trim();
    if (!clean) {
      setSavingNew(false);
      setNewName("");
      return;
    }
    onSaveAsNew(clean);
    setSavingNew(false);
    setNewName("");
  }

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Scenarios
        </span>

        {scenarios.length === 0 ? (
          <span className="text-xs italic text-slate-400">
            No saved scenarios yet.
          </span>
        ) : (
          scenarios.map((s) => (
            <ScenarioChip
              key={s.id}
              scenario={s}
              isActive={s.id === activeScenarioId}
              hasUnsavedChanges={
                s.id === activeScenarioId && hasUnsavedChanges
              }
              onSelect={() => onSwitch(s.id)}
              onRename={(name) => onRename(s.id, name)}
              onDelete={() => onDelete(s.id)}
            />
          ))
        )}

        {savingNew ? (
          <span className="inline-flex items-center gap-1 rounded-lg border border-sky-500 bg-white px-3 py-1.5">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={commitSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSave();
                if (e.key === "Escape") {
                  setSavingNew(false);
                  setNewName("");
                }
              }}
              placeholder="Standard / Premium / Budget"
              className="w-44 bg-transparent text-xs font-semibold text-slate-900 focus:outline-none"
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setSavingNew(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-sky-500 hover:bg-sky-50 hover:text-sky-700"
            title="Save the current estimate state as a new named scenario"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Save current as…
          </button>
        )}

        {activeScenario && hasUnsavedChanges && (
          <button
            type="button"
            onClick={onUpdateActive}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
            title={`Sync your current edits back into "${activeScenario.name}"`}
          >
            Update {activeScenario.name}
          </button>
        )}
      </div>
    </section>
  );
}

function ScenarioChip({
  scenario,
  isActive,
  hasUnsavedChanges,
  onSelect,
  onRename,
  onDelete,
}: {
  scenario: QuoteScenario;
  isActive: boolean;
  hasUnsavedChanges: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(scenario.name);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  if (renaming) {
    return (
      <span className="inline-flex items-center rounded-lg border border-sky-500 bg-white px-3 py-1.5">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const clean = draft.trim() || scenario.name;
            onRename(clean);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(scenario.name);
              setRenaming(false);
            }
          }}
          className="w-32 bg-transparent text-xs font-semibold text-slate-900 focus:outline-none"
        />
      </span>
    );
  }

  return (
    <span
      ref={rootRef}
      className={
        "group relative inline-flex items-stretch overflow-visible rounded-lg border transition-colors " +
        (isActive
          ? "border-sky-600 bg-sky-50 text-sky-900 ring-1 ring-sky-600"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50")
      }
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-1.5 px-3 py-1.5 text-left"
      >
        {isActive && <CheckCircleIcon className="h-3.5 w-3.5 text-sky-700" />}
        <span className="text-xs font-semibold">{scenario.name}</span>
        <span className="text-[11px] tabular-nums text-slate-500">
          {fmtMoney(scenario.total_quote_value)}
        </span>
        {hasUnsavedChanges && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-amber-500"
            title="Unsaved changes in this scenario"
          />
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        aria-label="Scenario menu"
        className="border-l border-slate-200 px-2 text-slate-400 hover:text-slate-700"
      >
        <EllipsisHorizontalIcon className="h-4 w-4" />
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setDraft(scenario.name);
              setRenaming(true);
            }}
            className="block w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-50"
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              if (
                confirm(
                  `Delete scenario "${scenario.name}"? This can't be undone.`,
                )
              ) {
                onDelete();
              }
            }}
            className="block w-full border-t border-slate-100 px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"
          >
            Delete
          </button>
        </div>
      )}
    </span>
  );
}
