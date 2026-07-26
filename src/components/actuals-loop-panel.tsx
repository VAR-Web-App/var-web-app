"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import {
  getSettings,
  listDeals,
  listInvoices,
  saveSettings,
} from "@/lib/store";
import { computeActualsUpdates, type ActualsUpdate } from "@/lib/invoices/actuals-loop";
import {
  DEFAULT_ESTIMATE_TEMPLATE,
  type EstimateTemplate,
} from "@/lib/estimate-template-default";
import type { Invoice, OrgSettings } from "@/types";

/**
 * Actuals → Estimating loop (moat #1, in its purest form).
 *
 * Paid/matched invoices carry cat_id-tagged line items. This scans them,
 * computes what the org's GFE estimate template's unit costs *should* be based
 * on real invoiced costs (via computeActualsUpdates), previews the diffs, and
 * on apply writes them back to OrgSettings.estimate_template — so every future
 * estimate is built on this builder's real numbers, not catalog averages. The
 * more jobs run through the platform, the sharper the template gets.
 */

const money = (n: number | null) =>
  n == null
    ? "—"
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function blankSettings(orgRef: string): OrgSettings {
  return {
    org_ref: orgRef,
    company_name: "",
    company_address: "",
    company_phone: "",
    company_email: "",
    cage_code: "",
    duns: "",
    sam_id: "",
    default_blanket_discount_percent: 0,
    default_markup_percent: 0,
    default_manufacturer: "",
    prepared_by_name: "",
    prepared_by_phone: "",
  };
}

export default function ActualsLoopPanel({
  orgRef,
  onApplied,
}: {
  orgRef: string;
  onApplied?: (template: EstimateTemplate, settings: OrgSettings) => void;
}) {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [template, setTemplate] = useState<EstimateTemplate>(
    DEFAULT_ESTIMATE_TEMPLATE,
  );
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appliedAt, setAppliedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!orgRef) return;
    let active = true;
    void (async () => {
      const [sR, dR] = await Promise.allSettled([
        getSettings(orgRef),
        listDeals(orgRef),
      ]);
      if (!active) return;
      const s = sR.status === "fulfilled" ? sR.value : null;
      const deals = dR.status === "fulfilled" ? dR.value : [];
      setSettings(s);
      const tpl =
        s?.estimate_template && Array.isArray(s.estimate_template.categories)
          ? s.estimate_template
          : DEFAULT_ESTIMATE_TEMPLATE;
      setTemplate(tpl);

      const perDeal = await Promise.all(
        deals.map(async (d) => {
          try {
            return await listInvoices(d.id);
          } catch {
            return [] as Invoice[];
          }
        }),
      );
      if (!active) return;
      // Only real actuals: matched/draw_ready/paid invoices that carry at
      // least one cat_id-tagged line item.
      const usable = perDeal
        .flat()
        .filter(
          (inv) =>
            inv.status !== "pending" &&
            inv.line_items.some((li) => !!li.cat_id),
        );
      setInvoices(usable);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [orgRef]);

  const { updates, nextTemplate } = useMemo(() => {
    let working = template;
    const all: ActualsUpdate[] = [];
    // Sort oldest→newest so the most recent invoice wins on a repeated cat_id.
    const ordered = [...invoices].sort((a, b) =>
      (a.invoice_date ?? a.created_at).localeCompare(b.invoice_date ?? b.created_at),
    );
    for (const inv of ordered) {
      const { updates: u, updatedTemplate } = computeActualsUpdates(inv, working);
      // Only surface real changes (skip no-ops where cost already matches).
      for (const up of u) {
        if (up.old_unit_cost !== up.new_unit_cost) all.push(up);
      }
      working = updatedTemplate;
    }
    return { updates: all, nextTemplate: working };
  }, [invoices, template]);

  async function apply() {
    setSaving(true);
    try {
      const next: OrgSettings = {
        ...(settings ?? blankSettings(orgRef)),
        estimate_template: nextTemplate,
      };
      await saveSettings(next);
      setSettings(next);
      setTemplate(nextTemplate);
      setAppliedAt(Date.now());
      onApplied?.(nextTemplate, next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowPathIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Update from actuals
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Push real invoiced costs into your template.
        </p>
      </header>

      {!loaded ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : updates.length === 0 ? (
        <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          {appliedAt
            ? "Template is up to date with your latest invoiced costs."
            : "No cost updates yet. As you log invoices tagged to estimate categories, real unit costs will surface here to fold into your template."}
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">{updates.length}</span>{" "}
            template line{updates.length === 1 ? "" : "s"} can be updated from
            your paid invoices — real numbers instead of catalog averages.
          </p>

          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {updates.map((u, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {u.item_name}
                  <span className="ml-2 text-[11px] font-normal text-slate-400">
                    cat {u.cat_id}
                  </span>
                </span>
                <span className="text-xs tabular-nums text-slate-500">
                  {money(u.old_unit_cost)}
                  <span className="mx-1 text-slate-400">→</span>
                  <span className="font-semibold text-emerald-700">
                    {money(u.new_unit_cost)}
                  </span>
                </span>
                <span className="w-full text-right text-[11px] text-slate-400 sm:w-40 sm:truncate">
                  {u.invoice_vendor}
                  {u.invoice_number ? ` · ${u.invoice_number}` : ""}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={apply}
              disabled={saving}
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? "Applying…" : "Apply to template"}
            </button>
            {appliedAt ? (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                <CheckCircleIcon className="h-4 w-4" /> Applied — future estimates
                use these costs
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
