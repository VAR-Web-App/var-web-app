"use client";

// Focused viewer for an email's attachment(s): preview the file, Parse it
// (line items + metadata) right here, Reply, or go Back — without leaving the
// Inbox. Opened from the "View" button on an email to-do that has attachments.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowUturnLeftIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { listAttachments, saveInvoice } from "@/lib/store";
import ReplyBox from "@/components/reply-box";
import { newId, type Invoice, type InvoiceLineItem } from "@/types";
import type { Attachment } from "@/types";

interface ParseResult {
  template_name: string;
  bom: Array<Record<string, unknown>>;
  metadata: Record<string, string | number | undefined>;
  total: number;
}

const isPdf = (n: string) => n.toLowerCase().endsWith(".pdf");
const isImg = (n: string) => /\.(png|jpe?g|gif|webp|heic)$/i.test(n);
const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AttachmentViewerModal({
  dealRef,
  orgRef,
  dealName,
  sourceKey,
  subject,
  fromLabel,
  toEmail,
  replyTo,
  threadId,
  onClose,
}: {
  dealRef: string;
  orgRef: string;
  dealName: string;
  sourceKey: string;
  subject: string;
  fromLabel: string;
  toEmail: string;
  replyTo?: string;
  threadId?: string;
  onClose: () => void;
}) {
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [selected, setSelected] = useState<Attachment | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<Record<string, ParseResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);

  async function saveAsInvoice(res: ParseResult) {
    setSavingInvoice(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const md = res.metadata;
      const num = (v: unknown) =>
        v == null ? undefined : Number(String(v).replace(/[^0-9.-]/g, ""));
      const line_items: InvoiceLineItem[] = res.bom.map((b) => ({
        id: newId("li"),
        description:
          [b.part_number, b.description].filter(Boolean).join(" — ") || "Item",
        quantity: num(b.qty),
        unit: b.unit ? String(b.unit) : undefined,
        unit_price: num(b.unit_price),
        extended: num(b.extended_price) ?? 0,
      }));
      const inv: Invoice = {
        id: newId("inv"),
        org_ref: orgRef,
        deal_ref: dealRef,
        vendor_name: md.vendor_name ? String(md.vendor_name) : "",
        invoice_number: md.document_number ? String(md.document_number) : undefined,
        invoice_date: md.document_date ? String(md.document_date) : undefined,
        total: num(md.total_amount) ?? res.total ?? 0,
        line_items,
        po_number: md.po_number ? String(md.po_number) : undefined,
        status: "matched",
        source: "email",
        parse_confidence: line_items.length > 0 ? "high" : "low",
        created_at: now,
        updated_at: now,
      };
      await saveInvoice(inv);
      setSavedInvoiceId(inv.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save invoice");
    } finally {
      setSavingInvoice(false);
    }
  }

  useEffect(() => {
    listAttachments(dealRef)
      .then((all) => {
        const mine = all.filter(
          (a) => a.category === "email" && a.source_message_id === sourceKey,
        );
        setAtts(mine);
        setSelected(mine[0] ?? null);
      })
      .catch(() => {});
  }, [dealRef, sourceKey]);

  async function parse() {
    if (!selected) return;
    setParsing(true);
    setError(null);
    try {
      const file = new File([await (await fetch(selected.url)).blob()], selected.name, {
        type: "application/pdf",
      });
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: form });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const dec = new TextDecoder();
      let buf = "";
      let parsed: {
        template_name: string;
        bom: Array<Record<string, unknown>>;
        metadata: Record<string, string | number | undefined>;
        totals: { parsed_extended_total: number };
      } | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          let ev = "message";
          let data = "";
          for (const line of f.split("\n")) {
            if (line.startsWith("event: ")) ev = line.slice(7).trim();
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (ev === "result" && data) parsed = JSON.parse(data);
        }
      }
      if (!parsed) throw new Error("Parser returned no result");
      setResult((prev) => ({
        ...prev,
        [selected.id]: {
          template_name: parsed!.template_name,
          bom: parsed!.bom,
          metadata: parsed!.metadata,
          total: parsed!.totals.parsed_extended_total,
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }

  const r = selected ? result[selected.id] : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-slate-900/60 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-slate-200 px-3 py-2.5">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {subject || "(no subject)"}
            </p>
            <p className="truncate text-xs text-slate-500">{fromLabel}</p>
          </div>
          <button
            onClick={() => setReplying((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700"
          >
            <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
            Reply
          </button>
          <button
            onClick={() => void parse()}
            disabled={parsing || !selected}
            className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            <DocumentTextIcon className="h-3.5 w-3.5" />
            {parsing ? "Parsing…" : r ? "Re-parse" : "Parse"}
          </button>
        </header>

        {atts.length > 1 && (
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 py-1.5">
            {atts.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${selected?.id === a.id ? "bg-white text-slate-900 ring-1 ring-slate-300" : "text-slate-500 hover:text-slate-700"}`}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        {r && (
          <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs">
            <p className="font-semibold text-emerald-800">
              ✓ Read {r.bom.length} line item{r.bom.length === 1 ? "" : "s"}
              {r.total ? ` · ${fmtMoney(r.total)}` : ""} from this document.
            </p>
            <p className="mt-0.5 text-emerald-700">
              The file is filed on <b>{dealName}</b>&rsquo;s Files. Save it as an
              invoice to track the cost on the Finances tab.
            </p>
            <div className="mt-1">
              {Object.entries(r.metadata)
                .filter(([, v]) => v != null && v !== "")
                .slice(0, 6)
                .map(([k, v]) => (
                  <span key={k} className="mr-3 text-emerald-700">
                    {k.replace(/_/g, " ")}: <b>{String(v)}</b>
                  </span>
                ))}
            </div>
            <div className="mt-2">
              {savedInvoiceId ? (
                <Link
                  href={`/deals/${dealRef}/finances?invoice=${savedInvoiceId}#invoices`}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700"
                >
                  ✓ Saved as invoice — open it on Finances →
                </Link>
              ) : (
                <button
                  onClick={() => void saveAsInvoice(r)}
                  disabled={savingInvoice}
                  className="rounded-md bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingInvoice
                    ? "Saving…"
                    : `Save as invoice on ${dealName}`}
                </button>
              )}
            </div>
          </div>
        )}
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {replying && (
          <div className="border-b border-sky-200 bg-sky-50/60 p-3">
            <ReplyBox
              to={toEmail}
              subject={subject}
              replyTo={replyTo}
              dealRef={dealRef}
              threadId={threadId}
              onSent={() => setReplying(false)}
            />
          </div>
        )}

        <div className="min-h-0 flex-1 bg-slate-100">
          {!selected ? (
            <p className="p-8 text-center text-sm text-slate-500">
              No attachment found on this email yet.
            </p>
          ) : isPdf(selected.name) ? (
            <iframe
              src={selected.url}
              title={selected.name}
              className="h-full w-full"
            />
          ) : isImg(selected.name) ? (
            <div className="flex h-full items-center justify-center overflow-auto p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.url}
                alt={selected.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-600">
              <a
                href={selected.url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-700 hover:underline"
              >
                Download {selected.name}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
