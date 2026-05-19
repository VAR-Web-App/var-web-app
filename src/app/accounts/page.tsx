"use client";

import { useEffect, useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import Tooltip from "@/components/tooltip";
import { Account } from "@/types";
import { listAccounts, saveAccount, deleteAccount, newId } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";

export default function AccountsPage() {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editing, setEditing] = useState<Account | null>(null);

  useEffect(() => {
    if (!profile) return;
    listAccounts(profile.org_ref).then(setAccounts);
  }, [profile]);

  async function refresh() {
    if (!profile) return;
    setAccounts(await listAccounts(profile.org_ref));
  }

  function startNew() {
    if (!profile) return;
    setEditing({
      id: newId("client"),
      name: "",
      type: "commercial",   // builders default to private clients
      contract_vehicles: [],
      ship_to_addresses: [],
      payment_terms: "Per draw schedule",
      notes: "",
      org_ref: profile.org_ref,
    });
  }

  async function onSave() {
    if (!editing || !editing.name.trim()) return;
    await saveAccount(editing);
    setEditing(null);
    await refresh();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this client?")) return;
    await deleteAccount(id);
    await refresh();
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">
            Homeowners, developers, and other clients tied to your projects.
          </p>
        </div>
        <Tooltip
          variant="directive"
          label="Add a new client (homeowner, developer, or other party who owns the project). You'll be able to pick them when starting a new project."
          placement="left"
        >
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
          >
            <PlusIcon className="h-4 w-4" />
            New Client
          </button>
        </Tooltip>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Notes</th>
              <th className="px-4 py-3 text-left">Payment Terms</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize">{clientTypeLabel(a.type)}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  {a.contract_vehicles.length > 0 ? a.contract_vehicles.join(", ") : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">{a.payment_terms}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setEditing(a)}
                      className="text-xs font-medium text-sky-700 hover:text-sky-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(a.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  No clients yet. Click <span className="text-sky-700">New Client</span> above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.name ? "Edit Client" : "New Client"}>
          <div className="space-y-4">
            <Input
              label="Client name"
              required
              value={editing.name}
              onChange={(v) => setEditing({ ...editing, name: v })}
              placeholder="e.g. Maddox Family"
            />
            <div className="grid grid-cols-2 gap-4">
              <SelectField
                label="Client type"
                value={editing.type}
                onChange={(v) => setEditing({ ...editing, type: v as Account["type"] })}
                options={[
                  { value: "commercial", label: "Homeowner" },
                  { value: "federal", label: "Developer / Investor" },
                  { value: "state", label: "Builder / GC (sub work)" },
                ]}
              />
              <Input
                label="Payment terms"
                value={editing.payment_terms}
                onChange={(v) => setEditing({ ...editing, payment_terms: v })}
                placeholder="Per draw schedule"
              />
            </div>
            <Input
              label="Notes / referrals (comma-separated)"
              value={editing.contract_vehicles.join(", ")}
              onChange={(v) => setEditing({ ...editing, contract_vehicles: v.split(",").map((x) => x.trim()).filter(Boolean) })}
              placeholder="Architect referral — Smith Designs"
            />
            <TextArea
              label="Project addresses (one per line, blank line between)"
              value={editing.ship_to_addresses.join("\n\n")}
              onChange={(v) => setEditing({ ...editing, ship_to_addresses: v.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean) })}
            />
            <TextArea
              label="Notes"
              value={editing.notes}
              onChange={(v) => setEditing({ ...editing, notes: v })}
            />
          </div>
          <ModalFooter onCancel={() => setEditing(null)} onSave={onSave} />
        </Modal>
      )}
    </AppShell>
  );
}

// Builder rebrand: federal/state/commercial keys are reused as
// homeowner/developer/builder labels until we change the underlying
// type union (kept stable so store + parsers don't break).
function clientTypeLabel(t: Account["type"]): string {
  return t === "commercial" ? "Homeowner" : t === "federal" ? "Developer" : "Builder/GC";
}

// ── shared form components ────────────────────────────────────────

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ModalFooter({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
      <button
        onClick={onCancel}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        className="rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800"
      >
        Save
      </button>
    </div>
  );
}

export function Input({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
