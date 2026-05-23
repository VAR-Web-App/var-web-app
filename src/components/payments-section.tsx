"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  listDistributors,
  listMilestones,
  listPayments,
  newId,
  savePayment,
  deletePayment,
} from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import type { Deal, Distributor, Payment } from "@/types";
import type { ProjectMilestone } from "@/types/builder";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METHODS: Array<{ key: Payment["method"]; label: string }> = [
  { key: "check", label: "Check" },
  { key: "cc", label: "Credit card" },
  { key: "ach", label: "ACH / bank" },
  { key: "cash", label: "Cash" },
  { key: "other", label: "Other" },
];

function methodLabel(p: Payment): string {
  if (p.method === "check") {
    return p.check_number ? `Check #${p.check_number}` : "Check";
  }
  return METHODS.find((m) => m.key === p.method)?.label ?? p.method;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Money-in and money-out log for a deal. Quick-add via an inline form,
 * roll-up tiles on top, sortable table below. Reads contract value off
 * the deal so we can show "% collected".
 */
export default function PaymentsSection({ deal }: { deal: Deal }) {
  const { profile } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subs, setSubs] = useState<Distributor[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    (async () => {
      const [p, s, m] = await Promise.all([
        listPayments(deal.id),
        listDistributors(profile.org_ref),
        listMilestones(deal.id),
      ]);
      if (!active) return;
      setPayments(p);
      setSubs(s);
      setMilestones(m);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [deal.id, profile]);

  const totals = useMemo(() => {
    const inAmt = payments
      .filter((p) => p.direction === "in")
      .reduce((s, p) => s + (p.amount || 0), 0);
    const outAmt = payments
      .filter((p) => p.direction === "out")
      .reduce((s, p) => s + (p.amount || 0), 0);
    const contract =
      deal.award_total > 0 ? deal.award_total : deal.total_quote_value;
    return {
      inAmt,
      outAmt,
      net: inAmt - outAmt,
      contract,
      collectedPct: contract > 0 ? (inAmt / contract) * 100 : 0,
    };
  }, [payments, deal]);

  function startAdd(direction: Payment["direction"]) {
    setError(null);
    setEditing({
      id: newId("pay"),
      deal_ref: deal.id,
      direction,
      party_name: direction === "in" ? deal.account_name || "Client" : "",
      amount: 0,
      method: direction === "in" ? "ach" : "check",
      date: todayIso(),
      notes: "",
      created_at: new Date().toISOString(),
    });
  }

  function startEdit(p: Payment) {
    setError(null);
    setEditing({ ...p });
  }

  async function save() {
    if (!editing) return;
    if (!editing.party_name.trim()) {
      setError("Who's paying / being paid?");
      return;
    }
    if (!editing.amount || editing.amount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await savePayment(editing);
      setPayments((prev) => {
        const without = prev.filter((p) => p.id !== editing.id);
        return [...without, editing].sort((a, b) =>
          (b.date ?? "").localeCompare(a.date ?? ""),
        );
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this payment record?")) return;
    setError(null);
    try {
      await deletePayment(id);
      setPayments((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Payments</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Money in (client draws, deposits) and money out (subs, suppliers)
            on this project.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => startAdd("in")}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Record money in
          </button>
          <button
            type="button"
            onClick={() => startAdd("out")}
            className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            Record money out
          </button>
        </div>
      </header>

      {/* Rollup tiles */}
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Tile label="Money in" value={fmtMoney(totals.inAmt)} tone="emerald" />
        <Tile label="Money out" value={fmtMoney(totals.outAmt)} tone="sky" />
        <Tile
          label="Net cash on project"
          value={fmtMoney(totals.net)}
          tone={totals.net >= 0 ? "emerald" : "rose"}
        />
        <Tile
          label={
            totals.contract > 0
              ? `Collected of ${fmtMoney(totals.contract)}`
              : "Collected"
          }
          value={
            totals.contract > 0
              ? `${totals.collectedPct.toFixed(0)}%`
              : "—"
          }
          tone="slate"
        />
      </div>

      {/* Add/edit form */}
      {editing ? (
        <PaymentForm
          value={editing}
          subs={subs}
          milestones={milestones}
          saving={saving}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : null}

      {error ? (
        <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {/* List */}
      <div className="mt-4 overflow-x-auto">
        {!loaded ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : payments.length === 0 ? (
          <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No payments logged yet. Use the buttons above to record a draw
            release, deposit, or sub payment.
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Direction</th>
                <th className="px-3 py-2 text-left">Party</th>
                <th className="px-3 py-2 text-left">Method</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-3 py-2 text-slate-700">{p.date}</td>
                  <td className="px-3 py-2">
                    <DirectionPill direction={p.direction} />
                  </td>
                  <td className="px-3 py-2 text-slate-900">{p.party_name}</td>
                  <td className="px-3 py-2 text-slate-600">{methodLabel(p)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${
                      p.direction === "in" ? "text-emerald-700" : "text-slate-900"
                    }`}
                  >
                    {p.direction === "out" ? "−" : ""}
                    {fmtMoney(p.amount)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => startEdit(p)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Edit payment"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(p.id)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                      aria-label="Remove payment"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function DirectionPill({ direction }: { direction: Payment["direction"] }) {
  if (direction === "in") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
        In
      </span>
    );
  }
  return (
    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
      Out
    </span>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "sky" | "rose" | "slate";
}) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50",
    sky: "border-sky-200 bg-sky-50",
    rose: "border-rose-200 bg-rose-50",
    slate: "border-slate-200 bg-slate-50",
  }[tone];
  const valueClass = {
    emerald: "text-emerald-900",
    sky: "text-sky-900",
    rose: "text-rose-900",
    slate: "text-slate-900",
  }[tone];
  return (
    <div className={`rounded-lg border ${toneClass} px-3 py-2`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

function PaymentForm({
  value,
  subs,
  milestones,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  value: Payment;
  subs: Distributor[];
  milestones: ProjectMilestone[];
  saving: boolean;
  onChange: (next: Payment) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  function patch(p: Partial<Payment>) {
    onChange({ ...value, ...p });
  }
  return (
    <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {value.direction === "in" ? "Record money in" : "Record money out"}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Party */}
        <Field label={value.direction === "in" ? "Paid by" : "Paid to"}>
          {value.direction === "out" ? (
            <div className="flex gap-2">
              <select
                value={value.party_ref ?? ""}
                onChange={(e) => {
                  const ref = e.target.value || undefined;
                  const sub = subs.find((s) => s.id === ref);
                  patch({
                    party_ref: ref,
                    party_name: sub ? sub.name : value.party_name,
                  });
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">— pick sub / supplier —</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={value.party_name}
                onChange={(e) => patch({ party_name: e.target.value })}
                placeholder="or type a name"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            </div>
          ) : (
            <input
              type="text"
              value={value.party_name}
              onChange={(e) => patch({ party_name: e.target.value })}
              placeholder="Client name"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          )}
        </Field>

        {/* Amount */}
        <Field label="Amount (USD)">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={value.amount || ""}
            onChange={(e) => patch({ amount: parseFloat(e.target.value) || 0 })}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums"
          />
        </Field>

        {/* Date */}
        <Field label="Date">
          <input
            type="date"
            value={value.date}
            onChange={(e) => patch({ date: e.target.value })}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </Field>

        {/* Method */}
        <Field label="Method">
          <select
            value={value.method}
            onChange={(e) =>
              patch({ method: e.target.value as Payment["method"] })
            }
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {METHODS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        {/* Check number — only when method === "check" */}
        {value.method === "check" ? (
          <Field label="Check #">
            <input
              type="text"
              value={value.check_number ?? ""}
              onChange={(e) => patch({ check_number: e.target.value })}
              placeholder="e.g. 1247"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </Field>
        ) : null}

        {/* Milestone */}
        <Field label="Milestone (optional)">
          <select
            value={value.milestone_ref ?? ""}
            onChange={(e) =>
              patch({ milestone_ref: e.target.value || undefined })
            }
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">— not tied to a milestone —</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notes (optional)">
        <textarea
          value={value.notes ?? ""}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={2}
          placeholder="e.g. 'Foundation draw release', 'Final framer invoice'"
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
      </Field>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save payment"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
