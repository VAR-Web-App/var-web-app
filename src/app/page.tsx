"use client";

import { useState } from "react";

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
}

interface ParseError { message: string; field?: string; row_index?: number }
interface ParseWarning { message: string; field?: string; row_index?: number }

interface ParseResult {
  ok: boolean;
  bom: BomLine[];
  metadata: DocumentMetadata;
  warnings: ParseWarning[];
  errors: ParseError[];
  totals: {
    parsed_extended_total: number;
    metadata_total?: number;
  };
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

/**
 * Read an SSE stream from a fetch Response and dispatch events. The wire
 * format is "event: NAME\ndata: JSON\n\n" — splitting on blank-line frames.
 */
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
    // Frames end at "\n\n". Anything after the last "\n\n" is partial.
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
        // Malformed event — skip rather than fail the whole stream
      }
    }
  }
}

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

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onParse() {
    if (!file) return;
    setParsing(true);
    setError(null);
    setResult(null);
    setProgress({ percent: 0, stage: "starting" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      if (!res.ok && res.headers.get("Content-Type")?.includes("application/json")) {
        // Plain JSON error (e.g. validation rejected the file before streaming starts)
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

  return (
    <main className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            VAR Web App
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Federal IT VAR document parser — drop a PDF, get a structured BOM and metadata.
          </p>
        </header>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium text-zinc-700">PDF document</label>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-zinc-700
                file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2
                file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700"
            />
            <button
              onClick={onParse}
              disabled={!file || parsing}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white
                hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {parsing ? "Parsing..." : "Parse"}
            </button>
          </div>
          {file && (
            <p className="mt-2 text-xs text-zinc-500">
              {file.name} — {(file.size / 1024).toFixed(1)} KB
            </p>
          )}
          {parsing && progress && <ProgressBar progress={progress} />}
          {error && (
            <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </section>

        {result && (
          <>
            <ResultBanner result={result} />

            {result.errors.length > 0 && (
              <Issues title="Errors" tone="error" items={result.errors} />
            )}
            {result.warnings.length > 0 && (
              <Issues title="Warnings" tone="warning" items={result.warnings} />
            )}

            <Metadata metadata={result.metadata} />
            <BomTable bom={result.bom} />
          </>
        )}
      </div>
    </main>
  );
}

function ProgressBar({ progress }: { progress: ProgressEvent }) {
  const label = STAGE_LABELS[progress.stage] ?? progress.stage;
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-medium text-zinc-700">{label}</span>
        <span className="tabular-nums text-zinc-500">{progress.percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full bg-blue-600 transition-all duration-300 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      {progress.detail && (
        <p className="mt-1.5 text-xs text-zinc-500">{progress.detail}</p>
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
      className={`mt-6 rounded-xl border p-6 ${
        result.ok ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            {result.ok ? "Parsed successfully" : "Parsed with issues"}
          </h2>
          <p className="text-sm text-zinc-600">
            {result.meta.page_count} page{result.meta.page_count === 1 ? "" : "s"} ·{" "}
            {result.meta.bom_line_count} line item{result.meta.bom_line_count === 1 ? "" : "s"} ·{" "}
            extraction: {result.meta.extraction_method}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Line total</div>
          <div className="text-xl font-semibold tabular-nums text-zinc-900">
            {fmtMoney(result.totals.parsed_extended_total)}
          </div>
          {result.totals.metadata_total != null && (
            <div className={`text-xs ${matches ? "text-green-700" : "text-red-700"}`}>
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
  return (
    <section className={`mt-4 rounded-xl border p-4 ${palette}`}>
      <h3 className="text-sm font-semibold">
        {title} ({items.length})
      </h3>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((it, i) => (
          <li key={i}>• {it.message}</li>
        ))}
      </ul>
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
    ["Contracting Officer", metadata.contracting_officer_name],
  ];
  const present = rows.filter(([, v]) => v != null && v !== "");
  if (present.length === 0) return null;
  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">Metadata</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {present.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
            <dd className="text-sm whitespace-pre-line text-zinc-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BomTable({ bom }: { bom: BomLine[] }) {
  if (bom.length === 0) return null;
  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <h2 className="border-b border-zinc-200 px-6 py-4 text-lg font-semibold text-zinc-900">
        Bill of Materials
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-left">Item</th>
              <th className="px-4 py-3 text-left">Part #</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit Price</th>
              <th className="px-4 py-3 text-right">Extended</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {bom.map((line, i) => (
              <tr key={i}>
                <td className="px-4 py-3">{line.item_number}</td>
                <td className="px-4 py-3 font-mono text-xs">{line.part_number}</td>
                <td className="px-4 py-3">{line.description}</td>
                <td className="px-4 py-3 text-right tabular-nums">{line.qty}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(line.unit_price)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(line.extended_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
