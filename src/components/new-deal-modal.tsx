"use client";

import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Deal, Account } from "@/types";
import { listAccounts, saveDeal, newId, ORG, getSettings } from "@/lib/store";

export default function NewDealModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [accountRef, setAccountRef] = useState("");
  const [solicitation, setSolicitation] = useState("");
  const [manufacturer, setManufacturer] = useState("Cisco");
  const [dealType, setDealType] = useState<"budgetary" | "quotation">("quotation");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    setAccounts(listAccounts());
    const s = getSettings();
    if (s.default_manufacturer) setManufacturer(s.default_manufacturer);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
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
      org_ref: ORG,
      created_at: now,
      updated_at: now,
    };
    saveDeal(deal);
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">New Deal</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          <Field label="Deal name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. DSA — Switch Refresh (Q3)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Customer / Account">
              <select
                value={accountRef}
                onChange={(e) => setAccountRef(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">— select —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Manufacturer">
              <input
                type="text"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </Field>
          </div>

          <Field label="Solicitation / RFQ Number">
            <input
              type="text"
              value={solicitation}
              onChange={(e) => setSolicitation(e.target.value)}
              placeholder="e.g. DSA-26-Q-0019"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Deal type">
              <select
                value={dealType}
                onChange={(e) => setDealType(e.target.value as "budgetary" | "quotation")}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="quotation">Quotation</option>
                <option value="budgetary">Budgetary</option>
              </select>
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Create deal
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
