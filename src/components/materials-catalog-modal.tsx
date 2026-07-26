"use client";

// Materials Sourcing Catalog modal — search priced materials and add them to
// the current estimate in one click. Opened from the quote editor.

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  searchMaterials,
  MATERIAL_TRADES,
  type MaterialItem,
} from "@/lib/catalog/materials";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MaterialsCatalogModal({
  onPick,
  onClose,
}: {
  onPick: (m: MaterialItem) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [trade, setTrade] = useState<string>("");
  const [added, setAdded] = useState<Set<string>>(new Set());

  const results = useMemo(
    () => searchMaterials(q, { trade: trade || undefined, limit: 200 }),
    [q, trade],
  );

  function add(m: MaterialItem) {
    onPick(m);
    setAdded((prev) => new Set(prev).add(m.id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 sm:p-8">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Materials catalog</h2>
            <p className="text-xs text-slate-500">
              Search and add materials to this estimate. Catalog pricing —
              markup applies per your defaults.
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
          <div className="relative min-w-[200px] flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search materials (e.g. stud, OSB, insulation)…"
              className="w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <select
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">All trades</option>
            {MATERIAL_TRADES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">
              No materials match “{q}”.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{m.name}</div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      {m.trade} · per {m.uom}
                    </div>
                  </div>
                  <div className="w-24 text-right text-sm font-semibold tabular-nums text-slate-700">
                    {money(m.unitCostUsd)}
                  </div>
                  <button
                    onClick={() => add(m)}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                      added.has(m.id)
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-sky-700 text-white hover:bg-sky-800"
                    }`}
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    {added.has(m.id) ? "Added" : "Add"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <span className="text-xs text-slate-500">
            {added.size > 0 ? `${added.size} line${added.size === 1 ? "" : "s"} added` : `${results.length} materials`}
          </span>
          <button
            onClick={onClose}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
