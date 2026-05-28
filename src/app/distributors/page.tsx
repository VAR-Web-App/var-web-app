"use client";

import { useEffect, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentListIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import Tooltip from "@/components/tooltip";
import { Distributor, Deal } from "@/types";
import { ProjectRFQ, RFQ_STATUS_LABELS, RFQ_STATUS_STYLES } from "@/types/builder";
import {
  listDistributors,
  saveDistributor,
  deleteDistributor,
  newId,
  refreshSubScheduleLink,
  getSettings,
  listDeals,
  listRFQs,
} from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { Modal, ModalFooter, Input, TextArea } from "../accounts/page";

export default function DistributorsPage() {
  const { profile } = useAuth();
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [editing, setEditing] = useState<Distributor | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  // Org-wide RFQs for the aggregator panel at the top of the page.
  // We fetch all deals, then all RFQs per deal, then filter to the
  // open / in-flight ones (status !== "awarded" && !== "closed").
  // Each row links into the project's Finances tab where the full
  // RFQ panel lives.
  const [openRfqs, setOpenRfqs] = useState<
    Array<{ rfq: ProjectRFQ; deal: Deal }>
  >([]);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    void (async () => {
      const [subs, deals] = await Promise.all([
        listDistributors(profile.org_ref),
        listDeals(profile.org_ref),
      ]);
      if (!active) return;
      setDistributors(subs);

      // Fan out RFQ queries per deal — same approach as Inbox. Per-deal
      // failures degrade to empty so one broken project can't strand
      // the whole list.
      const rfqLists = await Promise.all(
        deals.map(async (d) => {
          try {
            const rs = await listRFQs(d.id);
            return rs.map((rfq) => ({ rfq, deal: d }));
          } catch {
            return [];
          }
        }),
      );
      if (!active) return;
      const open = rfqLists
        .flat()
        .filter(({ rfq }) => rfq.status !== "awarded" && rfq.status !== "closed");
      open.sort((a, b) =>
        (b.rfq.updated_at || "").localeCompare(a.rfq.updated_at || ""),
      );
      setOpenRfqs(open);
    })();
    return () => {
      active = false;
    };
  }, [profile]);

  /** Open the sub's portal in a new tab. Refreshes (or generates) the
   *  schedule token first so the URL is always valid. */
  async function previewPortal(sub: Distributor) {
    if (!profile) return;
    setPreviewingId(sub.id);
    try {
      const settings = await getSettings(profile.org_ref);
      const builderName = settings?.company_name?.trim() || "your builder";
      const token = await refreshSubScheduleLink(sub.id, builderName);
      window.open(`/s/${token}`, "_blank", "noopener,noreferrer");
      // Refresh the list so any newly-created token is reflected.
      setDistributors(await listDistributors(profile.org_ref));
    } catch (e) {
      console.warn("[distributors] preview portal failed", e);
      alert("Couldn't open portal — check console.");
    } finally {
      setPreviewingId(null);
    }
  }

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
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            <span className="md:hidden">Subs</span>
            <span className="hidden md:inline">Subs & Suppliers</span>
          </h1>
          <p className="mt-1 hidden text-sm text-slate-500 md:block">
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
            className="flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 sm:px-4"
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">New Sub / Supplier</span>
            <span className="sm:hidden">New</span>
          </button>
        </Tooltip>
      </div>

      {/* Org-wide open RFQs. Aggregated across every project so the
       *  builder can manage active bid requests without drilling into
       *  each deal's Finances tab one at a time. Awarded + closed RFQs
       *  are filtered out — those don't need attention. */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ClipboardDocumentListIcon className="h-4 w-4 text-slate-500" />
              Open RFQs
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Active bid requests across every project. Click through to
              the project to review bids or award.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            {openRfqs.length}
          </span>
        </header>
        {openRfqs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            No open RFQs across your projects. Create one from a
            project&apos;s Finances tab.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {openRfqs.map(({ rfq, deal }) => {
              const bids = rfq.invitees.filter(
                (i) => typeof i.bid_amount === "number" && i.bid_amount > 0,
              );
              const sent = rfq.invitees.length;
              const responded = bids.length;
              return (
                <li key={rfq.id}>
                  <Link
                    href={`/deals/${deal.id}/finances`}
                    className="block px-4 py-3 transition hover:bg-slate-50 sm:px-6"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {rfq.scope_title}
                      </p>
                      <span className="shrink-0 text-xs text-slate-500">
                        {deal.name}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${RFQ_STATUS_STYLES[rfq.status]}`}
                      >
                        {RFQ_STATUS_LABELS[rfq.status]}
                      </span>
                      <span>
                        {responded} of {sent} bid{sent === 1 ? "" : "s"} in
                      </span>
                      {rfq.phase && (
                        <span className="text-slate-500">{rfq.phase}</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Desktop table — hidden on mobile in favor of the card list below. */}
      <section className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Trade / Account #</th>
              <th className="px-4 py-3 text-left">Primary Contact</th>
              <th className="px-4 py-3 text-left">Mobile</th>
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
                <td className="px-4 py-3 text-xs text-slate-700">{d.phone || "—"}</td>
                <td className="px-4 py-3 whitespace-pre-line text-xs text-slate-700">{d.address || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Tooltip
                      label="See exactly what this sub sees when they open their portal link — schedule, payments, awarded scopes."
                      placement="left"
                    >
                      <button
                        onClick={() => void previewPortal(d)}
                        disabled={previewingId === d.id}
                        className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800 disabled:opacity-50"
                      >
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        {previewingId === d.id ? "Opening…" : "Preview portal"}
                      </button>
                    </Tooltip>
                    <button onClick={() => setEditing(d)} className="text-xs font-medium text-slate-700 hover:text-slate-900">
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
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No subs or suppliers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Mobile card list — table doesn't work at phone widths. Same
       *  data: name + trade + contact + phone + address + actions, but
       *  stacked vertically per row. */}
      <section className="space-y-2 md:hidden">
        {distributors.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
            No subs or suppliers yet.
          </p>
        ) : (
          distributors.map((d) => (
            <div
              key={d.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{d.name}</p>
                  {d.account_number && (
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                      {d.account_number}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onDelete(d.id)}
                  aria-label="Delete"
                  className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
              {(d.order_poc_name || d.phone) && (
                <p className="mt-2 text-xs text-slate-600">
                  {d.order_poc_name || "—"}
                  {d.phone && (
                    <>
                      {" · "}
                      <a
                        href={`tel:${d.phone}`}
                        className="text-sky-700"
                      >
                        {d.phone}
                      </a>
                    </>
                  )}
                </p>
              )}
              {d.address && (
                <p className="mt-1 whitespace-pre-line text-xs text-slate-500">
                  {d.address}
                </p>
              )}
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => void previewPortal(d)}
                  disabled={previewingId === d.id}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800 disabled:opacity-50"
                >
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                  {previewingId === d.id ? "Opening…" : "Preview portal"}
                </button>
                <button
                  onClick={() => setEditing(d)}
                  className="text-xs font-medium text-slate-700 hover:text-slate-900"
                >
                  Edit
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.name ? "Edit Sub / Supplier" : "New Sub / Supplier"}>
          <div className="space-y-4">
            <Input label="Name" required value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Trade or Account #" value={editing.account_number} onChange={(v) => setEditing({ ...editing, account_number: v })} placeholder="Plumber, Electrician, Lumber yard…" />
              <Input label="Primary contact" value={editing.order_poc_name ?? ""} onChange={(v) => setEditing({ ...editing, order_poc_name: v })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Mobile number" value={editing.phone ?? ""} onChange={(v) => setEditing({ ...editing, phone: v })} placeholder="(210) 555-0142" />
              <Input label="Email" value={editing.email ?? ""} onChange={(v) => setEditing({ ...editing, email: v })} placeholder="mike@example.com" />
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={editing.sms_consent ?? false}
                onChange={(e) => setEditing({ ...editing, sms_consent: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-sky-700"
              />
              <span>
                This sub agreed to receive schedule text notifications.
                KeystonePro won&apos;t text a sub until this is checked.
              </span>
            </label>
            <TextArea label="Address" value={editing.address} onChange={(v) => setEditing({ ...editing, address: v })} />
            <TextArea label="Notes" value={editing.notes} onChange={(v) => setEditing({ ...editing, notes: v })} />
          </div>
          <ModalFooter onCancel={() => setEditing(null)} onSave={onSave} />
        </Modal>
      )}
    </AppShell>
  );
}
