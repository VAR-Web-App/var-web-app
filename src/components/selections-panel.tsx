"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PlusIcon,
  SwatchIcon,
  TrashIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  CheckBadgeIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Deal, newId } from "@/types";
import {
  ProjectSelection,
  SelectionOption,
  SelectionStatus,
  SelectionCategory,
  SELECTION_CATEGORIES,
  SELECTION_CATEGORY_LABELS,
  SELECTION_STATUS_LABELS,
  SELECTION_STATUS_STYLES,
} from "@/types/builder";
import {
  listSelections,
  saveSelection,
  deleteSelection,
} from "@/lib/store";
import { SELECTION_TEMPLATES } from "@/lib/selections/templates";
import Tooltip from "@/components/tooltip";

const fmtMoney = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

export default function SelectionsPanel({ deal }: { deal: Deal }) {
  const [items, setItems] = useState<ProjectSelection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<ProjectSelection | null>(null);

  useEffect(() => {
    let active = true;
    listSelections(deal.id).then((sels) => {
      if (active) {
        setItems(sels);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, [deal.id]);

  const totals = useMemo(() => {
    const approved = items.filter((s) => s.status === "approved" || s.status === "over_allowance");
    const pending = items.filter((s) => s.status === "sent");
    const totalAllowance = items.reduce((s, sel) => s + sel.allowance, 0);
    const overAllowanceTotal = items
      .filter((s) => s.status === "over_allowance" && s.selected_option_id)
      .reduce((s, sel) => {
        const opt = sel.options.find((o) => o.id === sel.selected_option_id);
        return s + Math.max(0, (opt?.cost ?? 0) - sel.allowance);
      }, 0);
    return {
      approvedCount: approved.length,
      pendingCount: pending.length,
      totalAllowance,
      overAllowanceTotal,
    };
  }, [items]);

  function nextNumber() {
    const used = items.map((s) => parseInt(s.number.replace(/\D/g, ""), 10)).filter(Number.isFinite);
    const next = (used.length > 0 ? Math.max(...used) : 0) + 1;
    return `SEL-${String(next).padStart(3, "0")}`;
  }

  async function onCreate(sel: ProjectSelection) {
    await saveSelection(sel);
    setItems((prev) => [...prev, sel].sort((a, b) => a.number.localeCompare(b.number)));
    setShowNew(false);
  }

  async function onUpdate(sel: ProjectSelection) {
    await saveSelection(sel);
    setItems((prev) => prev.map((s) => (s.id === sel.id ? sel : s)));
    setEditing(null);
  }

  async function onRemove(sel: ProjectSelection) {
    if (!confirm(`Delete ${sel.number} "${sel.title}"?`)) return;
    await deleteSelection(sel.id);
    setItems((prev) => prev.filter((s) => s.id !== sel.id));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Selections</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {totals.approvedCount} approved · {fmtMoney(totals.totalAllowance)} total allowance
            {totals.overAllowanceTotal > 0 && (
              <>
                {" · "}
                <span className="text-orange-700">+{fmtMoney(totals.overAllowanceTotal)} over allowance</span>
              </>
            )}
            {totals.pendingCount > 0 && <> · {totals.pendingCount} pending client pick</>}
          </p>
        </div>
        <Tooltip
          variant="directive"
          label="Create a selection for the client to choose from — countertops, flooring, fixtures, etc. Set an allowance and curate options with costs. Over-allowance picks auto-create a change order."
          placement="left"
        >
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            New selection
          </button>
        </Tooltip>
      </div>

      {!loaded ? (
        <div className="px-6 py-6 text-sm text-slate-500">Loading selections…</div>
      ) : items.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <SwatchIcon className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No selections yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Create selections for your client to choose finishes, fixtures, and materials.
            Set an allowance per selection — over-allowance picks automatically create a change order.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((sel) => (
            <SelectionRow
              key={sel.id}
              sel={sel}
              onOpen={() => setEditing(sel)}
              onRemove={() => onRemove(sel)}
            />
          ))}
        </ul>
      )}

      {showNew && (
        <SelectionModal
          deal={deal}
          existing={null}
          nextNumber={nextNumber()}
          onSave={onCreate}
          onClose={() => setShowNew(false)}
        />
      )}
      {editing && (
        <SelectionModal
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

// ── Row ─────────────────────────────────────────────────────────

function SelectionRow({
  sel,
  onOpen,
  onRemove,
}: {
  sel: ProjectSelection;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const pickedOption = sel.selected_option_id
    ? sel.options.find((o) => o.id === sel.selected_option_id)
    : null;
  const delta = pickedOption ? pickedOption.cost - sel.allowance : null;

  const dueDays = sel.needed_by ? daysUntil(sel.needed_by) : null;
  const overdue = dueDays !== null && dueDays < 0 && sel.status !== "approved" && sel.status !== "over_allowance";
  const dueSoon = dueDays !== null && dueDays >= 0 && dueDays <= 7 && sel.status !== "approved" && sel.status !== "over_allowance";

  return (
    <li className="flex items-start gap-3 px-6 py-4 hover:bg-slate-50">
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-xs font-semibold text-slate-700">{sel.number}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
            {SELECTION_CATEGORY_LABELS[sel.category]}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${SELECTION_STATUS_STYLES[sel.status]}`}>
            {SELECTION_STATUS_LABELS[sel.status]}
          </span>
          <span className="ml-auto text-xs font-semibold tabular-nums text-slate-700">
            {fmtMoney(sel.allowance)} allowance
          </span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-slate-900">{sel.title}</p>
        {sel.description && (
          <p className="mt-0.5 truncate text-xs text-slate-500">{sel.description}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>{sel.options.length} option{sel.options.length !== 1 ? "s" : ""}</span>
          {pickedOption && (
            <>
              <span>·</span>
              <span>Picked: {pickedOption.label}</span>
              {delta !== null && delta > 0 && (
                <span className="font-semibold text-orange-600">+{fmtMoney(delta)} over</span>
              )}
            </>
          )}
          {sel.approved_at && sel.approval_signature && (
            <>
              <span>·</span>
              <span>Signed by {sel.approval_signature} on {new Date(sel.approved_at).toLocaleDateString()}</span>
            </>
          )}
          {overdue && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-red-600">
              <ExclamationTriangleIcon className="h-3 w-3" />
              Overdue {Math.abs(dueDays!)}d
            </span>
          )}
          {dueSoon && (
            <span className="font-semibold text-amber-600">
              Due in {dueDays}d
            </span>
          )}
        </div>
      </button>
      <button
        onClick={onRemove}
        className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
        title="Delete selection"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

// ── Modal ───────────────────────────────────────────────────────

function SelectionModal({
  deal,
  existing,
  nextNumber,
  onSave,
  onClose,
}: {
  deal: Deal;
  existing: ProjectSelection | null;
  nextNumber: string;
  onSave: (sel: ProjectSelection) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<SelectionCategory>(existing?.category || "countertops");
  const [title, setTitle] = useState(existing?.title || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [allowance, setAllowance] = useState(existing?.allowance ?? 0);
  const [neededBy, setNeededBy] = useState(existing?.needed_by || "");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [options, setOptions] = useState<SelectionOption[]>(existing?.options || []);

  function applyTemplate(tpl: typeof SELECTION_TEMPLATES[number]) {
    setCategory(tpl.category);
    setTitle(tpl.title);
    setAllowance(tpl.default_allowance);
    setOptions(
      tpl.default_options.map((o) => ({
        id: newId("opt"),
        label: o.label,
        description: o.description,
        cost: o.cost,
      })),
    );
  }

  function addOption() {
    setOptions((prev) => [
      ...prev,
      { id: newId("opt"), label: "", description: "", cost: 0 },
    ]);
  }

  function updateOption(id: string, patch: Partial<SelectionOption>) {
    setOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    );
  }

  function removeOption(id: string) {
    setOptions((prev) => prev.filter((o) => o.id !== id));
  }

  function buildSelection(send: boolean): ProjectSelection {
    const now = new Date().toISOString();
    const status: SelectionStatus =
      existing?.status === "approved" || existing?.status === "over_allowance"
        ? existing.status
        : send ? "sent" : "draft";
    return {
      id: existing?.id || newId("sel"),
      deal_ref: deal.id,
      org_ref: deal.org_ref,
      number: existing?.number || nextNumber,
      category,
      title: title.trim() || "Untitled Selection",
      description,
      allowance,
      options,
      selected_option_id: existing?.selected_option_id,
      status,
      needed_by: neededBy || undefined,
      linked_change_order_id: existing?.linked_change_order_id,
      approval_signature: existing?.approval_signature,
      approved_at: existing?.approved_at,
      notes,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
  }

  const isLocked = existing?.status === "approved" || existing?.status === "over_allowance";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="my-8 w-full max-w-3xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">
            {existing ? `Edit ${existing.number}` : `New selection · ${nextNumber}`}
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Template picker — only on create */}
          {!existing && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Start from template</label>
              <select
                onChange={(e) => {
                  const tpl = SELECTION_TEMPLATES.find((t) => t.category === e.target.value);
                  if (tpl) applyTemplate(tpl);
                }}
                defaultValue=""
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="" disabled>Choose a template (optional)…</option>
                {SELECTION_TEMPLATES.map((t) => (
                  <option key={t.category} value={t.category}>
                    {t.title} — {fmtMoney(t.default_allowance)} allowance
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category + Title */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SelectionCategory)}
                disabled={isLocked}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50"
              >
                {SELECTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{SELECTION_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='e.g. "Kitchen Countertops"'
                disabled={isLocked}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50"
                autoFocus
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Description (shown to client)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this selection covers…"
              disabled={isLocked}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50"
            />
          </div>

          {/* Allowance + Needed-by */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Allowance ($)
                <span className="ml-1 text-[10px] font-normal text-slate-500">budget for this selection</span>
              </label>
              <input
                type="number"
                value={allowance}
                onChange={(e) => setAllowance(parseFloat(e.target.value) || 0)}
                disabled={isLocked}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-base tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Needed by
                <span className="ml-1 text-[10px] font-normal text-slate-500">soft deadline</span>
              </label>
              <input
                type="date"
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
                disabled={isLocked}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50"
              />
            </div>
          </div>

          {/* Options */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">
                Options ({options.length})
              </label>
              {!isLocked && (
                <button
                  onClick={addOption}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                >
                  <PlusIcon className="h-3 w-3" /> Add option
                </button>
              )}
            </div>

            {options.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-400">
                No options yet. Add options for the client to choose from.
              </p>
            ) : (
              <div className="space-y-3">
                {options.map((opt) => {
                  const delta = opt.cost - allowance;
                  return (
                    <div key={opt.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <input
                                type="text"
                                value={opt.label}
                                onChange={(e) => updateOption(opt.id, { label: e.target.value })}
                                placeholder="Option name"
                                disabled={isLocked}
                                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-white"
                              />
                            </div>
                            <div>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1.5 text-sm text-slate-400">$</span>
                                <input
                                  type="number"
                                  value={opt.cost}
                                  onChange={(e) => updateOption(opt.id, { cost: parseFloat(e.target.value) || 0 })}
                                  disabled={isLocked}
                                  className="w-full rounded-md border border-slate-300 py-1.5 pl-6 pr-2.5 text-sm tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-white"
                                />
                              </div>
                              {allowance > 0 && (
                                <p className={`mt-0.5 text-[10px] font-semibold tabular-nums ${delta > 0 ? "text-orange-600" : delta < 0 ? "text-emerald-600" : "text-slate-400"}`}>
                                  {delta > 0 ? `+${fmtMoney(delta)} over` : delta < 0 ? `${fmtMoney(Math.abs(delta))} under` : "At allowance"}
                                </p>
                              )}
                            </div>
                          </div>
                          <input
                            type="text"
                            value={opt.description}
                            onChange={(e) => updateOption(opt.id, { description: e.target.value })}
                            placeholder="Description…"
                            disabled={isLocked}
                            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-white"
                          />
                        </div>
                        {!isLocked && (
                          <button
                            onClick={() => removeOption(opt.id)}
                            className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
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

          {/* Status banners */}
          {existing?.status === "approved" && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <CheckBadgeIcon className="mr-1 inline-block h-4 w-4" />
              Approved by {existing.approval_signature || "client"}
              {existing.approved_at && <> on {new Date(existing.approved_at).toLocaleDateString()}</>}
              . Within allowance — no change order created.
            </div>
          )}
          {existing?.status === "over_allowance" && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
              <ExclamationTriangleIcon className="mr-1 inline-block h-4 w-4" />
              Approved over allowance by {existing.approval_signature || "client"}
              {existing.approved_at && <> on {new Date(existing.approved_at).toLocaleDateString()}</>}
              . Change order {existing.linked_change_order_id ? "created" : "pending"} for the overage.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          {!isLocked && (
            <>
              <Tooltip label="Save without sending. You can keep editing and send later.">
                <button
                  onClick={() => onSave(buildSelection(false))}
                  disabled={!title.trim()}
                  className="rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save draft
                </button>
              </Tooltip>
              <Tooltip
                variant="directive"
                label="Push this selection to the client portal. They'll see the options with costs and can pick one."
                placement="top"
              >
                <button
                  onClick={() => onSave(buildSelection(true))}
                  disabled={!title.trim() || options.length === 0}
                  className="inline-flex items-center gap-1 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                  {existing?.status === "sent" ? "Save" : "Send for client pick"}
                </button>
              </Tooltip>
            </>
          )}
          {isLocked && (
            <button
              onClick={() => onSave(buildSelection(false))}
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
