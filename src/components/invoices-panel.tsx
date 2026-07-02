"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PlusIcon,
  DocumentTextIcon,
  TrashIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { Deal, newId, Invoice, InvoiceLineItem, INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES } from "@/types";
import {
  listInvoices,
  saveInvoice,
  deleteInvoice,
} from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import Tooltip from "@/components/tooltip";
import type { ParsedInvoice } from "@/app/api/invoice/parse/route";

const fmtMoney = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoicesPanel({ deal }: { deal: Deal }) {
  const { profile } = useAuth();
  const [items, setItems] = useState<Invoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [viewing, setViewing] = useState<Invoice | null>(null);

  useEffect(() => {
    let active = true;
    listInvoices(deal.id).then((invs) => {
      if (active) { setItems(invs); setLoaded(true); }
    });
    return () => { active = false; };
  }, [deal.id]);

  const totals = useMemo(() => {
    const total = items.reduce((s, inv) => s + inv.total, 0);
    const matched = items.filter((i) => i.status !== "pending").length;
    const pending = items.filter((i) => i.status === "pending").length;
    return { total, matched, pending };
  }, [items]);

  async function onImported(inv: Invoice) {
    // Auto-match to this deal
    const matched: Invoice = {
      ...inv,
      deal_ref: deal.id,
      status: "matched",
      updated_at: new Date().toISOString(),
    };
    await saveInvoice(matched);
    setItems((prev) => [matched, ...prev].sort((a, b) =>
      (b.invoice_date ?? "").localeCompare(a.invoice_date ?? "")));
    setShowImport(false);
  }

  async function onRemove(inv: Invoice) {
    if (!confirm(`Delete invoice "${inv.vendor_name} — ${fmtMoney(inv.total)}"?`)) return;
    await deleteInvoice(inv.id);
    setItems((prev) => prev.filter((i) => i.id !== inv.id));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Invoices</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {items.length} invoice{items.length !== 1 ? "s" : ""} · {fmtMoney(totals.total)} total
            {totals.pending > 0 && <> · {totals.pending} unmatched</>}
          </p>
        </div>
        <Tooltip
          variant="directive"
          label="Import an invoice by pasting a forwarded email or uploading a PDF/image. AI extracts vendor, amounts, and line items automatically."
          placement="left"
        >
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Import invoice
          </button>
        </Tooltip>
      </div>

      {!loaded ? (
        <div className="px-6 py-6 text-sm text-slate-500">Loading invoices…</div>
      ) : items.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <DocumentTextIcon className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No invoices yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Import sub and supplier invoices by forwarding emails or uploading PDFs.
            AI extracts the details — vendor, amounts, line items — and matches them to your project.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((inv) => (
            <InvoiceRow
              key={inv.id}
              inv={inv}
              onOpen={() => setViewing(inv)}
              onRemove={() => onRemove(inv)}
            />
          ))}
        </ul>
      )}

      {showImport && (
        <ImportInvoiceModal
          orgRef={profile?.org_ref ?? ""}
          onImported={onImported}
          onClose={() => setShowImport(false)}
        />
      )}

      {viewing && (
        <InvoiceDetailModal
          inv={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}

// ── Row ─────────────────────────────────────────────────────────

function InvoiceRow({
  inv,
  onOpen,
  onRemove,
}: {
  inv: Invoice;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-start gap-3 px-6 py-4 hover:bg-slate-50">
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold text-slate-900">{inv.vendor_name}</span>
          {inv.invoice_number && (
            <span className="font-mono text-xs text-slate-500">#{inv.invoice_number}</span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${INVOICE_STATUS_STYLES[inv.status]}`}>
            {INVOICE_STATUS_LABELS[inv.status]}
          </span>
          <span className="ml-auto text-sm font-semibold tabular-nums text-slate-900">
            {fmtMoney(inv.total)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          {inv.invoice_date && <span>{new Date(inv.invoice_date + "T00:00:00").toLocaleDateString()}</span>}
          <span>·</span>
          <span>{inv.line_items.length} line item{inv.line_items.length !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span className="capitalize">{inv.source}</span>
          {inv.parse_confidence && (
            <>
              <span>·</span>
              <span className={
                inv.parse_confidence === "high" ? "text-emerald-600" :
                inv.parse_confidence === "medium" ? "text-amber-600" : "text-red-600"
              }>
                {inv.parse_confidence} confidence
              </span>
            </>
          )}
        </div>
      </button>
      <button
        onClick={onRemove}
        className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
        title="Delete invoice"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

// ── Import Modal ────────────────────────────────────────────────

function ImportInvoiceModal({
  orgRef,
  onImported,
  onClose,
}: {
  orgRef: string;
  onImported: (inv: Invoice) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"email" | "upload">("email");
  const [emailBody, setEmailBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null);
  const [source, setSource] = useState<"email" | "upload">("email");
  const [saving, setSaving] = useState(false);

  async function handleParse() {
    setParsing(true);
    setError(null);
    setParsed(null);

    try {
      let res: Response;
      if (mode === "email") {
        if (!emailBody.trim()) { setError("Paste the invoice email body"); setParsing(false); return; }
        res = await fetch("/api/invoice/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: emailBody }),
        });
        setSource("email");
      } else {
        if (!file) { setError("Select a file"); setParsing(false); return; }
        const fd = new FormData();
        fd.append("file", file);
        res = await fetch("/api/invoice/parse", { method: "POST", body: fd });
        setSource("upload");
      }

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Parse failed");
      } else {
        setParsed(data.invoice);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!parsed || saving) return;
    const now = new Date().toISOString();
    const inv: Invoice = {
      id: newId("inv"),
      org_ref: orgRef,
      vendor_name: parsed.vendor_name || "Unknown Vendor",
      invoice_number: parsed.invoice_number,
      invoice_date: parsed.invoice_date,
      due_date: parsed.due_date,
      po_number: parsed.po_number,
      total: parsed.total || 0,
      line_items: (parsed.line_items || []).map((li) => ({
        id: newId("li"),
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        unit_price: li.unit_price,
        extended: li.extended || 0,
      })),
      status: "pending",
      source,
      parse_confidence: parsed.confidence || "medium",
      raw_text: mode === "email" ? emailBody.substring(0, 5000) : undefined,
      created_at: now,
      updated_at: now,
    };
    setSaving(true);
    setError(null);
    try {
      await onImported(inv);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-3xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">Import Invoice</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Mode tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode("email")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                mode === "email"
                  ? "bg-sky-100 text-sky-800 ring-1 ring-sky-300"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <EnvelopeIcon className="h-3.5 w-3.5" />
              Paste email
            </button>
            <button
              onClick={() => setMode("upload")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                mode === "upload"
                  ? "bg-sky-100 text-sky-800 ring-1 ring-sky-300"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <ArrowUpTrayIcon className="h-3.5 w-3.5" />
              Upload file
            </button>
          </div>

          {mode === "email" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Paste the forwarded invoice email body
              </label>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={10}
                placeholder="Paste the full email text here (including headers if available)…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                autoFocus
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Upload invoice PDF or image
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sky-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-sky-700 hover:file:bg-sky-100"
              />
              {file && (
                <p className="mt-1 text-xs text-slate-500">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {error}
            </div>
          )}

          {!parsed && (
            <button
              onClick={handleParse}
              disabled={parsing || (mode === "email" ? !emailBody.trim() : !file)}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
            >
              {parsing ? "Parsing…" : "Parse invoice"}
            </button>
          )}

          {/* Parsed preview */}
          {parsed && (
            <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <CheckCircleIcon className="h-4 w-4" />
                Invoice parsed ({parsed.confidence} confidence)
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-slate-500">Vendor</span>
                  <p className="font-medium text-slate-900">{parsed.vendor_name || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Invoice #</span>
                  <p className="font-medium text-slate-900">{parsed.invoice_number || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Date</span>
                  <p className="font-medium text-slate-900">
                    {parsed.invoice_date ? new Date(parsed.invoice_date + "T00:00:00").toLocaleDateString() : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Total</span>
                  <p className="text-lg font-bold text-slate-900">{fmtMoney(parsed.total)}</p>
                </div>
              </div>

              {parsed.line_items.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-700">
                    Line items ({parsed.line_items.length})
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600">Description</th>
                          <th className="px-2 py-1.5 text-right font-medium text-slate-600">Qty</th>
                          <th className="px-2 py-1.5 text-right font-medium text-slate-600">Unit $</th>
                          <th className="px-2 py-1.5 text-right font-medium text-slate-600">Extended</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsed.line_items.map((li, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1.5 text-slate-900">{li.description}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                              {li.quantity ?? "—"}{li.unit ? ` ${li.unit}` : ""}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                              {li.unit_price != null ? fmtMoney(li.unit_price) : "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium tabular-nums text-slate-900">
                              {fmtMoney(li.extended)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
          {parsed && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
            >
              <LinkIcon className="h-4 w-4" />
              {saving ? "Saving…" : "Save & match to project"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detail Modal ────────────────────────────────────────────────

function InvoiceDetailModal({
  inv,
  onClose,
}: {
  inv: Invoice;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{inv.vendor_name}</h3>
            <p className="text-xs text-slate-500">
              {inv.invoice_number && `#${inv.invoice_number} · `}
              {inv.invoice_date && new Date(inv.invoice_date + "T00:00:00").toLocaleDateString()}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-xs text-slate-500">Total</span>
              <p className="text-xl font-bold text-slate-900">{fmtMoney(inv.total)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Status</span>
              <p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${INVOICE_STATUS_STYLES[inv.status]}`}>
                  {INVOICE_STATUS_LABELS[inv.status]}
                </span>
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Source</span>
              <p className="text-sm capitalize text-slate-700">{inv.source}</p>
            </div>
          </div>

          {inv.po_number && (
            <div>
              <span className="text-xs text-slate-500">PO Number</span>
              <p className="text-sm text-slate-700">{inv.po_number}</p>
            </div>
          )}

          {inv.line_items.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-700">
                Line items ({inv.line_items.length})
              </p>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Description</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600">Qty</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600">Unit $</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600">Extended</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inv.line_items.map((li) => (
                      <tr key={li.id}>
                        <td className="px-3 py-2 text-slate-900">{li.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {li.quantity ?? "—"}{li.unit ? ` ${li.unit}` : ""}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {li.unit_price != null ? fmtMoney(li.unit_price) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                          {fmtMoney(li.extended)}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{li.cat_id || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {inv.notes && (
            <div>
              <span className="text-xs text-slate-500">Notes</span>
              <p className="text-sm text-slate-700">{inv.notes}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
