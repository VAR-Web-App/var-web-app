"use client";

import { useMemo } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { findStubAssembly } from "@/lib/assemblies/stub-catalog";
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
}: {
  instances: AssemblyInstance[];
  onChange: (next: AssemblyInstance) => void;
  onRemove: (instanceId: string) => void;
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
}: {
  instance: AssemblyInstance;
  onChange: (next: AssemblyInstance) => void;
  onRemove: () => void;
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
        <span className="text-xs text-slate-500">{assembly.name}</span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          ${computed ? computed.total.toFixed(2) : "—"}
        </span>
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
        {property.kind === "choice" && property.choices ? (
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
        <span className="flex items-center bg-slate-50 px-2.5 text-xs font-medium text-slate-500">
          {property.uom}
        </span>
      </div>
    </label>
  );
}
