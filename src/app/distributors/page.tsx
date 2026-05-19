"use client";

import { useEffect, useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import Tooltip from "@/components/tooltip";
import { Distributor } from "@/types";
import { listDistributors, saveDistributor, deleteDistributor, newId } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { Modal, ModalFooter, Input, TextArea } from "../accounts/page";

export default function DistributorsPage() {
  const { profile } = useAuth();
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [editing, setEditing] = useState<Distributor | null>(null);

  useEffect(() => {
    if (!profile) return;
    listDistributors(profile.org_ref).then(setDistributors);
  }, [profile]);

  function startNew() {
    if (!profile) return;
    setEditing({
      id: newId("sub"),
      name: "",
      account_number: "",
      address: "",
      order_poc_name: "",
      notes: "",
      org_ref: profile.org_ref,
    });
  }

  async function onSave() {
    if (!editing || !editing.name.trim() || !profile) return;
    await saveDistributor(editing);
    setEditing(null);
    setDistributors(await listDistributors(profile.org_ref));
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this sub/supplier?") || !profile) return;
    await deleteDistributor(id);
    setDistributors(await listDistributors(profile.org_ref));
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Subs & Suppliers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Subcontractors and material suppliers — your trade partners and vendor list for RFQs.
          </p>
        </div>
        <Tooltip
          variant="directive"
          label="Add a subcontractor (framer, plumber, electrician, etc.) or material supplier. Used by RFQs to invite bids and by milestones to assign work."
          placement="left"
        >
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
          >
            <PlusIcon className="h-4 w-4" />
            New Sub / Supplier
          </button>
        </Tooltip>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Trade / Account #</th>
              <th className="px-4 py-3 text-left">Primary Contact</th>
              <th className="px-4 py-3 text-left">Address</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {distributors.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{d.account_number || "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-700">{d.order_poc_name || "—"}</td>
                <td className="px-4 py-3 whitespace-pre-line text-xs text-slate-700">{d.address || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setEditing(d)} className="text-xs font-medium text-sky-700 hover:text-sky-800">
                      Edit
                    </button>
                    <button onClick={() => onDelete(d.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {distributors.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  No subs or suppliers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.name ? "Edit Sub / Supplier" : "New Sub / Supplier"}>
          <div className="space-y-4">
            <Input label="Name" required value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Trade or Account #" value={editing.account_number} onChange={(v) => setEditing({ ...editing, account_number: v })} placeholder="Plumber, Electrician, Lumber yard…" />
              <Input label="Primary contact" value={editing.order_poc_name ?? ""} onChange={(v) => setEditing({ ...editing, order_poc_name: v })} />
            </div>
            <TextArea label="Address" value={editing.address} onChange={(v) => setEditing({ ...editing, address: v })} />
            <TextArea label="Notes" value={editing.notes} onChange={(v) => setEditing({ ...editing, notes: v })} />
          </div>
          <ModalFooter onCancel={() => setEditing(null)} onSave={onSave} />
        </Modal>
      )}
    </AppShell>
  );
}
