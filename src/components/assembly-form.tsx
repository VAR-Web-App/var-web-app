"use client";

import { useEffect, useMemo, useState } from "react";
import { STUB_ASSEMBLIES } from "@/lib/assemblies/stub-catalog";
import { computeMaterials, type ComputeResult } from "@/lib/assemblies/compute";
import type { Assembly } from "@/types/assembly";
import NumberInput from "@/components/number-input";

/** Build a property-name → value map from an assembly's defaults. */
function defaultsFor(a: Assembly): Record<string, number> {
  return Object.fromEntries(
    a.properties.map((p) => [p.name, p.defaultValue ?? 0]),
  );
}

export interface AssemblyFormState {
  assembly: Assembly;
  propertyValues: Record<string, number>;
  result: ComputeResult;
}

/**
 * Reusable assembly picker + properties + materials preview.
 *
 * Used by both the standalone /assemblies sandbox page and the
 * "Add assembly" modal on the quote page. Manages its own internal
 * state; parents can subscribe to changes via onChange.
 */
export default function AssemblyForm({
  assemblies = STUB_ASSEMBLIES,
  initialAssemblyId,
  onChange,
  compact = false,
}: {
  assemblies?: Assembly[];
  initialAssemblyId?: string;
  onChange?: (state: AssemblyFormState) => void;
  /** Trims padding + table density for use inside a modal. */
  compact?: boolean;
}) {
  const initial =
    assemblies.find((a) => a.id === initialAssemblyId) ?? assemblies[0]!;

  const [assemblyId, setAssemblyId] = useState<string>(initial.id);
  const [propertyValues, setPropertyValues] = useState<Record<string, number>>(
    () => defaultsFor(initial),
  );

  const assembly = useMemo(
    () => assemblies.find((a) => a.id === assemblyId) ?? initial,
    [assemblies, assemblyId, initial],
  );

  function onAssemblyChange(nextId: string) {
    setAssemblyId(nextId);
    const next = assemblies.find((a) => a.id === nextId);
    if (next) setPropertyValues(defaultsFor(next));
  }

  const result = useMemo(
    () => computeMaterials(assembly, propertyValues),
    [assembly, propertyValues],
  );

  // Notify parent of state changes.
  useEffect(() => {
    onChange?.({ assembly, propertyValues, result });
    // We intentionally exclude `onChange` from deps — parents typically
    // pass a fresh function each render and we only want this to fire
    // on real state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assembly, propertyValues, result]);

  const sectionClass = compact
    ? "rounded-lg border border-slate-200 bg-white p-3"
    : "rounded-xl border border-slate-200 bg-white p-5";
  const headingClass =
    "text-xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <div className={compact ? "space-y-3" : "space-y-6"}>
      {/* Assembly picker */}
      <section className={sectionClass}>
        <label className="block">
          <span className={`mb-1 block ${headingClass}`}>Assembly</span>
          <select
            value={assemblyId}
            onChange={(e) => onAssemblyChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
          >
            {assemblies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {!compact && assembly.description ? (
          <p className="mt-3 text-sm text-slate-600">{assembly.description}</p>
        ) : null}
      </section>

      {/* Property inputs */}
      <section className={sectionClass}>
        <h3 className={`mb-3 ${headingClass}`}>Properties</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {assembly.properties.map((p) => {
            const value = propertyValues[p.name] ?? 0;
            const setValue = (v: number) =>
              setPropertyValues((prev) => ({ ...prev, [p.name]: v }));
            return (
              <label key={p.name} className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  {p.name}
                </span>
                {p.kind === "option" && p.options ? (
                  <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-sky-500">
                    <select
                      value={value}
                      onChange={(e) => setValue(parseFloat(e.target.value))}
                      className="w-full bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none"
                    >
                      {p.options.map((opt) => (
                        <option key={opt.label} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {p.uom ? (
                      <span className="flex items-center bg-slate-50 px-3 text-xs font-medium text-slate-500">
                        {p.uom}
                      </span>
                    ) : null}
                  </div>
                ) : p.kind === "choice" && p.choices ? (
                  <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-sky-500">
                    <select
                      value={value}
                      onChange={(e) => setValue(parseFloat(e.target.value))}
                      className="w-full bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none"
                    >
                      {p.choices.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <span className="flex items-center bg-slate-50 px-3 text-xs font-medium text-slate-500">
                      {p.uom}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-sky-500">
                    <NumberInput
                      value={value}
                      onChange={setValue}
                      className="w-full bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none"
                    />
                    <span className="flex items-center bg-slate-50 px-3 text-xs font-medium text-slate-500">
                      {p.uom}
                    </span>
                  </div>
                )}
              </label>
            );
          })}
        </div>
      </section>

      {/* Materials breakdown */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <h3 className={headingClass}>Materials</h3>
          <span className="text-xs text-slate-400">
            {result.lines.length} item{result.lines.length === 1 ? "" : "s"}
          </span>
        </header>
        {result.error ? (
          <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            Formula error: {result.error}
          </div>
        ) : null}
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Material</th>
                <th className="px-2 py-2">UoM</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Mat $</th>
                <th className="px-2 py-2 text-right">Labor $</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((line) => (
                <tr
                  key={line.name}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-4 py-2 text-slate-800">{line.name}</td>
                  <td className="px-2 py-2 text-slate-500">{line.uom}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                    {line.quantity.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                    ${line.unitCostUsd.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                    ${line.laborCostUsd.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900">
                    ${line.lineTotalUsd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50">
                <td
                  colSpan={5}
                  className="px-4 py-2 text-right text-sm font-semibold text-slate-700"
                >
                  Total
                </td>
                <td className="px-4 py-2 text-right text-sm font-bold tabular-nums text-slate-900">
                  ${result.total.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
