"use client";

import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Deal, Account } from "@/types";
import { listAccounts, saveDeal, newId, getSettings } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";

export default function NewDealModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [accountRef, setAccountRef] = useState("");
  const [solicitation, setSolicitation] = useState("");
  // Manufacturer field reused as builder type (Custom Home / Remodel / Addition / Spec Build)
  const [manufacturer, setManufacturer] = useState("Custom Home");
  const [dealType, setDealType] = useState<"budgetary" | "quotation">("quotation");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    listAccounts(profile.org_ref).then(setAccounts);
    getSettings(profile.org_ref).then((s) => {
      if (s?.default_manufacturer) setManufacturer(s.default_manufacturer);
    });
  }, [profile]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !profile) return;
    setSubmitting(true);
    try {
      const account = accounts.find((a) => a.id === accountRef);
      const now = new Date().toISOString();
      const deal: Deal = {
        id: newId("deal"),
        name: name.trim(),
        stage: "rfq",
        deal_type: dealType,
        manufacturer,
        account_ref: accountRef || undefined,
        account_name: account?.name ?? "",
        distributor_ref: undefined,
        distributor_name: undefined,
        solicitation_number: solicitation.trim(),
        customer_po: "",
        ship_to_address: account?.ship_to_addresses?.[0] ?? "",
        ship_to_poc_name: "",
        ship_to_poc_email: "",
        lead_time: "",
        due_date: dueDate || undefined,
        award_total: 0,
        total_quote_value: 0,
        total_cost: 0,
        margin_percent: 0,
        notes: "",
        org_ref: profile.org_ref,
        created_at: now,
        updated_at: now,
      };
      await saveDeal(deal);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">New Project</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          <Field label="Project name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maddox — Country Dream House"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              required
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Client">
              <select
                value={accountRef}
                onChange={(e) => setAccountRef(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">— select —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project type">
              <select
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="Custom Home">Custom Home</option>
                <option value="Remodel">Remodel</option>
                <option value="Addition">Addition</option>
                <option value="Spec Build">Spec Build</option>
                <option value="Other">Other</option>
              </select>
            </Field>
          </div>

          <Field label="Job number">
            <input
              type="text"
              value={solicitation}
              onChange={(e) => setSolicitation(e.target.value)}
              placeholder="Optional — your internal job # or lot reference"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Estimate type">
              <select
                value={dealType}
                onChange={(e) => setDealType(e.target.value as "budgetary" | "quotation")}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="quotation">Detailed Estimate</option>
                <option value="budgetary">Ballpark / Budget</option>
              </select>
            </Field>
            <Field label="Target start">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
