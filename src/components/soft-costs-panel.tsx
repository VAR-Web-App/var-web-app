"use client";

// Soft-cost layer that sits under the line-item subtotal on the quote
// page: sales tax, contingency reserve, and General Conditions (PM
// overhead). Builder enters percentages (or a flat dollar amount for
// GC); the panel rolls them up into a grand total visible to the
// client on the proposal.
//
// State lives on the Deal — see Deal.soft_costs in types/index.ts —
// so it persists with the rest of the estimate.

import { useMemo } from "react";
import NumberInput from "@/components/number-input";
import type { Deal } from "@/types";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface SoftCostsTotals {
  /** Sum of line.cost_extended — the builder's actual costs. */
  costSubtotal: number;
  /** Sum of line.customer_extended — what the client sees before soft costs. */
  customerSubtotal: number;
  /** Dollar amount the soft-cost layer adds to the client total. */
  taxAmount: number;
  contingencyAmount: number;
  gcAmount: number;
  /** customerSubtotal + tax + contingency + gc. */
  grandTotal: number;
}

/** Pure helper used by the panel + the takeoff/proposal/CSV exports so
 *  the math runs from one place. Returns all the pieces a caller might
 *  need (subtotals, per-line soft cost amounts, grand total). */
export function computeSoftCosts(
  costSubtotal: number,
  customerSubtotal: number,
  cfg: Deal["soft_costs"],
): SoftCostsTotals {
  const tax = cfg?.tax_percent ?? 0;
  const basis = cfg?.tax_basis ?? "materials";
  const taxBase = basis === "all" ? customerSubtotal : costSubtotal;
  const taxAmount = (taxBase * tax) / 100;

  const contingencyAmount =
    ((cfg?.contingency_percent ?? 0) * customerSubtotal) / 100;

  const gcMode = cfg?.gc_mode ?? "percent";
  const gcAmount =
    gcMode === "flat"
      ? (cfg?.gc_amount ?? 0)
      : ((cfg?.gc_percent ?? 0) * customerSubtotal) / 100;

  const grandTotal =
    customerSubtotal + taxAmount + contingencyAmount + gcAmount;

  return {
    costSubtotal,
    customerSubtotal,
    taxAmount,
    contingencyAmount,
    gcAmount,
    grandTotal,
  };
}

export default function SoftCostsPanel({
  deal,
  costSubtotal,
  customerSubtotal,
  onChange,
}: {
  deal: Deal;
  costSubtotal: number;
  customerSubtotal: number;
  onChange: (next: Deal["soft_costs"]) => void;
}) {
  const cfg = deal.soft_costs;
  const totals = useMemo(
    () => computeSoftCosts(costSubtotal, customerSubtotal, cfg),
    [costSubtotal, customerSubtotal, cfg],
  );

  function patch(p: Partial<NonNullable<Deal["soft_costs"]>>) {
    onChange({ ...(cfg ?? {}), ...p });
  }

  const gcMode = cfg?.gc_mode ?? "percent";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          Soft costs &amp; markup
        </h2>
        <p className="text-xs text-slate-500">
          Tax, contingency, and general conditions layered on top of the
          line-item subtotal. Persist with the deal.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Sales tax */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Sales tax
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="inline-flex items-stretch overflow-hidden rounded-md border border-slate-300 bg-white">
              <NumberInput
                value={cfg?.tax_percent ?? 0}
                onChange={(v) => patch({ tax_percent: v })}
                className="w-16 bg-white px-2 py-1 text-right text-sm tabular-nums focus:outline-none"
                decimals
              />
              <span className="flex items-center bg-slate-50 px-2 text-xs font-medium text-slate-500">
                %
              </span>
            </div>
            <select
              value={cfg?.tax_basis ?? "materials"}
              onChange={(e) =>
                patch({ tax_basis: e.target.value as "materials" | "all" })
              }
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none"
              title="Most states tax only materials; some tax labor too."
            >
              <option value="materials">on materials</option>
              <option value="all">on full estimate</option>
            </select>
          </div>
          <div className="mt-2 text-sm font-semibold tabular-nums text-slate-900">
            {fmtMoney(totals.taxAmount)}
          </div>
        </div>

        {/* Contingency */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Contingency
          </div>
          <div className="mt-2 inline-flex items-stretch overflow-hidden rounded-md border border-slate-300 bg-white">
            <NumberInput
              value={cfg?.contingency_percent ?? 0}
              onChange={(v) => patch({ contingency_percent: v })}
              className="w-16 bg-white px-2 py-1 text-right text-sm tabular-nums focus:outline-none"
              decimals
            />
            <span className="flex items-center bg-slate-50 px-2 text-xs font-medium text-slate-500">
              %
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Buffer for change orders / market swings
          </div>
          <div className="mt-2 text-sm font-semibold tabular-nums text-slate-900">
            {fmtMoney(totals.contingencyAmount)}
          </div>
        </div>

        {/* General Conditions */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              General Conditions
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
              <button
                type="button"
                onClick={() => patch({ gc_mode: "percent" })}
                className={
                  "px-2 py-0.5 text-[10px] font-semibold " +
                  (gcMode === "percent"
                    ? "bg-sky-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100")
                }
              >
                %
              </button>
              <button
                type="button"
                onClick={() => patch({ gc_mode: "flat" })}
                className={
                  "px-2 py-0.5 text-[10px] font-semibold " +
                  (gcMode === "flat"
                    ? "bg-sky-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100")
                }
              >
                $
              </button>
            </div>
          </div>
          <div className="mt-2 inline-flex items-stretch overflow-hidden rounded-md border border-slate-300 bg-white">
            {gcMode === "flat" ? (
              <>
                <span className="flex items-center bg-slate-50 px-2 text-xs font-medium text-slate-500">
                  $
                </span>
                <NumberInput
                  value={cfg?.gc_amount ?? 0}
                  onChange={(v) => patch({ gc_amount: v })}
                  className="w-20 bg-white px-2 py-1 text-right text-sm tabular-nums focus:outline-none"
                  decimals
                />
              </>
            ) : (
              <>
                <NumberInput
                  value={cfg?.gc_percent ?? 0}
                  onChange={(v) => patch({ gc_percent: v })}
                  className="w-16 bg-white px-2 py-1 text-right text-sm tabular-nums focus:outline-none"
                  decimals
                />
                <span className="flex items-center bg-slate-50 px-2 text-xs font-medium text-slate-500">
                  %
                </span>
              </>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            PM, supervision, dumpsters, port-a-john
          </div>
          <div className="mt-2 text-sm font-semibold tabular-nums text-slate-900">
            {fmtMoney(totals.gcAmount)}
          </div>
        </div>
      </div>

      {/* Totals waterfall */}
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-slate-600">Line-item subtotal</dt>
          <dd className="text-right tabular-nums text-slate-900">
            {fmtMoney(totals.customerSubtotal)}
          </dd>
          {totals.taxAmount !== 0 ? (
            <>
              <dt className="text-slate-600">
                + Sales tax ({cfg?.tax_percent ?? 0}%)
              </dt>
              <dd className="text-right tabular-nums text-slate-900">
                {fmtMoney(totals.taxAmount)}
              </dd>
            </>
          ) : null}
          {totals.contingencyAmount !== 0 ? (
            <>
              <dt className="text-slate-600">
                + Contingency ({cfg?.contingency_percent ?? 0}%)
              </dt>
              <dd className="text-right tabular-nums text-slate-900">
                {fmtMoney(totals.contingencyAmount)}
              </dd>
            </>
          ) : null}
          {totals.gcAmount !== 0 ? (
            <>
              <dt className="text-slate-600">
                + General Conditions
                {gcMode === "percent"
                  ? ` (${cfg?.gc_percent ?? 0}%)`
                  : ""}
              </dt>
              <dd className="text-right tabular-nums text-slate-900">
                {fmtMoney(totals.gcAmount)}
              </dd>
            </>
          ) : null}
          <dt className="mt-2 border-t border-slate-300 pt-2 text-base font-bold text-slate-900">
            Grand total
          </dt>
          <dd className="mt-2 border-t border-slate-300 pt-2 text-right text-base font-bold tabular-nums text-emerald-700">
            {fmtMoney(totals.grandTotal)}
          </dd>
        </dl>
      </div>
    </section>
  );
}
