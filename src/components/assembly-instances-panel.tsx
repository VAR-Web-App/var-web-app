"use client";

import { useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  findStubAssembly,
  STUB_ASSEMBLIES,
} from "@/lib/assemblies/stub-catalog";
import { computeMaterials } from "@/lib/assemblies/compute";
import type {
  Assembly,
  AssemblyInstance,
  AssemblyProperty,
} from "@/types/assembly";

/** Roll up an instance to a single dollar total via the shared compute. */
function instanceTotal(instance: AssemblyInstance): number {
  const assembly = findStubAssembly(instance.assemblyId);
  if (!assembly) return 0;
  const propertyMap = Object.fromEntries(
    instance.propertyValues.map((p) => [p.name, p.value]),
  );
  return computeMaterials(assembly, propertyMap).total;
}

/**
 * Live-editable list of assembly instances on a quote.
 *
 * Built for the "Barry is sitting with a client" scenario: tweak
 * properties (stud spacing, slab thickness, roof pitch) and the
 * derived QuoteLines regenerate live so the client sees the cost
 * update in real time.
 *
 * State of the underlying instances + lines is owned by the parent
 * (quote page); this component is a controlled view.
 */
export default function AssemblyInstancesPanel({
  instances,
  onChange,
  onRemove,
  onSwap,
  onDuplicate,
}: {
  instances: AssemblyInstance[];
  onChange: (next: AssemblyInstance) => void;
  onRemove: (instanceId: string) => void;
  /** Swap an instance to a different assembly definition (e.g. vinyl → wood window family). */
  onSwap: (instanceId: string, newAssemblyId: string) => void;
  /** Clone an instance into a sibling for side-by-side what-if comparison. */
  onDuplicate: (instanceId: string) => void;
}) {
  if (instances.length === 0) return null;

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Assemblies on this quote
        </h2>
        <span className="text-xs text-slate-500">
          Live edits regenerate the linked line items below.
        </span>
      </header>
      <AssemblyComparisonHeader instances={instances} />
      <div className="space-y-3">
        {instances.map((instance, idx) => (
          <AssemblyInstanceCard
            key={instance.id}
            instance={instance}
            onChange={onChange}
            onRemove={() => onRemove(instance.id)}
            onSwap={(newAssemblyId) => onSwap(instance.id, newAssemblyId)}
            onDuplicate={() => onDuplicate(instance.id)}
            // Smart default: keep all open with 3 or fewer instances;
            // beyond that, start everything collapsed so a 13-assembly
            // floor-plan import doesn't blow out the scroll height.
            defaultCollapsed={instances.length > 3 && idx > 0}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * "Option A vs Option B" delta widget. Shown above the instance cards when
 * 2+ assemblies are on the quote. Defaults A and B to the first two
 * instances so the comparison populates as soon as Barry duplicates one;
 * either side can be repointed from the dropdown.
 */
function AssemblyComparisonHeader({
  instances,
}: {
  instances: AssemblyInstance[];
}) {
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);
  // Open by default when there are exactly 2 instances (the "Barry just
  // duplicated one" case where compare is what the user wants). Closed
  // when there are many instances — opening eats screen real estate and
  // is only situationally useful in that mode.
  const [open, setOpen] = useState<boolean>(instances.length === 2);

  const a = useMemo(() => {
    const picked = instances.find((i) => i.id === aId);
    return picked ?? instances[0] ?? null;
  }, [instances, aId]);

  const b = useMemo(() => {
    const picked = instances.find((i) => i.id === bId);
    if (picked) return picked;
    const fallback = instances.find((i) => i.id !== a?.id) ?? instances[1];
    return fallback ?? null;
  }, [instances, bId, a]);

  const aTotal = useMemo(() => (a ? instanceTotal(a) : 0), [a]);
  const bTotal = useMemo(() => (b ? instanceTotal(b) : 0), [b]);

  if (instances.length < 2 || !a || !b) return null;

  const delta = bTotal - aTotal;
  const deltaPct = aTotal > 0 ? (delta / aTotal) * 100 : 0;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const absDelta = Math.abs(delta);

  const deltaColor =
    delta < -0.005
      ? "text-emerald-700"
      : delta > 0.005
        ? "text-amber-700"
        : "text-slate-500";
  const deltaBg =
    delta < -0.005
      ? "bg-emerald-50 border-emerald-200"
      : delta > 0.005
        ? "bg-amber-50 border-amber-200"
        : "bg-slate-50 border-slate-200";

  // Collapsed header — single row with the delta peek-through so the
  // builder can decide whether to expand without losing the info.
  const collapsedSummary =
    absDelta < 0.005
      ? "Same price"
      : `${sign}$${absDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}${aTotal > 0 ? ` (${sign}${Math.abs(deltaPct).toFixed(0)}%)` : ""}`;

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-sky-100/50"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDownIcon className="h-4 w-4 text-sky-700" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-sky-700" />
        )}
        <span className="text-sm font-semibold text-sky-900">
          Option compare
        </span>
        <span className={`ml-auto text-xs tabular-nums ${deltaColor}`}>
          A vs B: {collapsedSummary}
        </span>
      </button>
      {open ? (
    <div className="border-t border-sky-200 p-4">
      <div className="mb-3 text-xs text-sky-700 sm:hidden">
        Pick any two assemblies — totals update live as you edit
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <ComparisonSide
          label="Option A"
          instances={instances}
          selectedId={a.id}
          onChange={setAId}
          total={aTotal}
        />
        <ComparisonSide
          label="Option B"
          instances={instances}
          selectedId={b.id}
          onChange={setBId}
          total={bTotal}
        />
        <div className={`rounded-lg border ${deltaBg} px-3 py-2`}>
          <div className="text-xs font-medium text-slate-600">Difference</div>
          <div
            className={`mt-1 text-lg font-semibold tabular-nums ${deltaColor}`}
          >
            {absDelta < 0.005
              ? "Same price"
              : `${sign}$${absDelta.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <div className={`text-xs tabular-nums ${deltaColor}`}>
            {aTotal > 0 && absDelta >= 0.005
              ? `${sign}${Math.abs(deltaPct).toFixed(1)}% vs Option A`
              : "—"}
          </div>
        </div>
      </div>
    </div>
      ) : null}
    </div>
  );
}

function ComparisonSide({
  label,
  instances,
  selectedId,
  onChange,
  total,
}: {
  label: string;
  instances: AssemblyInstance[];
  selectedId: string;
  onChange: (id: string) => void;
  total: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
      >
        {instances.map((i) => (
          <option key={i.id} value={i.id}>
            {i.instanceLabel?.trim() ? i.instanceLabel : i.assemblyName}
          </option>
        ))}
      </select>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
        ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}

function AssemblyInstanceCard({
  instance,
  onChange,
  onRemove,
  onSwap,
  onDuplicate,
  defaultCollapsed = false,
}: {
  instance: AssemblyInstance;
  onChange: (next: AssemblyInstance) => void;
  onRemove: () => void;
  onSwap: (newAssemblyId: string) => void;
  onDuplicate: () => void;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);
  const assembly: Assembly | null = useMemo(
    () => findStubAssembly(instance.assemblyId),
    [instance.assemblyId],
  );

  const propertyMap = useMemo(
    () =>
      Object.fromEntries(
        instance.propertyValues.map((p) => [p.name, p.value]),
      ),
    [instance.propertyValues],
  );

  const computed = useMemo(
    () => (assembly ? computeMaterials(assembly, propertyMap) : null),
    [assembly, propertyMap],
  );

  function updateLabel(label: string) {
    onChange({ ...instance, instanceLabel: label });
  }

  function updateProperty(name: string, value: number) {
    onChange({
      ...instance,
      propertyValues: instance.propertyValues.map((p) =>
        p.name === name ? { ...p, value } : p,
      ),
    });
  }

  if (!assembly) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Assembly definition for{" "}
        <span className="font-mono">{instance.assemblyId}</span> was not
        found. It may have been removed from the catalog.{" "}
        <button
          onClick={onRemove}
          className="font-semibold underline hover:no-underline"
        >
          Remove from quote
        </button>
      </div>
    );
  }

  // Compact property summary shown in the collapsed-card header — gives
  // the GC enough info to recognize the assembly without expanding it.
  // Skips long string options ("Vinyl") and zero/empty values, joins with
  // dots so the line stays short.
  const propSummary = instance.propertyValues
    .map(({ name, value }) => {
      const p = assembly.properties.find((x) => x.name === name);
      if (!p) return null;
      if (p.kind === "option" && p.options) {
        const opt = p.options.find((o) => o.value === value);
        return opt?.label ?? null;
      }
      if (!Number.isFinite(value) || value === 0) return null;
      const uom = p.uom ? ` ${p.uom}` : "";
      return `${value}${uom}`;
    })
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label={collapsed ? "Expand assembly" : "Collapse assembly"}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRightIcon className="h-4 w-4" />
          ) : (
            <ChevronDownIcon className="h-4 w-4" />
          )}
        </button>
        <input
          type="text"
          value={instance.instanceLabel}
          onChange={(e) => updateLabel(e.target.value)}
          placeholder="Phase label"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-sky-500 focus:outline-none"
        />
        {!collapsed ? (
          <select
            value={instance.assemblyId}
            onChange={(e) => onSwap(e.target.value)}
            className="hidden rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-slate-600 hover:border-slate-300 focus:border-sky-500 focus:outline-none sm:block"
            title="Swap to a different assembly — properties with matching names carry over."
          >
            {STUB_ASSEMBLIES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : null}
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          ${computed ? computed.total.toFixed(2) : "—"}
        </span>
        <button
          onClick={onDuplicate}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-sky-700"
          aria-label="Duplicate assembly"
          title="Duplicate this assembly to compare a what-if side by side"
        >
          <DocumentDuplicateIcon className="h-4 w-4" />
        </button>
        <button
          onClick={onRemove}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
          aria-label="Remove assembly"
          title="Remove assembly (and its derived line items)"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </header>

      {collapsed ? (
        // Collapsed: one-line property summary so the GC can see what
        // configuration this instance is at without expanding.
        propSummary ? (
          <div className="px-4 py-2 text-xs text-slate-500">{propSummary}</div>
        ) : null
      ) : (
        <>
          {/* Property inputs */}
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
            {assembly.properties.map((p) => (
              <PropertyEditor
                key={p.name}
                property={p}
                value={propertyMap[p.name] ?? 0}
                onChange={(v) => updateProperty(p.name, v)}
              />
            ))}
          </div>

          {/* Footer summary */}
          <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            <span>
              {computed?.lines.length ?? 0} material line
              {computed?.lines.length === 1 ? "" : "s"} regenerated on every edit
            </span>
            {computed?.error ? (
              <span className="text-rose-600">{computed.error}</span>
            ) : null}
          </footer>
        </>
      )}
    </article>
  );
}

function PropertyEditor({
  property,
  value,
  onChange,
}: {
  property: AssemblyProperty;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {property.name}
      </span>
      <div className="flex items-stretch overflow-hidden rounded-md border border-slate-300 focus-within:border-sky-500">
        {property.kind === "option" && property.options ? (
          <select
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none"
          >
            {property.options.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : property.kind === "choice" && property.choices ? (
          <select
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none"
          >
            {property.choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={value}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              onChange(Number.isFinite(next) ? next : 0);
            }}
            className="w-full bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none"
          />
        )}
        {property.uom ? (
          <span className="flex items-center bg-slate-50 px-2.5 text-xs font-medium text-slate-500">
            {property.uom}
          </span>
        ) : null}
      </div>
    </label>
  );
}
