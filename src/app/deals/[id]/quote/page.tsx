"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeftIcon,
  PlusIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import { useAuth } from "@/lib/auth-context";
import {
  getDeal,
  getSettings,
  listAttachments,
  listQuoteLines,
  saveDeal,
  saveQuoteLines,
  newId,
} from "@/lib/store";
import { Deal, QuoteLine, OrgSettings } from "@/types";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface ParsedAttCache {
  attachment_id: string;
  attachment_name: string;
  bom: Array<{
    item_number: string;
    description: string;
    part_number: string;
    qty: number;
    unit_price: number;
    extended_price: number;
  }>;
}

export default function DealQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [savedLinesSnapshot, setSavedLinesSnapshot] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [parsedDistributorBoms, setParsedDistributorBoms] = useState<ParsedAttCache[]>([]);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    async function load() {
      const d = await getDeal(id);
      if (!active) return;
      if (!d || d.org_ref !== profile!.org_ref) {
        router.replace("/deals");
        return;
      }
      const [theLines, theSettings, attachments] = await Promise.all([
        listQuoteLines(id),
        getSettings(profile!.org_ref),
        listAttachments(id),
      ]);
      if (!active) return;
      setDeal(d);
      setLines(theLines);
      setSavedLinesSnapshot(JSON.stringify(theLines));
      setSettings(theSettings);
      // Pull parsed BOM cache from sessionStorage (set by the deal detail
      // page when a PDF was uploaded + parsed). Filter to attachments that
      // are still present in this deal so stale cache doesn't show up.
      try {
        const cached = sessionStorage.getItem(`parsed:${id}`);
        if (cached) {
          const parsed = JSON.parse(cached) as Record<string, { bom: ParsedAttCache["bom"] }>;
          const attMap = new Map(attachments.map((a) => [a.id, a]));
          const list: ParsedAttCache[] = [];
          for (const [attId, p] of Object.entries(parsed)) {
            const att = attMap.get(attId);
            if (att && (att.category === "distributor_quote" || att.category === "customer_quote")) {
              list.push({ attachment_id: attId, attachment_name: att.name, bom: p.bom });
            }
          }
          setParsedDistributorBoms(list);
        }
      } catch {
        // ignore — cache is best-effort
      }
      setLoaded(true);
    }
    void load();
    return () => { active = false; };
  }, [id, router, profile]);

  const totals = useMemo(() => {
    const customer = lines.reduce((s, l) => s + (l.customer_extended || 0), 0);
    const cost = lines.reduce((s, l) => s + (l.cost_extended || 0), 0);
    const margin = customer > 0 ? ((customer - cost) / customer) * 100 : 0;
    return { customer, cost, margin };
  }, [lines]);

  const dirty = JSON.stringify(lines) !== savedLinesSnapshot;

  function recomputeLine(line: QuoteLine): QuoteLine {
    // cost = list × (1 - discount%), customer = cost × (1 + markup%)
    const cost_unit = line.list_price * (1 - (line.discount_percent || 0) / 100);
    const customer_unit = cost_unit * (1 + (line.markup_percent || 0) / 100);
    const cost_extended = cost_unit * (line.qty || 0);
    const customer_extended = customer_unit * (line.qty || 0);
    const margin = customer_extended > 0
      ? ((customer_extended - cost_extended) / customer_extended) * 100
      : 0;
    return {
      ...line,
      cost_unit_price: round(cost_unit, 4),
      customer_unit_price: round(customer_unit, 4),
      cost_extended: round(cost_extended, 2),
      customer_extended: round(customer_extended, 2),
      margin_percent: round(margin, 2),
    };
  }

  function updateLine(idx: number, patch: Partial<QuoteLine>) {
    setLines((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch };
      next[idx] = recomputeLine(merged);
      return next;
    });
  }

  function addBlankLine() {
    const next: QuoteLine = recomputeLine({
      id: newId("ql"),
      line_number: lines.length + 1,
      product_code: "",
      description: "",
      manufacturer: deal?.manufacturer || "",
      is_service: false,
      qty: 1,
      list_price: 0,
      discount_percent: settings?.default_blanket_discount_percent ?? 0,
      customer_unit_price: 0,
      customer_extended: 0,
      markup_percent: settings?.default_markup_percent ?? 0,
      cost_unit_price: 0,
      cost_extended: 0,
      margin_percent: 0,
      subscription_term_months: 0,
      notes: "",
    });
    setLines((prev) => [...prev, next]);
  }

  function removeLine(idx: number) {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((l, i) => ({ ...l, line_number: i + 1 }));
    });
  }

  function importFromBom(bom: ParsedAttCache) {
    const blanketDiscount = settings?.default_blanket_discount_percent ?? 0;
    const markup = settings?.default_markup_percent ?? 0;
    const newLines: QuoteLine[] = bom.bom.map((b, i) =>
      recomputeLine({
        id: newId("ql"),
        line_number: lines.length + i + 1,
        product_code: b.part_number,
        description: b.description,
        manufacturer: deal?.manufacturer || "",
        is_service: false,
        qty: b.qty,
        // BOM unit_price coming from a distributor quote is post-discount
        // (what we'd pay them). To populate list_price we'd need to
        // de-rate by the assumed discount. For v1, treat the BOM unit as
        // list and apply the org's default blanket discount as the cost
        // adjustment. User can override either side per-line.
        list_price: b.unit_price,
        discount_percent: blanketDiscount,
        markup_percent: markup,
        customer_unit_price: 0,
        customer_extended: 0,
        cost_unit_price: 0,
        cost_extended: 0,
        margin_percent: 0,
        subscription_term_months: 0,
        notes: "",
      }),
    );
    setLines((prev) => [...prev, ...newLines]);
  }

  async function onSave() {
    if (!profile || !deal) return;
    setSaving(true);
    try {
      const renumbered = lines.map((l, i) => ({ ...l, line_number: i + 1 }));
      await saveQuoteLines(id, profile.org_ref, renumbered);
      // Update deal totals so the kanban + deal detail reflect the latest
      // quote roll-up. This is a separate write — race-safe since deal docs
      // and quote lines are independent.
      const updatedDeal: Deal = {
        ...deal,
        total_quote_value: totals.customer,
        total_cost: totals.cost,
        margin_percent: totals.margin,
        updated_at: new Date().toISOString(),
      };
      await saveDeal(updatedDeal);
      setDeal(updatedDeal);
      setLines(renumbered);
      setSavedLinesSnapshot(JSON.stringify(renumbered));
      // Once saved, dirty becomes false → resting state shows the green
      // "Saved" pill automatically. No need for a transient flash.
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || !deal) {
    return (
      <AppShell>
        <div className="text-sm text-slate-500">Loading…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Link
            href={`/deals/${id}`}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            {deal.name}
          </Link>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Project Estimate</h1>
            <p className="mt-1 text-sm text-slate-500">
              Build the estimate you&apos;ll send your client. Cost + markup feeds the
              project totals on save.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!dirty && !saving && lines.length > 0 && (
              <Link
                href={`/deals/${id}/proposal`}
                className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50"
                title="Generate the client-facing proposal"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                Generate proposal
              </Link>
            )}
            {!dirty && !saving ? (
              // Resting state: button area shows a green "Saved" pill so the
              // user knows their work is persisted (rather than seeing a
              // disabled grey button).
              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <CheckIcon className="h-4 w-4" />
                Saved
              </span>
            ) : (
              <button
                onClick={onSave}
                disabled={saving}
                className="rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-400"
              >
                {saving ? "Saving…" : "Save estimate"}
              </button>
            )}
          </div>
        </div>

        {parsedDistributorBoms.length > 0 && (
          <ImportBanner
            boms={parsedDistributorBoms}
            onImport={importFromBom}
          />
        )}

        <TotalsBar totals={totals} lineCount={lines.length} />

        {lines.length === 0 ? (
          <EmptyState onAddBlank={addBlankLine} hasParsedBoms={parsedDistributorBoms.length > 0} />
        ) : (
          <LineEditor
            lines={lines}
            onUpdate={updateLine}
            onRemove={removeLine}
          />
        )}

        <div className="flex justify-between">
          <button
            onClick={addBlankLine}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add blank line
          </button>
          <button
            disabled
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white px-4 py-2 text-sm text-slate-400"
            title="Coming soon"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export to Excel / PDF (soon)
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function ImportBanner({
  boms,
  onImport,
}: {
  boms: ParsedAttCache[];
  onImport: (bom: ParsedAttCache) => void;
}) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-sm text-sky-900">
          <span className="font-semibold">Import from a parsed bid or material list.</span>{" "}
          Pull line items in from an attached PDF. Default markup from your settings is
          applied — edit per line.
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {boms.map((b) => (
          <button
            key={b.attachment_id}
            onClick={() => onImport(b)}
            className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
          >
            Import {b.bom.length} line{b.bom.length === 1 ? "" : "s"} from {b.attachment_name}
          </button>
        ))}
      </div>
    </div>
  );
}

function TotalsBar({
  totals,
  lineCount,
}: {
  totals: { customer: number; cost: number; margin: number };
  lineCount: number;
}) {
  return (
    <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Stat label="Line Items" value={String(lineCount)} />
      <Stat label="Total Cost" value={fmtMoney(totals.cost)} />
      <Stat label="Estimate to Client" value={fmtMoney(totals.customer)} accent="emerald" />
      <Stat
        label="Profit Margin"
        value={`${totals.margin.toFixed(1)}%`}
        accent={totals.margin >= 15 ? "emerald" : totals.margin >= 5 ? "amber" : "red"}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber" | "red";
}) {
  const color =
    accent === "emerald" ? "text-emerald-700" : accent === "amber" ? "text-sky-700" : accent === "red" ? "text-red-700" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function EmptyState({
  onAddBlank,
  hasParsedBoms,
}: {
  onAddBlank: () => void;
  hasParsedBoms: boolean;
}) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-base font-semibold text-slate-900">No line items yet</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {hasParsedBoms
          ? "Import lines from a parsed sub bid or material list (banner above), or add a line manually."
          : "Add line items here — materials, labor, and sub trades. Or upload a floor plan on the project page and AI will pre-fill the structure (coming soon)."}
      </p>
      <button
        onClick={onAddBlank}
        className="mt-4 rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800"
      >
        Add first line item
      </button>
    </div>
  );
}

function LineEditor({
  lines,
  onUpdate,
  onRemove,
}: {
  lines: QuoteLine[];
  onUpdate: (idx: number, patch: Partial<QuoteLine>) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3 text-left">#</th>
              <th className="px-3 py-3 text-left">Item / Code</th>
              <th className="px-3 py-3 text-left">Description</th>
              <th className="px-3 py-3 text-right">Qty</th>
              <th className="px-3 py-3 text-right">Unit Cost</th>
              <th className="px-3 py-3 text-right">Markup %</th>
              <th className="px-3 py-3 text-right">Unit Price</th>
              <th className="px-3 py-3 text-right">Line Total</th>
              <th className="px-3 py-3 text-right">Margin</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, i) => (
              <tr key={line.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-xs text-slate-500">{line.line_number}</td>
                <td className="px-2 py-1.5">
                  <CellInput
                    value={line.product_code}
                    onChange={(v) => onUpdate(i, { product_code: v })}
                    className="w-28 font-mono text-xs"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <CellInput
                    value={line.description}
                    onChange={(v) => onUpdate(i, { description: v })}
                    className="w-full min-w-[200px]"
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <NumInput
                    value={line.qty}
                    onChange={(v) => onUpdate(i, { qty: v })}
                    width="w-16"
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <NumInput
                    value={line.list_price}
                    onChange={(v) => onUpdate(i, { list_price: v })}
                    width="w-24"
                    decimals
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <NumInput
                    value={line.markup_percent}
                    onChange={(v) => onUpdate(i, { markup_percent: v })}
                    width="w-16"
                    decimals
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {fmtMoney(line.customer_unit_price)}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                  {fmtMoney(line.customer_extended)}
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  <span
                    className={
                      line.margin_percent >= 15
                        ? "text-emerald-700"
                        : line.margin_percent >= 5
                        ? "text-sky-700"
                        : line.margin_percent === 0
                        ? "text-slate-400"
                        : "text-red-700"
                    }
                  >
                    {line.margin_percent.toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onRemove(i)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Remove line"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CellInput({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 ${className}`}
    />
  );
}

function NumInput({
  value,
  onChange,
  width,
  decimals = false,
}: {
  value: number;
  onChange: (v: number) => void;
  width: string;
  decimals?: boolean;
}) {
  const [raw, setRaw] = useState<string>(decimals ? value.toFixed(2) : String(value));
  useEffect(() => {
    setRaw(decimals ? value.toFixed(2) : String(value));
  }, [value, decimals]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        const v = e.target.value;
        setRaw(v);
        const n = parseFloat(v);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setRaw(decimals ? value.toFixed(2) : String(value))}
      className={`rounded border border-transparent bg-transparent px-2 py-1 text-right text-sm tabular-nums hover:border-slate-200 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 ${width}`}
    />
  );
}

function round(n: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}
