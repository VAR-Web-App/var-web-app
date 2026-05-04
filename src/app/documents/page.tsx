"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ArrowUpTrayIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";

interface BomLine {
  item_number: string;
  description: string;
  part_number: string;
  qty: number;
  unit_price: number;
  extended_price: number;
}

interface DocumentMetadata {
  document_number?: string;
  document_date?: string;
  total_amount?: number;
  buyer_name?: string;
  ship_to_address?: string;
  ship_to_contact?: string;
  ship_to_email?: string;
  agency?: string;
  contracting_officer_name?: string;
  contracting_officer_email?: string;
  period_of_performance_start?: string;
  period_of_performance_end?: string;
}

interface ParseError { message: string; field?: string; row_index?: number }
interface ParseWarning { message: string; field?: string; row_index?: number }

interface ParseResult {
  ok: boolean;
  template_id: string;
  template_name: string;
  bom: BomLine[];
  metadata: DocumentMetadata;
  warnings: ParseWarning[];
  errors: ParseError[];
  totals: { parsed_extended_total: number; metadata_total?: number };
  meta: {
    page_count: number;
    bom_line_count: number;
    extraction_method: string;
  };
}

interface ProgressEvent {
  percent: number;
  stage: string;
  detail?: string;
}

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STAGE_LABELS: Record<string, string> = {
  starting: "Initializing",
  uploading: "Uploading PDF",
  textract_starting: "Submitting to Textract",
  textract_polling: "Reading document",
  parsing_tables: "Detecting tables",
  metadata: "Extracting metadata",
  validating: "Cross-checking totals",
  done: "Done",
};

async function readSseStream(
  response: Response,
  handlers: {
    onProgress?: (p: ProgressEvent) => void;
    onResult?: (r: ParseResult) => void;
    onError?: (msg: string) => void;
  },
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      if (!frame.trim()) continue;
      let eventName = "message";
      let dataStr = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) eventName = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataStr = line.slice(6);
      }
      if (!dataStr) continue;
      try {
        const data = JSON.parse(dataStr);
        if (eventName === "progress") handlers.onProgress?.(data);
        else if (eventName === "result") handlers.onResult?.(data);
        else if (eventName === "error") handlers.onError?.(data.message ?? "Unknown error");
      } catch {
        // skip malformed
      }
    }
  }
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function parseFile(target: File) {
    setFile(target);
    setParsing(true);
    setError(null);
    setResult(null);
    setProgress({ percent: 0, stage: "starting" });
    try {
      const formData = new FormData();
      formData.append("file", target);
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      if (!res.ok && res.headers.get("Content-Type")?.includes("application/json")) {
        const j = await res.json();
        setError(j.error ?? "Parse failed");
        return;
      }
      await readSseStream(res, {
        onProgress: (p) => setProgress(p),
        onResult: (r) => setResult(r),
        onError: (msg) => setError(msg),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }

  async function onTrySample() {
    setError(null);
    try {
      const res = await fetch("/samples/synthetic-award.pdf");
      if (!res.ok) throw new Error(`Could not load sample (HTTP ${res.status})`);
      const blob = await res.blob();
      const sample = new File([blob], "synthetic-award.pdf", { type: "application/pdf" });
      await parseFile(sample);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Once parsing has produced a result, switch to a wider, side-by-side
  // layout: source PDF on the left, extracted data on the right. While the
  // user is still picking a file or parsing, keep the narrower single-column
  // layout so the dropzone is the focal point.
  const showSplit = !!result && !!file;

  return (
    <AppShell>
      <div className={`mx-auto space-y-6 ${showSplit ? "max-w-7xl" : "max-w-5xl"}`}>
        <PageHeader showResetLink={showSplit} onReset={() => {
          setResult(null);
          setFile(null);
          setError(null);
        }} />

        {!showSplit && (
          <UploadCard
            file={file}
            parsing={parsing}
            progress={progress}
            error={error}
            onSelectFile={(f) => {
              setFile(f);
              setError(null);
            }}
            onParse={async () => file && parseFile(file)}
            onTrySample={onTrySample}
          />
        )}

        {showSplit && result && file && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
              <PdfPreview file={file} />
            </aside>
            <div className="min-w-0 space-y-6">
              <ResultBanner result={result} />
              {result.errors.length > 0 && (
                <Issues title="Errors" tone="error" items={result.errors} />
              )}
              {result.warnings.length > 0 && (
                <Issues title="Warnings" tone="warning" items={result.warnings} />
              )}
              <Metadata metadata={result.metadata} />
              <BomTable bom={result.bom} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PageHeader({
  showResetLink,
  onReset,
}: {
  showResetLink?: boolean;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Documents</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a PDF — distributor quote, award, vendor PO — get back a structured BOM and
          metadata.
        </p>
      </div>
      {showResetLink && (
        <button
          onClick={onReset}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          ← Parse another document
        </button>
      )}
    </div>
  );
}

function PdfPreview({ file }: { file: File }) {
  // Browser's native PDF viewer via blob URL. Cheaper, faster, and more
  // familiar than re-rendering through pdf.js — the user sees exactly the
  // doc they uploaded with the Chrome/Edge/Firefox/Safari built-in viewer.
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <div className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <DocumentTextIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <span className="truncate text-xs font-medium text-slate-700">{file.name}</span>
        </div>
        <span className="text-[11px] uppercase tracking-wide text-slate-400">Source</span>
      </div>
      <iframe src={url} title="Source PDF" className="h-full w-full flex-1 bg-slate-50" />
    </div>
  );
}

function UploadCard({
  file,
  parsing,
  progress,
  error,
  onSelectFile,
  onParse,
  onTrySample,
}: {
  file: File | null;
  parsing: boolean;
  progress: ProgressEvent | null;
  error: string | null;
  onSelectFile: (f: File | null) => void;
  onParse: () => void;
  onTrySample: () => void;
}) {
  const [dragActive, setDragActive] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer.files?.[0];
      if (!f) return;
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
        return;
      }
      onSelectFile(f);
    },
    [onSelectFile],
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Upload</h2>
        <button
          onClick={onTrySample}
          disabled={parsing}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50"
        >
          Try with a sample doc →
        </button>
      </div>

      <div className="p-6">
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 transition-colors ${
            dragActive
              ? "border-blue-500 bg-blue-50"
              : "border-slate-300 bg-slate-50 hover:border-slate-400"
          }`}
        >
          <ArrowUpTrayIcon className="mb-3 h-10 w-10 text-slate-400" />
          <p className="text-sm font-medium text-slate-900">
            {dragActive ? "Drop the PDF here" : "Drag a PDF here, or click to choose"}
          </p>
          <p className="mt-1 text-xs text-slate-500">PDF up to 25 MB</p>

          <label className="mt-4 cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Choose file
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
        </div>

        {file && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <DocumentTextIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button
              onClick={onParse}
              disabled={parsing}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {parsing ? "Parsing…" : "Parse"}
            </button>
          </div>
        )}

        {parsing && progress && <ProgressBar progress={progress} />}

        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-md bg-red-50 p-4">
            <XCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-900">Couldn&apos;t parse this document</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ProgressBar({ progress }: { progress: ProgressEvent }) {
  const label = STAGE_LABELS[progress.stage] ?? progress.stage;
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500">{progress.percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      {progress.detail && (
        <p className="mt-1.5 text-xs text-slate-500">{progress.detail}</p>
      )}
    </div>
  );
}

function ResultBanner({ result }: { result: ParseResult }) {
  const matches =
    result.totals.metadata_total != null &&
    Math.abs(result.totals.parsed_extended_total - result.totals.metadata_total) < 0.02;

  return (
    <section
      className={`rounded-xl border p-6 ${
        result.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex items-center gap-3">
          {result.ok ? (
            <CheckCircleIcon className="h-7 w-7 flex-shrink-0 text-emerald-600" />
          ) : (
            <ExclamationTriangleIcon className="h-7 w-7 flex-shrink-0 text-amber-600" />
          )}
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {result.ok ? "Parsed successfully" : "Parsed with issues"}
            </h2>
            <p className="text-sm text-slate-600">
              {result.template_name && (
                <>
                  <span className="font-medium text-slate-700">{result.template_name}</span>
                  {" · "}
                </>
              )}
              {result.meta.page_count} page{result.meta.page_count === 1 ? "" : "s"} ·{" "}
              {result.meta.bom_line_count} line
              {result.meta.bom_line_count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">Line total</div>
          <div className="text-xl font-semibold tabular-nums text-slate-900">
            {fmtMoney(result.totals.parsed_extended_total)}
          </div>
          {result.totals.metadata_total != null && (
            <div className={`text-xs ${matches ? "text-emerald-700" : "text-red-700"}`}>
              doc says {fmtMoney(result.totals.metadata_total)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Issues({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "error" | "warning";
  items: { message: string }[];
}) {
  const palette =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-900";
  const Icon = tone === "error" ? XCircleIcon : ExclamationTriangleIcon;
  return (
    <section className={`rounded-xl border p-4 ${palette}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold">
            {title} ({items.length})
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {items.map((it, i) => (
              <li key={i}>• {it.message}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Metadata({ metadata }: { metadata: DocumentMetadata }) {
  const rows: Array<[string, string | undefined]> = [
    ["Document #", metadata.document_number],
    ["Document Date", metadata.document_date],
    ["Total", metadata.total_amount != null ? fmtMoney(metadata.total_amount) : undefined],
    ["Buyer / Agency", metadata.buyer_name ?? metadata.agency],
    ["Ship-to", metadata.ship_to_address],
    ["Ship-to Contact", metadata.ship_to_contact],
    ["Ship-to Email", metadata.ship_to_email],
    [
      "Period of Performance",
      metadata.period_of_performance_start && metadata.period_of_performance_end
        ? `${metadata.period_of_performance_start} → ${metadata.period_of_performance_end}`
        : undefined,
    ],
    ["Contracting Officer", metadata.contracting_officer_name],
    ["CO Email", metadata.contracting_officer_email],
  ];
  const present = rows.filter(([, v]) => v != null && v !== "");
  if (present.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Metadata</h2>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-6 sm:grid-cols-2">
        {present.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BomTable({ bom }: { bom: BomLine[] }) {
  if (bom.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Bill of Materials</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Item</th>
              <th className="px-4 py-3 text-left">Part #</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit Price</th>
              <th className="px-4 py-3 text-right">Extended</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bom.map((line, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900">{line.item_number}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{line.part_number}</td>
                <td className="px-4 py-3 text-slate-700">{line.description}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">{line.qty}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {fmtMoney(line.unit_price)}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                  {fmtMoney(line.extended_price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
