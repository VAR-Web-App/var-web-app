"use client";

// Settings card — per-builder cost multipliers on the assembly catalog.
//
// The stub catalog ships with national-average pricing. A builder in
// Austin where labor runs 20% above national average sets the global
// labor multiplier to 1.20 and every assembly's labor cost on every
// project scales up. Per-assembly fine-tuning ("my carpet specifically
// is 1.4× because I use a premium installer") stacks on top.
//
// Apply order in computeMaterials():
//   final = base × per_assembly × global
//
// Defaults are 1.0 (no change) everywhere. Reset button blanks the
// whole override block — equivalent to "use catalog as authored."

import { useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { STUB_ASSEMBLIES } from "@/lib/assemblies/stub-catalog";
import type { Assembly } from "@/types/assembly";
import type { ExtraMaterial, OrgSettings } from "@/types";

type Overrides = NonNullable<OrgSettings["cost_overrides"]>;
type PerAssembly = NonNullable<Overrides["per_assembly"]>;
type PerAssemblyEntry = PerAssembly[string];

export default function AssemblyCostOverridesCard({
  value,
  onChange,
}: {
  value: Overrides | undefined;
  onChange: (next: Overrides | undefined) => void;
}) {
  const overrides = value ?? {};
  const perAssembly: PerAssembly = overrides.per_assembly ?? {};
  // Materials editor is one assembly at a time; null = closed.
  const [materialsOpenFor, setMaterialsOpenFor] = useState<string | null>(null);

  // Group assemblies by trade so the override list matches the quote
  // page's structure. One collapsible group per trade.
  const byTrade = useMemo(() => {
    const m = new Map<string, typeof STUB_ASSEMBLIES>();
    for (const a of STUB_ASSEMBLIES) {
      const arr = m.get(a.trade) ?? [];
      arr.push(a);
      m.set(a.trade, arr);
    }
    return m;
  }, []);

  function setGlobal(
    key: "global_material_multiplier" | "global_labor_multiplier",
    v: number | undefined,
  ) {
    const next: Overrides = { ...overrides };
    if (v == null || v === 1) {
      delete next[key];
    } else {
      next[key] = v;
    }
    emit(next);
  }

  function setPerAssembly(
    assemblyId: string,
    key: "material_multiplier" | "labor_multiplier",
    v: number | undefined,
  ) {
    const nextPer: PerAssembly = { ...perAssembly };
    const entry = { ...(nextPer[assemblyId] ?? {}) };
    if (v == null || v === 1) {
      delete entry[key];
    } else {
      entry[key] = v;
    }
    if (Object.keys(entry).length === 0) {
      delete nextPer[assemblyId];
    } else {
      nextPer[assemblyId] = entry;
    }
    const next: Overrides = { ...overrides };
    if (Object.keys(nextPer).length === 0) {
      delete next.per_assembly;
    } else {
      next.per_assembly = nextPer;
    }
    emit(next);
  }

  function setMaterialEdits(
    assemblyId: string,
    removed: string[],
    extras: ExtraMaterial[],
    lineFactors: Record<string, number>,
  ) {
    const nextPer: PerAssembly = { ...perAssembly };
    const entry: PerAssemblyEntry = { ...(nextPer[assemblyId] ?? {}) };
    if (removed.length === 0) {
      delete entry.removed_materials;
    } else {
      entry.removed_materials = removed;
    }
    if (extras.length === 0) {
      delete entry.extra_materials;
    } else {
      entry.extra_materials = extras;
    }
    // line_overrides: store one entry per line with a non-default factor.
    const lineOverrides: Record<string, { quantity_factor?: number }> = {};
    for (const [name, factor] of Object.entries(lineFactors)) {
      if (factor !== 1) lineOverrides[name] = { quantity_factor: factor };
    }
    if (Object.keys(lineOverrides).length === 0) {
      delete entry.line_overrides;
    } else {
      entry.line_overrides = lineOverrides;
    }
    if (Object.keys(entry).length === 0) {
      delete nextPer[assemblyId];
    } else {
      nextPer[assemblyId] = entry;
    }
    const next: Overrides = { ...overrides };
    if (Object.keys(nextPer).length === 0) {
      delete next.per_assembly;
    } else {
      next.per_assembly = nextPer;
    }
    emit(next);
  }

  function emit(next: Overrides) {
    // If the block reduces to nothing, drop it from settings so the
    // doc stays tidy.
    if (
      next.global_material_multiplier == null &&
      next.global_labor_multiplier == null &&
      (!next.per_assembly || Object.keys(next.per_assembly).length === 0)
    ) {
      onChange(undefined);
    } else {
      onChange(next);
    }
  }

  function resetAll() {
    if (
      !confirm(
        "Reset all assembly cost overrides to defaults (1.0×)? This affects every project's estimate going forward.",
      )
    )
      return;
    onChange(undefined);
  }

  const overrideCount =
    (overrides.global_material_multiplier != null ? 1 : 0) +
    (overrides.global_labor_multiplier != null ? 1 : 0) +
    Object.values(perAssembly).reduce(
      (s, e) =>
        s +
        (e.material_multiplier != null ? 1 : 0) +
        (e.labor_multiplier != null ? 1 : 0),
      0,
    );

  return (
    <div className="space-y-5">
      {/* Global multipliers */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Global multipliers
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Applied to every assembly in your catalog. Set both to 1.20 if your
          market runs 20% above the catalog&apos;s national-average pricing.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <MultiplierInput
            label="Material ×"
            value={overrides.global_material_multiplier}
            onChange={(v) => setGlobal("global_material_multiplier", v)}
          />
          <MultiplierInput
            label="Labor ×"
            value={overrides.global_labor_multiplier}
            onChange={(v) => setGlobal("global_labor_multiplier", v)}
          />
        </div>
      </div>

      {/* Per-assembly table, grouped by trade */}
      <div>
        <div className="flex items-baseline justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Per-assembly fine-tuning
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Stacks on top of the global multipliers. Leave at 1× unless a
              specific assembly&apos;s pricing diverges from the global trend.
            </p>
          </div>
          {overrideCount > 0 && (
            <button
              type="button"
              onClick={resetAll}
              className="text-xs font-medium text-slate-500 hover:text-rose-600"
              title={`${overrideCount} override${overrideCount === 1 ? "" : "s"} set`}
            >
              Reset all
            </button>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {Array.from(byTrade.entries()).map(([trade, items]) => (
            <TradeGroup
              key={trade}
              trade={trade}
              items={items}
              perAssembly={perAssembly}
              onSet={setPerAssembly}
              onOpenMaterials={(id) => setMaterialsOpenFor(id)}
            />
          ))}
        </div>
      </div>

      {/* Materials editor modal — opened from any per-assembly row. */}
      {materialsOpenFor && (
        <MaterialsEditorModal
          assembly={
            STUB_ASSEMBLIES.find((a) => a.id === materialsOpenFor) ?? null
          }
          entry={perAssembly[materialsOpenFor] ?? {}}
          onSave={(removed, extras, lineFactors) =>
            setMaterialEdits(materialsOpenFor, removed, extras, lineFactors)
          }
          onClose={() => setMaterialsOpenFor(null)}
        />
      )}
    </div>
  );
}

function TradeGroup({
  trade,
  items,
  perAssembly,
  onSet,
  onOpenMaterials,
}: {
  trade: string;
  items: typeof STUB_ASSEMBLIES;
  perAssembly: PerAssembly;
  onSet: (
    assemblyId: string,
    key: "material_multiplier" | "labor_multiplier",
    v: number | undefined,
  ) => void;
  onOpenMaterials: (assemblyId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tradeOverrides = items.filter((a) => {
    const e = perAssembly[a.id];
    return (
      e?.material_multiplier != null ||
      e?.labor_multiplier != null ||
      (e?.removed_materials && e.removed_materials.length > 0) ||
      (e?.extra_materials && e.extra_materials.length > 0) ||
      (e?.line_overrides && Object.keys(e.line_overrides).length > 0)
    );
  }).length;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDownIcon className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-slate-500" />
        )}
        <span className="text-sm font-semibold capitalize text-slate-900">
          {trade}
        </span>
        <span className="text-xs text-slate-500">
          {items.length} assembl{items.length === 1 ? "y" : "ies"}
        </span>
        {tradeOverrides > 0 && (
          <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
            {tradeOverrides} tuned
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Assembly</th>
                <th className="px-3 py-2 text-right">Material ×</th>
                <th className="px-3 py-2 text-right">Labor ×</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((a) => {
                const e = perAssembly[a.id] ?? {};
                const lineEditCount =
                  (e.removed_materials?.length ?? 0) +
                  (e.extra_materials?.length ?? 0) +
                  Object.keys(e.line_overrides ?? {}).length;
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-900">{a.name}</td>
                    <td className="px-3 py-2 text-right">
                      <MultiplierInput
                        value={e.material_multiplier}
                        onChange={(v) => onSet(a.id, "material_multiplier", v)}
                        compact
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MultiplierInput
                        value={e.labor_multiplier}
                        onChange={(v) => onSet(a.id, "labor_multiplier", v)}
                        compact
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenMaterials(a.id)}
                        className="text-[11px] font-medium text-sky-700 hover:text-sky-900"
                        title="Add or remove material lines on this assembly"
                      >
                        Materials
                        {lineEditCount > 0 && (
                          <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-sky-700">
                            {lineEditCount}
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MultiplierInput({
  value,
  onChange,
  label,
  compact,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  label?: string;
  compact?: boolean;
}) {
  // Local string state so the input handles incremental typing
  // (1, 1., 1.2) without parent re-render fighting the cursor.
  const display = value != null ? String(value) : "";
  function commit(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onChange(undefined);
      return;
    }
    const parsed = parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      onChange(undefined);
      return;
    }
    onChange(parsed);
  }
  return (
    <label
      className={
        compact
          ? "inline-flex items-center"
          : "block"
      }
    >
      {label && (
        <span className="mb-1 block text-xs font-medium text-slate-700">
          {label}
        </span>
      )}
      <input
        type="number"
        step="0.01"
        min="0.1"
        max="10"
        defaultValue={display}
        onBlur={(e) => commit(e.target.value)}
        placeholder="1.00"
        className={
          compact
            ? "w-20 rounded border border-slate-300 px-2 py-1 text-right text-xs tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            : "w-full rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        }
      />
    </label>
  );
}

/**
 * Modal to edit the material lines on one assembly — remove stock
 * lines, append new ones. Quantities can either be static (just a
 * base number) or proportional to one of the assembly's properties
 * (e.g. vapor barrier = Floor Area × 1.10). Costs are flat unit costs
 * here; the global + per-assembly multipliers still apply on top
 * during compute.
 */
function MaterialsEditorModal({
  assembly,
  entry,
  onSave,
  onClose,
}: {
  assembly: Assembly | null;
  entry: PerAssemblyEntry;
  onSave: (
    removed: string[],
    extras: ExtraMaterial[],
    lineFactors: Record<string, number>,
  ) => void;
  onClose: () => void;
}) {
  const [removed, setRemoved] = useState<Set<string>>(
    new Set(entry.removed_materials ?? []),
  );
  const [extras, setExtras] = useState<ExtraMaterial[]>(
    entry.extra_materials ?? [],
  );
  // Per-stock-line quantity factor map. Empty = no overrides; values
  // !== 1 are real overrides applied during compute.
  const [lineFactors, setLineFactors] = useState<Record<string, number>>(
    () => {
      const out: Record<string, number> = {};
      const lo = entry.line_overrides ?? {};
      for (const [name, ov] of Object.entries(lo)) {
        if (ov?.quantity_factor != null && ov.quantity_factor !== 1) {
          out[name] = ov.quantity_factor;
        }
      }
      return out;
    },
  );

  function updateLineFactor(name: string, factor: number | undefined) {
    setLineFactors((prev) => {
      const next = { ...prev };
      if (factor == null || factor === 1) {
        delete next[name];
      } else {
        next[name] = factor;
      }
      return next;
    });
  }

  // AI-assist state — safety net for the 5% case where the simple
  // schema (base qty + scale property × multiplier) is hard to set
  // up by hand. Builder describes in plain English; Claude returns
  // suggested field values that prepend as an editable new line.
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);

  // Number properties become eligible scale targets — option/choice
  // properties don't make sense to scale a quantity by (they're cost
  // multipliers, not unit counts).
  const scaleableProperties = useMemo(() => {
    if (!assembly) return [];
    return assembly.properties.filter(
      (p) => p.kind !== "option" && p.kind !== "choice",
    );
  }, [assembly]);

  if (!assembly) return null;

  function toggleRemoved(name: string) {
    const next = new Set(removed);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setRemoved(next);
  }

  function updateExtra(idx: number, patch: Partial<ExtraMaterial>) {
    setExtras(extras.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  function addExtra() {
    setExtras([
      ...extras,
      {
        name: "",
        uom: "EA",
        base_quantity: 1,
        unit_cost_usd: 0,
      },
    ]);
  }

  async function askAi() {
    if (!assembly || !aiInput.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    setAiReasoning(null);
    try {
      const res = await fetch("/api/assembly/ai-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assembly_id: assembly.id,
          description: aiInput.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        suggestion?: ExtraMaterial & { reasoning?: string };
        error?: string;
      };
      if (!res.ok || !data.ok || !data.suggestion) {
        setAiError(
          data.error === "not_configured"
            ? "AI assist isn't configured — set ANTHROPIC_API_KEY."
            : "Couldn't get a suggestion. Try a more specific description.",
        );
        return;
      }
      const { reasoning, ...fields } = data.suggestion;
      // Prepend the suggested line so the builder sees it immediately
      // at the top of the extras list, where it's easy to review + edit.
      setExtras([fields, ...extras]);
      setAiReasoning(reasoning ?? null);
      setAiInput("");
    } catch {
      setAiError("Network error — try again.");
    } finally {
      setAiBusy(false);
    }
  }

  function removeExtra(idx: number) {
    setExtras(extras.filter((_, i) => i !== idx));
  }

  function save() {
    const cleanExtras = extras
      .map((e) => ({
        ...e,
        name: e.name.trim(),
        uom: e.uom.trim() || "EA",
      }))
      .filter((e) => e.name && e.unit_cost_usd >= 0);
    onSave(Array.from(removed), cleanExtras, lineFactors);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-3xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Materials — {assembly.name}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Edits apply to every project that uses this assembly. Stock
              lines you uncheck stop being included; lines you add appear
              after the stock set.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Stock lines */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Stock lines
            </h4>
            <p className="mt-0.5 text-xs text-slate-500">
              Uncheck a line to suppress it from this assembly&apos;s output.
              Or set <strong>Qty ×</strong> to scale the stock quantity for
              this org — e.g. 1.05 = 5% more material than the catalog
              defaults (handy when your crew&apos;s waste differs).
            </p>
            <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
              {assembly.materials.map((m) => {
                const isRemoved = removed.has(m.name);
                const factor = lineFactors[m.name];
                return (
                  <li
                    key={m.name}
                    className={`flex items-start gap-3 px-3 py-2 ${
                      isRemoved ? "bg-slate-50" : "bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!isRemoved}
                      onChange={() => toggleRemoved(m.name)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-sky-700"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium ${
                          isRemoved
                            ? "text-slate-400 line-through"
                            : "text-slate-900"
                        }`}
                      >
                        {m.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Quantity: <code>{m.quantityFormula}</code>
                        {m.uom && ` ${m.uom}`}
                        {factor && factor !== 1 && (
                          <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                            × {factor}
                          </span>
                        )}
                      </p>
                    </div>
                    {!isRemoved && (
                      <label
                        className="flex flex-col items-end gap-1"
                        title="Per-stock-line quantity multiplier. 1.00 = no change. 1.05 = add 5% extra material (e.g. for higher waste than the catalog assumes)."
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Qty ×
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.1"
                          max="10"
                          defaultValue={factor != null ? String(factor) : ""}
                          placeholder="1.00"
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            if (raw === "")
                              return updateLineFactor(m.name, undefined);
                            const parsed = parseFloat(raw);
                            updateLineFactor(
                              m.name,
                              Number.isFinite(parsed) && parsed > 0
                                ? parsed
                                : undefined,
                            );
                          }}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-xs tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Extras */}
          <section>
            <div className="flex items-baseline justify-between">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Add custom lines
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  Set a quantity by either a fixed number, or by scaling
                  off one of this assembly&apos;s properties. Example:{" "}
                  <em>vapor barrier × 1.10 of Floor Area = 10% waste</em>.
                </p>
              </div>
              <button
                type="button"
                onClick={addExtra}
                className="inline-flex items-center gap-1 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add line
              </button>
            </div>

            {/* AI-assist — describe in plain English, get pre-filled
             *  field values. Safety net only; most cases should be
             *  handled by the curated catalog or hand-authoring. */}
            <div className="mt-3 rounded-md border border-violet-200 bg-violet-50 p-3">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-violet-900">
                  ✨ AI assist
                </span>
                <span className="text-[10px] text-violet-700">
                  describe what you want, Claude fills the fields
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !aiBusy) {
                      e.preventDefault();
                      void askAi();
                    }
                  }}
                  placeholder="e.g. vapor barrier under slab, $0.45/SF, scales with floor area + 10% waste"
                  disabled={aiBusy}
                  className="min-w-0 flex-1 rounded-md border border-violet-300 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:bg-slate-100"
                />
                <button
                  type="button"
                  onClick={() => void askAi()}
                  disabled={aiBusy || !aiInput.trim()}
                  className="shrink-0 rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-violet-300"
                >
                  {aiBusy ? "Thinking…" : "Suggest"}
                </button>
              </div>
              {aiReasoning && (
                <p className="mt-2 text-[11px] italic text-violet-800">
                  {aiReasoning}
                </p>
              )}
              {aiError && (
                <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 ring-1 ring-red-200">
                  {aiError}
                </p>
              )}
            </div>
            {extras.length === 0 ? (
              <p className="mt-2 rounded-md border-2 border-dashed border-slate-200 p-4 text-center text-xs italic text-slate-400">
                No custom lines yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {extras.map((x, idx) => (
                  <li
                    key={idx}
                    className="rounded-md border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <LabeledInput
                        label="Name"
                        value={x.name}
                        onChange={(v) => updateExtra(idx, { name: v })}
                        placeholder="e.g. Vapor barrier"
                      />
                      <LabeledInput
                        label="UoM"
                        value={x.uom}
                        onChange={(v) => updateExtra(idx, { uom: v })}
                        placeholder="EA / SF / LF"
                      />
                      <LabeledNumber
                        label="Base qty"
                        value={x.base_quantity}
                        onChange={(v) =>
                          updateExtra(idx, { base_quantity: v ?? 0 })
                        }
                      />
                      <div>
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Scale by property
                        </span>
                        <select
                          value={x.scale_property ?? ""}
                          onChange={(e) =>
                            updateExtra(idx, {
                              scale_property: e.target.value || undefined,
                            })
                          }
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                        >
                          <option value="">— (static quantity only)</option>
                          {scaleableProperties.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name} ({p.uom})
                            </option>
                          ))}
                        </select>
                      </div>
                      <LabeledNumber
                        label={
                          x.scale_property
                            ? `Multiplier on ${x.scale_property}`
                            : "Multiplier (only used when scaling)"
                        }
                        value={x.scale_multiplier}
                        onChange={(v) =>
                          updateExtra(idx, { scale_multiplier: v })
                        }
                        placeholder="1.0"
                      />
                      <LabeledNumber
                        label="Unit cost ($)"
                        value={x.unit_cost_usd}
                        onChange={(v) =>
                          updateExtra(idx, { unit_cost_usd: v ?? 0 })
                        }
                      />
                      <LabeledNumber
                        label="Labor cost ($)"
                        value={x.labor_cost_usd}
                        onChange={(v) =>
                          updateExtra(idx, { labor_cost_usd: v })
                        }
                      />
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeExtra(idx)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:text-rose-800"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Remove line
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </label>
  );
}

function LabeledNumber({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <input
        type="number"
        step="0.01"
        defaultValue={value != null ? String(value) : ""}
        onBlur={(e) => {
          const trimmed = e.target.value.trim();
          if (trimmed === "") return onChange(undefined);
          const parsed = parseFloat(trimmed);
          onChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
        placeholder={placeholder ?? "0"}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </label>
  );
}
