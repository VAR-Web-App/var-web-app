"use client";

// "Filing contacts" — the builder-managed trust list for the email/text
// ingestor. Emails and phone numbers here auto-file onto their project. Add a
// sender ahead of time (so their first message files without a trip through
// the Unassigned queue), see everything that's wired up, and remove learned
// ones. Reuses the deal's ship_to_poc_* (primary, read-only here) plus the
// known_emails / known_phones arrays the matcher already checks.

import { useEffect, useState } from "react";
import { XMarkIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { listDeals, addKnownContact, removeKnownContact } from "@/lib/store";
import type { Deal } from "@/types";

export default function FilingContactsModal({
  orgRef,
  onClose,
}: {
  orgRef: string;
  onClose: () => void;
}) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealId, setDealId] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const d = await listDeals(orgRef);
    setDeals(d);
    setLoaded(true);
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgRef]);

  async function add() {
    if (!dealId || !value.trim() || busy) return;
    setBusy(true);
    try {
      await addKnownContact(dealId, value);
      setValue("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(dRef: string, contact: string, kind: "email" | "phone") {
    await removeKnownContact(dRef, contact, kind).catch(() => {});
    await refresh();
  }

  const rows = deals
    .map((d) => {
      const emails = [
        ...(d.ship_to_poc_email ? [{ v: d.ship_to_poc_email, primary: true }] : []),
        ...(d.known_emails ?? []).map((v) => ({ v, primary: false })),
      ];
      const phones = [
        ...(d.ship_to_poc_phone ? [{ v: d.ship_to_poc_phone, primary: true }] : []),
        ...(d.known_phones ?? []).map((v) => ({ v, primary: false })),
      ];
      return { deal: d, emails, phones };
    })
    .filter((r) => r.emails.length + r.phones.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Filing contacts
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Emails &amp; phone numbers here auto-file onto their project when
              a client writes in. Add one ahead of time so their first message
              lands on the right job.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Add form */}
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-[11px] font-medium text-slate-600">
                Project
              </span>
              <select
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
              >
                <option value="">Choose a project…</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-[11px] font-medium text-slate-600">
                Email or phone
              </span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void add()}
                placeholder="client@email.com or (210) 555-0142"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
              />
            </label>
            <button
              onClick={() => void add()}
              disabled={!dealId || !value.trim() || busy}
              className="inline-flex items-center gap-1 rounded-md bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        {/* List */}
        <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
          {!loaded ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              No filing contacts yet. Add one above, or set a client&rsquo;s
              email/phone on their project.
            </p>
          ) : (
            <ul className="space-y-3">
              {rows.map(({ deal, emails, phones }) => (
                <li key={deal.id}>
                  <p className="text-xs font-semibold text-slate-700">
                    {deal.name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {emails.map((e) => (
                      <Chip
                        key={`e${e.v}`}
                        label={e.v}
                        primary={e.primary}
                        onRemove={
                          e.primary
                            ? undefined
                            : () => void remove(deal.id, e.v, "email")
                        }
                      />
                    ))}
                    {phones.map((p) => (
                      <Chip
                        key={`p${p.v}`}
                        label={p.v}
                        primary={p.primary}
                        onRemove={
                          p.primary
                            ? undefined
                            : () => void remove(deal.id, p.v, "phone")
                        }
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({
  label,
  primary,
  onRemove,
}: {
  label: string;
  primary: boolean;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-xs text-slate-700">
      {label}
      {primary ? (
        <span className="ml-0.5 rounded-full bg-slate-200 px-1.5 text-[9px] font-semibold uppercase text-slate-500">
          primary
        </span>
      ) : (
        <button
          onClick={onRemove}
          title="Remove from filing list"
          className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
        >
          <TrashIcon className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
