"use client";

import { useMemo, useState } from "react";
import { STUB_ASSEMBLIES } from "@/lib/assemblies/stub-catalog";
import { evaluateFormula } from "@/lib/assemblies/formula";
import type {
  Assembly,
  AssemblyMaterialLine,
} from "@/types/assembly";

/** Build a property-name → value map from an assembly's defaults. */
function defaultsFor(a: Assembly): Record<string, number> {
  return Object.fromEntries(
    a.properties.map((p) => [p.name, p.defaultValue ?? 0]),
  );
}

export default function AssembliesPage() {
  const [assemblyId, setAssemblyId] = useState<string>(
    STUB_ASSEMBLIES[0]!.id,
  );
  const [propertyValues, setPropertyValues] = useState<Record<string, number>>(
    () => defaultsFor(STUB_ASSEMBLIES[0]!),
  );

  const assembly =
    STUB_ASSEMBLIES.find((a) => a.id === assemblyId) ?? STUB_ASSEMBLIES[0]!;

  function onAssemblyChange(nextId: string) {
    setAssemblyId(nextId);
    const next = STUB_ASSEMBLIES.find((a) => a.id === nextId);
    if (next) setPropertyValues(defaultsFor(next));
  }

  // Compute material lines + grand total from current property values.
  const { lines, total, error } = useMemo(() => {
    const results: AssemblyMaterialLine[] = [];
    let runningTotal = 0;
    let err: string | null = null;
    for (const m of assembly.materials) {
      try {
        const quantity = evaluateFormula(m.quantityFormula, propertyValues);
        const labor = m.laborCostUsd ?? 0;
        const lineTotal = (m.unitCostUsd + labor) * quantity;
        results.push({
          name: m.name,
          uom: m.uom,
          quantity,
          unitCostUsd: m.unitCostUsd,
          laborCostUsd: labor,
          lineTotalUsd: lineTotal,
        });
        runningTotal += lineTotal;
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
      }
    }
    return { lines: results, total: runningTotal, error: err };
  }, [assembly, propertyValues]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Assembly sandbox</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a parametric assembly, set its properties, and see the
          quantified materials breakdown. Stub data — live cost lookups
          via 1build come once the API key is set up.
        </p>
      </header>

      {/* Assembly picker */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Assembly
          </span>
          <select
            value={assemblyId}
            onChange={(e) => onAssemblyChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
          >
            {STUB_ASSEMBLIES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {assembly.description ? (
          <p className="mt-3 text-sm text-slate-600">{assembly.description}</p>
        ) : null}
      </section>

      {/* Property inputs */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Properties
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {assembly.properties.map((p) => (
            <label key={p.name} className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                {p.name}
              </span>
              <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:border-sky-500">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={propertyValues[p.name] ?? ""}
                  onChange={(e) => {
                    const next = parseFloat(e.target.value);
                    setPropertyValues((prev) => ({
                      ...prev,
                      [p.name]: Number.isFinite(next) ? next : 0,
                    }));
                  }}
                  className="w-full bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none"
                />
                <span className="flex items-center bg-slate-50 px-3 text-xs font-medium text-slate-500">
                  {p.uom}
                </span>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Materials breakdown */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Materials
          </h2>
          <span className="text-xs text-slate-400">
            {lines.length} item{lines.length === 1 ? "" : "s"}
          </span>
        </header>
        {error ? (
          <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">
            Formula error: {error}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2">Material</th>
                <th className="px-2 py-2">UoM</th>
                <th className="px-2 py-2 text-right">Quantity</th>
                <th className="px-2 py-2 text-right">Mat $</th>
                <th className="px-2 py-2 text-right">Labor $</th>
                <th className="px-5 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr
                  key={line.name}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-5 py-2 text-slate-800">{line.name}</td>
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
                  <td className="px-5 py-2 text-right tabular-nums font-medium text-slate-900">
                    ${line.lineTotalUsd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50">
                <td
                  colSpan={5}
                  className="px-5 py-3 text-right text-sm font-semibold text-slate-700"
                >
                  Total
                </td>
                <td className="px-5 py-3 text-right text-sm font-bold tabular-nums text-slate-900">
                  ${total.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p className="mt-4 text-xs text-slate-400">
        Stub catalog · placeholder prices, not live · 1build API integration
        comes when the API key is in place.
      </p>
    </div>
  );
}
