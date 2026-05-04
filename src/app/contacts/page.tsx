"use client";

import { useEffect, useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import { Contact } from "@/types";
import {
  listContacts,
  saveContact,
  deleteContact,
  listAccounts,
  listDistributors,
  newId,
  ORG,
} from "@/lib/store";
import { Modal, ModalFooter, Input, SelectField } from "../accounts/page";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editing, setEditing] = useState<Contact | null>(null);
  const accounts = listAccounts();
  const distributors = listDistributors();

  useEffect(() => setContacts(listContacts()), []);

  function startNew() {
    setEditing({
      id: newId("ct"),
      name: "",
      email: "",
      phone: "",
      title: "",
      linked_type: "account",
      linked_ref: accounts[0]?.id ?? "",
      linked_name: accounts[0]?.name ?? "",
      is_primary: false,
      org_ref: ORG,
    });
  }

  function onSave() {
    if (!editing || !editing.name.trim()) return;
    // Resolve linked_name from the selected ref
    const linked =
      editing.linked_type === "account"
        ? accounts.find((a) => a.id === editing.linked_ref)
        : distributors.find((d) => d.id === editing.linked_ref);
    saveContact({ ...editing, linked_name: linked?.name ?? "" });
    setEditing(null);
    setContacts(listContacts());
  }

  function onDelete(id: string) {
    if (!confirm("Delete this contact?")) return;
    deleteContact(id);
    setContacts(listContacts());
  }

  const linkedOptions =
    editing?.linked_type === "account"
      ? accounts.map((a) => ({ value: a.id, label: a.name }))
      : distributors.map((d) => ({ value: d.id, label: d.name }));

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contacts</h1>
          <p className="mt-1 text-sm text-slate-500">
            People at your customer agencies, distributors, and manufacturer reps.
          </p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <PlusIcon className="h-4 w-4" />
          New Contact
        </button>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Title</th>
              <th className="px-4 py-3 text-left">Linked To</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Phone</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{c.name}</div>
                  {c.is_primary && (
                    <span className="text-[10px] font-semibold uppercase text-blue-600">Primary</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">{c.title || "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] capitalize">{c.linked_type}</span>{" "}
                  <span>{c.linked_name}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline">
                      {c.email}
                    </a>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">{c.phone || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setEditing(c)} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                      Edit
                    </button>
                    <button onClick={() => onDelete(c.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No contacts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.name ? "Edit Contact" : "New Contact"}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Name" required value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
              <Input label="Title" value={editing.title} onChange={(v) => setEditing({ ...editing, title: v })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Email" value={editing.email} onChange={(v) => setEditing({ ...editing, email: v })} />
              <Input label="Phone" value={editing.phone} onChange={(v) => setEditing({ ...editing, phone: v })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SelectField
                label="Linked to"
                value={editing.linked_type}
                onChange={(v) => setEditing({ ...editing, linked_type: v as Contact["linked_type"], linked_ref: "" })}
                options={[
                  { value: "account", label: "Account (customer)" },
                  { value: "distributor", label: "Distributor" },
                  { value: "manufacturer", label: "Manufacturer" },
                ]}
              />
              {editing.linked_type !== "manufacturer" ? (
                <SelectField
                  label="Which one"
                  value={editing.linked_ref}
                  onChange={(v) => setEditing({ ...editing, linked_ref: v })}
                  options={[{ value: "", label: "— select —" }, ...linkedOptions]}
                />
              ) : (
                <Input
                  label="Manufacturer name"
                  value={editing.linked_ref}
                  onChange={(v) => setEditing({ ...editing, linked_ref: v, linked_name: v })}
                />
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.is_primary}
                onChange={(e) => setEditing({ ...editing, is_primary: e.target.checked })}
              />
              Primary contact
            </label>
          </div>
          <ModalFooter onCancel={() => setEditing(null)} onSave={onSave} />
        </Modal>
      )}
    </AppShell>
  );
}
