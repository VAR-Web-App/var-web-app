"use client";

import { useEffect, useState } from "react";
import {
  PlusIcon,
  ClipboardDocumentListIcon,
  PaperAirplaneIcon,
  TrashIcon,
  XMarkIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { Deal, Distributor, newId } from "@/types";
import {
  ProjectRFQ,
  RFQInvitee,
  RFQ_STATUS_LABELS,
  RFQ_STATUS_STYLES,
  PROJECT_PHASES,
  ProjectPhase,
} from "@/types/builder";
import {
  listRFQs,
  saveRFQ,
  deleteRFQ,
  listDistributors,
} from "@/lib/store";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function RFQPanel({ deal }: { deal: Deal }) {
  const [rfqs, setRfqs] = useState<ProjectRFQ[]>([]);
  const [subs, setSubs] = useState<Distributor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<ProjectRFQ | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listRFQs(deal.id), listDistributors(deal.org_ref)]).then(
      ([r, s]) => {
        if (!active) return;
        setRfqs(r);
        setSubs(s);
        setLoaded(true);
      }
    );
    return () => { active = false; };
  }, [deal.id, deal.org_ref]);

  async function onCreate(rfq: ProjectRFQ) {
    await saveRFQ(rfq);
    setRfqs((prev) => [rfq, ...prev]);
    setShowNew(false);
  }

  async function onUpdate(rfq: ProjectRFQ) {
    await saveRFQ(rfq);
    setRfqs((prev) => prev.map((r) => (r.id === rfq.id ? rfq : r)));
    setEditing(null);
  }

  async function onRemove(rfq: ProjectRFQ) {
    if (!confirm(`Delete RFQ "${rfq.scope_title}"?`)) return;
    await deleteRFQ(rfq.id);
    setRfqs((prev) => prev.filter((r) => r.id !== rfq.id));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Subcontractor RFQs</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {rfqs.length} bid request{rfqs.length === 1 ? "" : "s"} on this project
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New RFQ
        </button>
      </div>

      {!loaded ? (
        <div className="px-6 py-6 text-sm text-slate-500">Loading RFQs…</div>
      ) : rfqs.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <ClipboardDocumentListIcon className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No bid requests yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Send a scope to multiple subs, compare their bids side by side, lock in your winner.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rfqs.map((r) => (
            <RFQRow
              key={r.id}
              rfq={r}
              onOpen={() => setEditing(r)}
              onRemove={() => onRemove(r)}
            />
          ))}
        </ul>
      )}

      {showNew && (
        <RFQModal
          deal={deal}
          subs={subs}
          onSave={onCreate}
          onClose={() => setShowNew(false)}
        />
      )}
      {editing && (
        <RFQModal
          deal={deal}
          subs={subs}
          existing={editing}
          onSave={onUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function RFQRow({
  rfq,
  onOpen,
  onRemove,
}: {
  rfq: ProjectRFQ;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const responded = rfq.invitees.filter((i) => i.status !== "sent").length;
  const winningBid = rfq.invitees.find((i) => i.status === "selected");
  const lowestBid = rfq.invitees
    .filter((i) => i.bid_amount && i.bid_amount > 0)
    .sort((a, b) => (a.bid_amount || 0) - (b.bid_amount || 0))[0];

  return (
    <li className="flex items-start gap-3 px-6 py-4 hover:bg-slate-50">
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-sm font-medium text-slate-900">{rfq.scope_title}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${RFQ_STATUS_STYLES[rfq.status]}`}>
            {RFQ_STATUS_LABELS[rfq.status]}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {rfq.phase}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">
          {rfq.invitees.length} sub{rfq.invitees.length === 1 ? "" : "s"} · {responded} responded
          {winningBid && winningBid.bid_amount
            ? ` · awarded to ${winningBid.sub_name} at ${fmtMoney(winningBid.bid_amount)}`
            : lowestBid && lowestBid.bid_amount
            ? ` · low bid ${fmtMoney(lowestBid.bid_amount)} (${lowestBid.sub_name})`
            : ""}
        </p>
      </button>
      <button
        onClick={onRemove}
        className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
        title="Delete RFQ"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

function RFQModal({
  deal,
  subs,
  existing,
  onSave,
  onClose,
}: {
  deal: Deal;
  subs: Distributor[];
  existing?: ProjectRFQ;
  onSave: (rfq: ProjectRFQ) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(existing?.scope_title || "");
  const [description, setDescription] = useState(existing?.scope_description || "");
  const [phase, setPhase] = useState<ProjectPhase>(existing?.phase || "Foundation");
  const [invitees, setInvitees] = useState<RFQInvitee[]>(existing?.invitees || []);
  const [notes, setNotes] = useState(existing?.notes || "");
  const [status, setStatus] = useState(existing?.status || "draft");

  function toggleSub(sub: Distributor) {
    const exists = invitees.find((i) => i.sub_ref === sub.id);
    if (exists) {
      setInvitees(invitees.filter((i) => i.sub_ref !== sub.id));
    } else {
      setInvitees([
        ...invitees,
        { sub_ref: sub.id, sub_name: sub.name, status: "sent" },
      ]);
    }
  }

  function updateInvitee(subRef: string, patch: Partial<RFQInvitee>) {
    setInvitees(invitees.map((i) => i.sub_ref === subRef ? { ...i, ...patch } : i));
  }

  async function save(send: boolean) {
    const now = new Date().toISOString();
    const rfq: ProjectRFQ = {
      id: existing?.id || newId("rfq"),
      deal_ref: deal.id,
      org_ref: deal.org_ref,
      scope_title: title.trim() || "Untitled RFQ",
      scope_description: description,
      phase,
      status: send ? (status === "draft" ? "sent" : status) : status,
      invitees,
      notes,
      sent_at: send && !existing?.sent_at ? now : existing?.sent_at,
      awarded_to_sub_ref: existing?.awarded_to_sub_ref,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    onSave(rfq);
  }

  function awardTo(subRef: string) {
    setInvitees(
      invitees.map((i) => ({
        ...i,
        status: i.sub_ref === subRef ? "selected" : i.status === "selected" ? "passed" : i.status,
      }))
    );
    setStatus("awarded");
  }

  const respondedCount = invitees.filter((i) => i.status !== "sent").length;
  const sortedInvitees = [...invitees].sort((a, b) => {
    // Selected first, then by bid amount, then by name
    if (a.status === "selected" && b.status !== "selected") return -1;
    if (b.status === "selected" && a.status !== "selected") return 1;
    if (a.bid_amount && b.bid_amount) return a.bid_amount - b.bid_amount;
    return a.sub_name.localeCompare(b.sub_name);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="my-8 w-full max-w-3xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">
            {existing ? "Edit RFQ" : "New RFQ"}
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Scope title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Foundation excavation + footings"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Phase</label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value as ProjectPhase)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {PROJECT_PHASES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Scope description (sent to subs)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detailed scope of work, materials, timeline expectations…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Sub picker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Send to subs ({invitees.length} selected)
            </label>
            {subs.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                No subs in your directory yet. Add subs from the Subs &amp; Suppliers page first.
              </p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                {subs.map((s) => {
                  const checked = invitees.some((i) => i.sub_ref === s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 ${checked ? "bg-sky-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSub(s)}
                        className="rounded text-sky-600 focus:ring-sky-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{s.name}</p>
                        {s.account_number && (
                          <p className="truncate text-[11px] text-slate-500">{s.account_number}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Invitee grid (only when there are subs selected and we're editing or post-draft) */}
          {invitees.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Bid responses {respondedCount > 0 && `(${respondedCount} of ${invitees.length})`}
              </label>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2">Sub</th>
                      <th className="px-3 py-2 text-right">Bid amount</th>
                      <th className="px-3 py-2">Notes</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedInvitees.map((inv) => (
                      <tr
                        key={inv.sub_ref}
                        className={inv.status === "selected" ? "bg-emerald-50" : "bg-white"}
                      >
                        <td className="px-3 py-2 font-medium text-slate-900">{inv.sub_name}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={inv.bid_amount ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateInvitee(inv.sub_ref, {
                                bid_amount: v === "" ? undefined : parseFloat(v),
                                status: v === "" ? "sent" : "responded",
                                responded_at: v !== "" && !inv.responded_at ? new Date().toISOString() : inv.responded_at,
                              });
                            }}
                            placeholder="—"
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-xs tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={inv.bid_notes || ""}
                            onChange={(e) => updateInvitee(inv.sub_ref, { bid_notes: e.target.value })}
                            placeholder="Inclusions/exclusions…"
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-[11px]">
                          <span className={`rounded-full px-1.5 py-0.5 ${
                            inv.status === "selected" ? "bg-emerald-100 text-emerald-700" :
                            inv.status === "responded" ? "bg-blue-100 text-blue-700" :
                            inv.status === "passed" ? "bg-slate-100 text-slate-500" :
                            "bg-sky-100 text-sky-700"
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {inv.status !== "selected" && inv.bid_amount && (
                            <button
                              onClick={() => awardTo(inv.sub_ref)}
                              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100"
                              title="Award this bid"
                            >
                              Award
                            </button>
                          )}
                          {inv.status === "selected" && (
                            <CheckCircleIcon className="ml-auto h-4 w-4 text-emerald-600" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => save(false)}
            className="rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100"
          >
            Save draft
          </button>
          <button
            onClick={() => save(true)}
            disabled={invitees.length === 0 || !title.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            {existing?.sent_at ? "Save" : `Send to ${invitees.length} sub${invitees.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
