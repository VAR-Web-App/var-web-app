"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PlusIcon,
  ScissorsIcon,
  TrashIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import { Deal, newId } from "@/types";
import {
  ProjectChangeOrder,
  ChangeOrderStatus,
  ChangeOrderReason,
  CHANGE_ORDER_STATUS_LABELS,
  CHANGE_ORDER_STATUS_STYLES,
  CHANGE_ORDER_REASON_LABELS,
} from "@/types/builder";
import {
  listChangeOrders,
  saveChangeOrder,
  deleteChangeOrder,
} from "@/lib/store";

const fmtMoney = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function ChangeOrdersPanel({ deal }: { deal: Deal }) {
  const [items, setItems] = useState<ProjectChangeOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<ProjectChangeOrder | null>(null);

  useEffect(() => {
    let active = true;
    listChangeOrders(deal.id).then((co) => {
      if (active) {
        setItems(co);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, [deal.id]);

  const totals = useMemo(() => {
    const approved = items.filter((c) => c.status === "approved");
    const pending = items.filter((c) => c.status === "sent");
    const approvedDelta = approved.reduce((s, c) => s + c.amount_delta, 0);
    const pendingDelta = pending.reduce((s, c) => s + c.amount_delta, 0);
    const approvedDays = approved.reduce((s, c) => s + c.schedule_impact_days, 0);
    return { approvedDelta, pendingDelta, approvedDays, approvedCount: approved.length, pendingCount: pending.length };
  }, [items]);

  function nextNumber() {
    const used = items.map((c) => parseInt(c.number.replace(/\D/g, ""), 10)).filter(Number.isFinite);
    const next = (used.length > 0 ? Math.max(...used) : 0) + 1;
    return `CO-${String(next).padStart(3, "0")}`;
  }

  async function onCreate(co: ProjectChangeOrder) {
    await saveChangeOrder(co);
    setItems((prev) => [...prev, co].sort((a, b) => a.number.localeCompare(b.number)));
    setShowNew(false);
  }

  async function onUpdate(co: ProjectChangeOrder) {
    await saveChangeOrder(co);
    setItems((prev) => prev.map((c) => (c.id === co.id ? co : c)));
    setEditing(null);
  }

  async function onRemove(co: ProjectChangeOrder) {
    if (!confirm(`Delete ${co.number} "${co.title}"?`)) return;
    await deleteChangeOrder(co.id);
    setItems((prev) => prev.filter((c) => c.id !== co.id));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Change Orders</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {totals.approvedCount} approved
            {totals.approvedCount > 0 && (
              <>
                {" · "}
                <span className={totals.approvedDelta >= 0 ? "text-emerald-700" : "text-red-700"}>
                  {totals.approvedDelta >= 0 ? "+" : "−"}{fmtMoney(totals.approvedDelta)}
                </span>
                {totals.approvedDays !== 0 && (
                  <> · {totals.approvedDays > 0 ? "+" : ""}{totals.approvedDays}d schedule</>
                )}
              </>
            )}
            {totals.pendingCount > 0 && <> · {totals.pendingCount} pending client approval</>}
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New change order
        </button>
      </div>

      {!loaded ? (
        <div className="px-6 py-6 text-sm text-slate-500">Loading change orders…</div>
      ) : items.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <ClipboardDocumentCheckIcon className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No change orders yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Document scope changes during construction — added work, credits back, schedule
            shifts. Each CO is signed by the client and adjusts the contract value.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((co) => (
            <COrow
              key={co.id}
              co={co}
              onOpen={() => setEditing(co)}
              onRemove={() => onRemove(co)}
            />
          ))}
        </ul>
      )}

      {showNew && (
        <ChangeOrderModal
          deal={deal}
          existing={null}
          nextNumber={nextNumber()}
          onSave={onCreate}
          onClose={() => setShowNew(false)}
        />
      )}
      {editing && (
        <ChangeOrderModal
          deal={deal}
          existing={editing}
          nextNumber={editing.number}
          onSave={onUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function COrow({
  co,
  onOpen,
  onRemove,
}: {
  co: ProjectChangeOrder;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const sign = co.amount_delta >= 0 ? "+" : "−";
  const tone = co.amount_delta >= 0 ? "text-emerald-700" : "text-red-700";
  return (
    <li className="flex items-start gap-3 px-6 py-4 hover:bg-slate-50">
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-xs font-semibold text-slate-700">{co.number}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${CHANGE_ORDER_STATUS_STYLES[co.status]}`}>
            {CHANGE_ORDER_STATUS_LABELS[co.status]}
          </span>
          <span className={`ml-auto text-xs font-semibold tabular-nums ${tone}`}>
            {sign}{fmtMoney(co.amount_delta)}
            {co.schedule_impact_days !== 0 && (
              <span className="ml-2 text-slate-500">
                {co.schedule_impact_days > 0 ? "+" : ""}{co.schedule_impact_days}d
              </span>
            )}
          </span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-slate-900">{co.title}</p>
        {co.description && (
          <p className="mt-0.5 truncate text-xs text-slate-500">{co.description}</p>
        )}
        <p className="mt-1 text-[11px] text-slate-400">
          {CHANGE_ORDER_REASON_LABELS[co.reason]}
          {co.approved_at && co.approval_signature && (
            <> · Signed by {co.approval_signature} on {new Date(co.approved_at).toLocaleDateString()}</>
          )}
        </p>
      </button>
      <button
        onClick={onRemove}
        className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
        title="Delete change order"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

function ChangeOrderModal({
  deal,
  existing,
  nextNumber,
  onSave,
  onClose,
}: {
  deal: Deal;
  existing: ProjectChangeOrder | null;
  nextNumber: string;
  onSave: (co: ProjectChangeOrder) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(existing?.title || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [amountDelta, setAmountDelta] = useState(existing?.amount_delta ?? 0);
  const [scheduleDays, setScheduleDays] = useState(existing?.schedule_impact_days ?? 0);
  const [reason, setReason] = useState<ChangeOrderReason>(existing?.reason || "client_request");
  const [notes, setNotes] = useState(existing?.notes || "");

  function buildCo(send: boolean): ProjectChangeOrder {
    const now = new Date().toISOString();
    const status: ChangeOrderStatus = existing?.status === "approved" || existing?.status === "rejected"
      ? existing.status
      : send ? "sent" : "draft";
    return {
      id: existing?.id || newId("co"),
      deal_ref: deal.id,
      org_ref: deal.org_ref,
      number: existing?.number || nextNumber,
      title: title.trim() || "Untitled Change Order",
      description,
      amount_delta: amountDelta,
      schedule_impact_days: scheduleDays,
      reason,
      status,
      approved_at: existing?.approved_at,
      approval_signature: existing?.approval_signature,
      rejection_reason: existing?.rejection_reason,
      notes,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
  }

  const sign = amountDelta >= 0 ? "+" : "−";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="my-8 w-full max-w-2xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">
            {existing ? `Edit ${existing.number}` : `New change order · ${nextNumber}`}
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Add window to master bath"'
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Scope description (sent to client)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detail what's changing, why, and any client-relevant notes…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Cost change ($)
                <span className="ml-1 text-[10px] font-normal text-slate-500">positive = add, negative = credit back</span>
              </label>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${amountDelta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {sign}
                </span>
                <input
                  type="number"
                  value={amountDelta}
                  onChange={(e) => setAmountDelta(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-base tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Schedule impact (days)
              </label>
              <input
                type="number"
                value={scheduleDays}
                onChange={(e) => setScheduleDays(parseInt(e.target.value, 10) || 0)}
                placeholder="0"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-base tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ChangeOrderReason)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {Object.entries(CHANGE_ORDER_REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Internal notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Notes only you see…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {existing?.status === "approved" && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <CheckBadgeIcon className="mr-1 inline-block h-4 w-4" />
              Approved by {existing.approval_signature || "client"}
              {existing.approved_at && <> on {new Date(existing.approved_at).toLocaleDateString()}</>}
              {". This CO is locked from edits — create a new CO if you need to revise."}
            </div>
          )}
          {existing?.status === "rejected" && existing.rejection_reason && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              Rejected by client. Reason: {existing.rejection_reason}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          {existing?.status !== "approved" && existing?.status !== "rejected" && (
            <>
              <button
                onClick={() => onSave(buildCo(false))}
                disabled={!title.trim()}
                className="rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save draft
              </button>
              <button
                onClick={() => onSave(buildCo(true))}
                disabled={!title.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                {existing?.status === "sent" ? "Save" : "Send for client approval"}
              </button>
            </>
          )}
          {(existing?.status === "approved" || existing?.status === "rejected") && (
            <button
              onClick={() => onSave(buildCo(false))}
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

void ScissorsIcon; // silence unused import — reserved for future "split CO" action
