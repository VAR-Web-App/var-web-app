"use client";

// Self-contained Files panel: upload, list, delete, and auto-parse
// attachments tied to a deal. Lifted out of the deal page so the new
// /deals/[id]/files sub-route and the existing Overview can both use
// it without duplicating the parse machinery.
//
// The parse pipeline streams Server-Sent Events from /api/parse and
// extracts BOM lines + metadata that get cached in sessionStorage so
// re-renders after navigation don't re-trigger Textract for free.

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircleIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  ATTACHMENT_CATEGORIES,
  type Attachment,
  type Deal,
} from "@/types";
import {
  deleteAttachment,
  listAttachments,
  newId,
  saveAttachment,
} from "@/lib/store";
import { uploadAttachmentFile } from "@/lib/storage";
import type { BomLine } from "@/lib/parsers";

interface ParsedDoc {
  attachment_id: string;
  template_name: string;
  bom: BomLine[];
  metadata: Record<string, string | number | undefined>;
  total: number;
}

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FilesPanel({ deal }: { deal: Deal }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [parsed, setParsed] = useState<Record<string, ParsedDoc>>({});
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionKey = useMemo(() => `parsed:${deal.id}`, [deal.id]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const atts = await listAttachments(deal.id);
      if (!active) return;
      setAttachments(atts);
      try {
        const cached = sessionStorage.getItem(sessionKey);
        if (cached) setParsed(JSON.parse(cached));
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [deal.id, sessionKey]);

  function persistParsed(next: Record<string, ParsedDoc>) {
    setParsed(next);
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(next));
    } catch {
      // ignore quota
    }
  }

  async function refresh() {
    setAttachments(await listAttachments(deal.id));
  }

  async function onUploadFile(category: Attachment["category"], file: File) {
    setError(null);
    try {
      const attId = newId("att");
      const { url, storagePath } = await uploadAttachmentFile(
        file,
        deal.id,
        attId,
      );
      const att: Attachment = {
        id: attId,
        deal_ref: deal.id,
        category,
        name: file.name,
        url,
        storage_path: storagePath,
        size: file.size,
        uploaded_at: new Date().toISOString(),
      };
      await saveAttachment(att);
      await refresh();
      if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        void runParse(att, file);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runParse(att: Attachment, file: File) {
    setParsingId(att.id);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      if (
        !res.ok &&
        res.headers.get("Content-Type")?.includes("application/json")
      ) {
        const j = await res.json();
        throw new Error(j.error ?? "Parse failed");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let result:
        | {
            ok: boolean;
            template_name: string;
            bom: BomLine[];
            metadata: Record<string, string | number | undefined>;
            totals: { parsed_extended_total: number };
          }
        | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          if (!frame.trim()) continue;
          let event = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (event === "result" && data) result = JSON.parse(data);
        }
      }
      if (!result) throw new Error("Parser returned no result");
      persistParsed({
        ...parsed,
        [att.id]: {
          attachment_id: att.id,
          template_name: result.template_name,
          bom: result.bom,
          metadata: result.metadata,
          total: result.totals.parsed_extended_total,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsingId(null);
    }
  }

  async function onDeleteAttachment(att: Attachment) {
    await deleteAttachment(att.id);
    const { [att.id]: _drop, ...rest } = parsed;
    void _drop;
    persistParsed(rest);
    await refresh();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Attachments</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Drop a PDF in any category. Plans get auto-parsed for square
          footage and room layout; other docs are stored as-is.
        </p>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1">{error}</div>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-600 hover:text-red-800"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="space-y-4 p-6">
        {ATTACHMENT_CATEGORIES.map((cat) => {
          const inCat = attachments.filter((a) => a.category === cat.key);
          return (
            <div key={cat.key} className="rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {cat.label}
                </h3>
                <label className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-700">
                  + Upload
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadFile(cat.key, f);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              {inCat.length === 0 ? (
                <p className="px-4 py-3 text-xs italic text-slate-400">
                  No {cat.label.toLowerCase()}.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {inCat.map((att) => {
                    const p = parsed[att.id];
                    const isParsing = parsingId === att.id;
                    return (
                      <li key={att.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <DocumentTextIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                            <div className="min-w-0">
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline"
                              >
                                {att.name}
                              </a>
                              <p className="text-[11px] text-slate-500">
                                {(att.size / 1024).toFixed(1)} KB ·{" "}
                                {new Date(att.uploaded_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isParsing && (
                              <span className="text-xs italic text-slate-500">
                                parsing…
                              </span>
                            )}
                            {p && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                                <CheckCircleIcon className="h-3.5 w-3.5" />
                                {p.bom.length} line
                                {p.bom.length === 1 ? "" : "s"} ·{" "}
                                {fmtMoney(p.total)}
                              </span>
                            )}
                            <button
                              onClick={() => void onDeleteAttachment(att)}
                              title="Remove"
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {p && p.metadata && (
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                            {Object.entries(p.metadata)
                              .filter(([, v]) => v != null && v !== "")
                              .slice(0, 6)
                              .map(([k, v]) => (
                                <div
                                  key={k}
                                  className="flex items-baseline gap-1"
                                >
                                  <span className="font-medium text-slate-500">
                                    {k.replace(/_/g, " ")}:
                                  </span>
                                  <span className="truncate text-slate-700">
                                    {String(v)}
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
