"use client";

import { useCallback, useState } from "react";
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  DocumentTextIcon,
  PlusCircleIcon,
  MinusCircleIcon,
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import { compareBoms, type CompareResult } from "@/lib/compare";
import type { BomLine } from "@/lib/parsers";

interface ParseResult {
  ok: boolean;
  template_name: string;
  bom: BomLine[];
  metadata: { total_amount?: number; document_number?: string };
  errors: { message: string }[];
  warnings: { message: string }[];
}

interface ProgressEvent {
  percent: number;
  stage: string;
  detail?: string;
}

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDelta = (n: number) =>
  `${n >= 0 ? "+" : "-"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STAGE_LABELS: Record<string, string> = {
  starting: "Initializing",
  uploading: "Uploading",
  textract_starting: "Submitting to Textract",
  textract_polling: "Reading document",
  parsing_tables: "Detecting tables",
  metadata: "Extracting metadata",
  validating: "Cross-checking",
  done: "Done",
};

async function parseFileWithProgress(
  file: File,
  onProgress: (p: ProgressEvent) => void,
): Promise<ParseResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/parse", { method: "POST", body: formData });
  if (!res.ok && res.headers.get("Content-Type")?.includes("application/json")) {
    const j = await res.json();
    throw new Error(j.error ?? "Parse failed");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ParseResult | null = null;
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
        if (eventName === "progress") onProgress(data);
        else if (eventName === "result") result = data;
        else if (eventName === "error") throw new Error(data.message ?? "Parse error");
      } catch {
        // skip malformed events
      }
    }
  }
  if (!result) throw new Error("Parser returned no result");
  return result;
}

type Stage = "idle" | "parsing_quote" | "parsing_award" | "comparing" | "done";

export default function ComparePage() {
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [awardFile, setAwardFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [quoteResult, setQuoteResult] = useState<ParseResult | null>(null);
  const [awardResult, setAwardResult] = useState<ParseResult | null>(null);
  const [comparison, setComparison] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSample(name: "quote" | "award"): Promise<File> {
    const path = name === "quote" ? "/samples/synthetic-quote.pdf" : "/samples/synthetic-award.pdf";
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Could not load sample (HTTP ${res.status})`);
    const blob = await res.blob();
    return new File([blob], `synthetic-${name}.pdf`, { type: "application/pdf" });
  }

  async function onTryBothSamples() {
    setError(null);
    setQuoteResult(null);
    setAwardResult(null);
    setComparison(null);
    try {
      const quote = await loadSample("quote");
      const award = await loadSample("award");
      setQuoteFile(quote);
      setAwardFile(award);
      await runCompare(quote, award);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runCompare(quote: File, award: File) {
    setStage("parsing_quote");
    setError(null);
    setComparison(null);
    setQuoteResult(null);
    setAwardResult(null);
    try {
      const q = await parseFileWithProgress(quote, setProgress);
      setQuoteResult(q);
      setStage("parsing_award");
      const a = await parseFileWithProgress(award, setProgress);
      setAwardResult(a);
      setStage("comparing");
      const c = compareBoms(q.bom, a.bom);
      setComparison(c);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("idle");
    }
  }

  // Stage transitions: idle → parsing_quote → parsing_award → comparing → done.
  // After "done" the button should be live again (so user can re-run with
  // new files), not stuck on "Working…".
  const inFlight = stage !== "idle" && stage !== "done";
  const canCompare = !!quoteFile && !!awardFile && !inFlight;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Compare</h1>
            <p className="mt-1 text-sm text-slate-500">
              Drop in your original quote and the award PDF — see line-by-line where they
              match, drift, or were dropped.
            </p>
          </div>
          <button
            onClick={onTryBothSamples}
            disabled={stage !== "idle"}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50"
          >
            Try with both sample docs →
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <UploadSlot
            label="Original Quote"
            file={quoteFile}
            onSelectFile={setQuoteFile}
            disabled={stage !== "idle"}
          />
          <UploadSlot
            label="Award PDF"
            file={awardFile}
            onSelectFile={setAwardFile}
            disabled={stage !== "idle"}
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => quoteFile && awardFile && runCompare(quoteFile, awardFile)}
            disabled={!canCompare}
            className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {inFlight ? "Working…" : stage === "done" ? "Compare again" : "Compare"}
          </button>
        </div>

        {stage !== "idle" && stage !== "done" && progress && (
          <ParseStageCard stage={stage} progress={progress} />
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-md bg-red-50 p-4">
            <XCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-900">Comparison failed</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {comparison && quoteResult && awardResult && (
          <>
            <ComparisonSummary comparison={comparison} />
            <MatchedTable rows={comparison.matched} />
            {comparison.only_in_quote.length > 0 && (
              <SidedTable
                title="Only in Quote"
                subtitle="In your quote but not in the award (the customer dropped these lines)"
                rows={comparison.only_in_quote}
                tone="warning"
              />
            )}
            {comparison.only_in_award.length > 0 && (
              <SidedTable
                title="Only in Award"
                subtitle="In the award but not in your quote (the customer added these — often a modification)"
                rows={comparison.only_in_award}
                tone="info"
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function UploadSlot({
  label,
  file,
  onSelectFile,
  disabled,
}: {
  label: string;
  file: File | null;
  onSelectFile: (f: File | null) => void;
  disabled: boolean;
}) {
  const [dragActive, setDragActive] = useState(false);
  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer.files?.[0];
      if (!f) return;
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return;
      onSelectFile(f);
    },
    [onSelectFile],
  );
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </h3>
      <div
        onDragEnter={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => !disabled && onDrop(e)}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 transition-colors ${
          dragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <ArrowUpTrayIcon className="mb-2 h-8 w-8 text-slate-400" />
        <p className="text-sm text-slate-700">
          {dragActive ? "Drop here" : "Drag PDF or click below"}
        </p>
        <label
          className={`mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 ${
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          Choose file
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={disabled}
            onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>
      </div>
      {file && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <DocumentTextIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <span className="truncate text-xs text-slate-700">{file.name}</span>
        </div>
      )}
    </div>
  );
}

function ParseStageCard({ stage, progress }: { stage: Stage; progress: ProgressEvent }) {
  const which =
    stage === "parsing_quote"
      ? "Parsing quote"
      : stage === "parsing_award"
      ? "Parsing award"
      : stage === "comparing"
      ? "Comparing"
      : "";
  const label = STAGE_LABELS[progress.stage] ?? progress.stage;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-semibold text-slate-900">{which}</span>
        <span className="text-xs text-slate-500">
          {label} · {progress.percent}%
        </span>
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
    </section>
  );
}

function ComparisonSummary({ comparison }: { comparison: CompareResult }) {
  const issuesCount =
    comparison.counts.price_mismatch +
    comparison.counts.qty_mismatch +
    comparison.counts.qty_and_price +
    comparison.counts.only_in_quote +
    comparison.counts.only_in_award;
  const allClean = issuesCount === 0;
  const deltaColor =
    comparison.totals.delta > 0.01
      ? "text-emerald-700"
      : comparison.totals.delta < -0.01
      ? "text-red-700"
      : "text-slate-700";
  return (
    <section
      className={`rounded-xl border p-6 ${
        allClean ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex items-center gap-3">
          {allClean ? (
            <CheckCircleIcon className="h-7 w-7 flex-shrink-0 text-emerald-600" />
          ) : (
            <ExclamationTriangleIcon className="h-7 w-7 flex-shrink-0 text-amber-600" />
          )}
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {allClean
                ? "Quote and award match"
                : `${issuesCount} discrepanc${issuesCount === 1 ? "y" : "ies"}`}
            </h2>
            <p className="text-sm text-slate-700">
              {comparison.counts.match} matched ·{" "}
              {comparison.counts.price_mismatch + comparison.counts.qty_mismatch + comparison.counts.qty_and_price}{" "}
              with issues · {comparison.counts.only_in_quote} only in quote ·{" "}
              {comparison.counts.only_in_award} only in award
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="grid grid-cols-3 gap-x-6 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Quote</div>
              <div className="font-semibold tabular-nums text-slate-900">
                {fmtMoney(comparison.totals.quote_extended)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Award</div>
              <div className="font-semibold tabular-nums text-slate-900">
                {fmtMoney(comparison.totals.award_extended)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Delta</div>
              <div className={`font-semibold tabular-nums ${deltaColor}`}>
                {fmtDelta(comparison.totals.delta)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MatchedTable({ rows }: { rows: ReturnType<typeof compareBoms>["matched"] }) {
  if (rows.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Matched lines ({rows.length})
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Lines present in both quote and award. Cells with differences highlighted in amber.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Part &amp; Description</th>
              <th className="px-4 py-3 text-right">Quote</th>
              <th className="px-4 py-3 text-right">Award</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => {
              const isMatch = row.diff === "match";
              const qtyChanged = row.quote.qty !== row.award.qty;
              const priceChanged =
                Math.abs(row.quote.unit_price - row.award.unit_price) > 0.005;
              const extDelta = row.award.extended_price - row.quote.extended_price;
              const extDeltaSig = Math.abs(extDelta) > 0.01;

              return (
                <tr key={i} className={isMatch ? "" : "bg-amber-50/30"}>
                  <td className="px-4 py-3 align-top">
                    <div className="font-mono text-xs text-slate-900">{row.part_number}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{row.award.description}</div>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    <SideCell
                      qty={row.quote.qty}
                      unit={row.quote.unit_price}
                      ext={row.quote.extended_price}
                      qtyHighlight={qtyChanged}
                      unitHighlight={priceChanged}
                    />
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    <SideCell
                      qty={row.award.qty}
                      unit={row.award.unit_price}
                      ext={row.award.extended_price}
                      qtyHighlight={qtyChanged}
                      unitHighlight={priceChanged}
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusCell
                      isMatch={isMatch}
                      qtyChanged={qtyChanged}
                      priceChanged={priceChanged}
                      extDelta={extDelta}
                      extDeltaSig={extDeltaSig}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SideCell({
  qty,
  unit,
  ext,
  qtyHighlight,
  unitHighlight,
}: {
  qty: number;
  unit: number;
  ext: number;
  qtyHighlight: boolean;
  unitHighlight: boolean;
}) {
  const baseQty = "text-slate-900";
  const baseUnit = "text-slate-700";
  const hi = "rounded bg-amber-100 px-1.5 font-semibold text-amber-900";
  return (
    <div className="space-y-0.5">
      <div>
        <span className={qtyHighlight ? hi : baseQty}>{qty}</span>
        <span className="text-slate-400"> × </span>
        <span className={unitHighlight ? hi : baseUnit}>{fmtMoney(unit)}</span>
      </div>
      <div className="text-xs text-slate-500">= {fmtMoney(ext)}</div>
    </div>
  );
}

function StatusCell({
  isMatch,
  qtyChanged,
  priceChanged,
  extDelta,
  extDeltaSig,
}: {
  isMatch: boolean;
  qtyChanged: boolean;
  priceChanged: boolean;
  extDelta: number;
  extDeltaSig: boolean;
}) {
  if (isMatch) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        ✓ Match
      </span>
    );
  }
  const labels: string[] = [];
  if (qtyChanged) labels.push("Qty Δ");
  if (priceChanged) labels.push("Price Δ");
  const deltaColor = extDelta > 0 ? "text-emerald-700" : "text-red-700";
  return (
    <div className="space-y-0.5 text-xs">
      <div className="font-medium text-amber-900">{labels.join(" + ")}</div>
      {extDeltaSig && (
        <div className={`tabular-nums ${deltaColor}`}>
          {extDelta > 0 ? "+" : "−"}
          {fmtMoney(Math.abs(extDelta))} on this line
        </div>
      )}
    </div>
  );
}

function SidedTable({
  title,
  subtitle,
  rows,
  tone,
}: {
  title: string;
  subtitle: string;
  rows: BomLine[];
  tone: "warning" | "info";
}) {
  const Icon = tone === "warning" ? MinusCircleIcon : PlusCircleIcon;
  const headerColor = tone === "warning" ? "text-amber-700" : "text-blue-700";
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-slate-200 px-6 py-4">
        <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${headerColor}`} />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Part #</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit Price</th>
              <th className="px-4 py-3 text-right">Extended</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((line, i) => (
              <tr key={i}>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{line.part_number}</td>
                <td className="px-4 py-3 text-slate-700">{line.description}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">{line.qty}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {fmtMoney(line.unit_price)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">
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
