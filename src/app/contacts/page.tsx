"use client";

import { useEffect, useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import Tooltip from "@/components/tooltip";
import { Account, Contact, Distributor } from "@/types";
import {
  listContacts,
  saveContact,
  deleteContact,
  listAccounts,
  listDistributors,
  newId,
} from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { Modal, ModalFooter, Input, SelectField } from "../accounts/page";

export default function ContactsPage() {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [editing, setEditing] = useState<Contact | null>(null);

  useEffect(() => {
    if (!profile) return;
    listContacts(profile.org_ref).then(setContacts);
    listAccounts(profile.org_ref).then(setAccounts);
    listDistributors(profile.org_ref).then(setDistributors);
  }, [profile]);

  function startNew() {
    if (!profile) return;
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
      org_ref: profile.org_ref,
    });
  }

  async function onSave() {
    if (!editing || !editing.name.trim() || !profile) return;
    const linked =
      editing.linked_type === "account"
        ? accounts.find((a) => a.id === editing.linked_ref)
        : distributors.find((d) => d.id === editing.linked_ref);
    await saveContact({ ...editing, linked_name: linked?.name ?? editing.linked_name });
    setEditing(null);
    setContacts(await listContacts(profile.org_ref));
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this contact?") || !profile) return;
    await deleteContact(id);
    setContacts(await listContacts(profile.org_ref));
  }

  const linkedOptions =
    editing?.linked_type === "account"
      ? accounts.map((a) => ({ value: a.id, label: a.name }))
      : distributors.map((d) => ({ value: d.id, label: d.name }));

  return (
    <AppShell>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Contacts</h1>
          <p className="mt-1 hidden text-sm text-slate-500 md:block">
            People at your customer agencies, distributors, and manufacturer reps.
          </p>
        </div>
        <Tooltip
          variant="directive"
          label="Add an architect, lender, inspector, designer, or anyone else you work with across projects. Searchable directory shared across all your clients."
          placement="left"
        >
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 sm:px-4"
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">New Contact</span>
            <span className="sm:hidden">New</span>
          </button>
        </Tooltip>
      </div>

      {/* Desktop table */}
      <section className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
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

      {/* Mobile card list */}
      <section className="space-y-2 md:hidden">
        {contacts.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            No contacts yet.
          </p>
        ) : (
          contacts.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900">{c.name}</p>
                    {c.is_primary && (
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-700">
                        Primary
                      </span>
                    )}
                  </div>
                  {c.title && (
                    <p className="mt-0.5 text-xs text-slate-600">{c.title}</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    <span className="capitalize">{c.linked_type}</span> ·{" "}
                    {c.linked_name}
                  </p>
                </div>
                <button
                  onClick={() => onDelete(c.id)}
                  aria-label="Delete"
                  className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
              {(c.email || c.phone) && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="text-sky-700 hover:underline"
                    >
                      {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="text-sky-700 hover:underline"
                    >
                      {c.phone}
                    </a>
                  )}
                </div>
              )}
              <div className="mt-3">
                <button
                  onClick={() => setEditing(c)}
                  className="text-xs font-medium text-sky-700 hover:text-sky-800"
                >
                  Edit
                </button>
              </div>
            </div>
          ))
        )}
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
