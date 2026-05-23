"use client";

import { useMemo } from "react";
import {
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
      <div className="space-y-3">
        {instances.map((instance) => (
          <AssemblyInstanceCard
            key={instance.id}
            instance={instance}
            onChange={onChange}
            onRemove={() => onRemove(instance.id)}
            onSwap={(newAssemblyId) => onSwap(instance.id, newAssemblyId)}
            onDuplicate={() => onDuplicate(instance.id)}
          />
        ))}
      </div>
    </section>
  );
}

function AssemblyInstanceCard({
  instance,
  onChange,
  onRemove,
  onSwap,
  onDuplicate,
}: {
  instance: AssemblyInstance;
  onChange: (next: AssemblyInstance) => void;
  onRemove: () => void;
  onSwap: (newAssemblyId: string) => void;
  onDuplicate: () => void;
}) {
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

  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5">
        <input
          type="text"
          value={instance.instanceLabel}
          onChange={(e) => updateLabel(e.target.value)}
          placeholder="Phase label"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-sky-500 focus:outline-none"
        />
        <select
          value={instance.assemblyId}
          onChange={(e) => onSwap(e.target.value)}
          className="rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-slate-600 hover:border-slate-300 focus:border-sky-500 focus:outline-none"
          title="Swap to a different assembly — properties with matching names carry over."
        >
          {STUB_ASSEMBLIES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
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
