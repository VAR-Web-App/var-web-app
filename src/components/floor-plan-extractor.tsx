"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpTrayIcon,
  SparklesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { QuoteLine } from "@/types";
import { saveQuoteLines, listQuoteLines, getDeal, saveDeal, getSettings, newId } from "@/lib/store";
import { instancesAndLinesFromFloorPlan } from "@/lib/assemblies/from-floorplan";

// Shape returned by /api/floorplan-extract. Mirrors the schema in the
// route's system prompt; null-allowed for fields Claude couldn't read.
// Synthetic extraction used by the "Try with sample plan" button. Lets a
// builder evaluating the platform see the full post-extract UI without
// having to upload a real PDF. Numbers are realistic for a 4-bed, 3.5-bath
// custom home — roughly the Maddox House profile in the seed data.
const SAMPLE_EXTRACTION: FloorPlanExtraction = {
  plan_name: "Sample Plan — Country Dream House",
  total_sqft: 3850,
  first_floor_sqft: 2400,
  second_floor_sqft: 1450,
  bonus_sqft: null,
  porch_sqft: 320,
  garage_sqft: 720,
  garage_cars: 3,
  bedrooms: 4,
  full_baths: 3,
  half_baths: 1,
  footprint_dimensions: "68' × 42'",
  max_ridge_height: "29' 6\"",
  stories: 2,
  foundation_type: "Slab on grade with conditioned crawl in mech room",
  exterior_wall_type: "2×6 framing, brick + Hardie",
  ceiling_heights: "10' main, 9' second",
  rooms: [
    { name: "Foyer", dimensions: "10' × 14'", sqft: 140, level: "main" },
    { name: "Great Room", dimensions: "22' × 18'", sqft: 396, level: "main" },
    { name: "Kitchen", dimensions: "18' × 16'", sqft: 288, level: "main" },
    { name: "Dining", dimensions: "14' × 14'", sqft: 196, level: "main" },
    { name: "Master Suite", dimensions: "16' × 18'", sqft: 288, level: "main" },
    { name: "Master Bath", dimensions: "14' × 11'", sqft: 154, level: "main" },
    { name: "Mudroom", dimensions: "8' × 10'", sqft: 80, level: "main" },
    { name: "Bedroom 2", dimensions: "13' × 14'", sqft: 182, level: "second" },
    { name: "Bedroom 3", dimensions: "12' × 13'", sqft: 156, level: "second" },
    { name: "Bedroom 4", dimensions: "12' × 13'", sqft: 156, level: "second" },
    { name: "Bonus / Office", dimensions: "16' × 14'", sqft: 224, level: "second" },
  ],
  doors_windows: {
    exterior_doors_estimated: 5,
    windows_estimated: 28,
  },
  notable_features: [
    "Vaulted great room with reclaimed beam",
    "Wraparound covered porch on south + east elevations",
    "Tankless gas water heater pre-plumb",
    "EV-ready garage circuit panel",
  ],
  ambiguity_notes: [
    "Mudroom partial dimensions — confirm cabinet depth at framing.",
    "Master closet depth listed twice on plan — used the larger value.",
  ],
  confidence: "high",
};

export interface FloorPlanExtraction {
  plan_name: string | null;
  total_sqft: number | null;
  first_floor_sqft: number | null;
  second_floor_sqft: number | null;
  bonus_sqft: number | null;
  porch_sqft: number | null;
  garage_sqft: number | null;
  garage_cars: number | null;
  bedrooms: number | null;
  full_baths: number | null;
  half_baths: number | null;
  footprint_dimensions: string | null;
  max_ridge_height: string | null;
  stories: number | null;
  foundation_type: string | null;
  exterior_wall_type: string | null;
  ceiling_heights: string | null;
  rooms: Array<{
    name: string;
    dimensions: string | null;
    sqft: number | null;
    level: "main" | "second" | "basement" | "bonus" | null;
  }>;
  doors_windows: {
    exterior_doors_estimated: number | null;
    windows_estimated: number | null;
  };
  notable_features: string[];
  ambiguity_notes: string[];
  confidence: "high" | "medium" | "low";
}

export default function FloorPlanExtractor({
  dealId,
  orgRef,
  initialExtraction,
  initialResolvedFlags,
  onExtracted,
}: {
  dealId: string;
  orgRef: string;
  /** If the deal already has a saved extraction, render straight into
   *  the post-extract UI instead of the upload dropzone. */
  initialExtraction?: FloorPlanExtraction;
  initialResolvedFlags?: number[];
  onExtracted?: (extraction: FloorPlanExtraction) => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const progressTimer = useRef<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extraction, setExtraction] = useState<FloorPlanExtraction | null>(
    initialExtraction ?? null,
  );
  const [resolvedFlags, setResolvedFlags] = useState<Set<number>>(
    new Set(initialResolvedFlags ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  // When the page is loaded with a saved extraction, default the view to
  // a compact summary card. Builder clicks "Show details" to expand back
  // into the full post-extract UI.
  const [collapsed, setCollapsed] = useState(!!initialExtraction);

  // Persist extraction + resolved flags onto the deal doc whenever they
  // change. Wrapped in a debounced effect so rapid flag toggles don't
  // hammer Firestore. Skips the first invocation when the component
  // hydrates from initialExtraction props — no point writing back the
  // exact data we just read (would also bump deal.updated_at uselessly).
  const skipFirstSave = useRef(!!initialExtraction);
  useEffect(() => {
    if (!extraction) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const t = setTimeout(async () => {
      try {
        const deal = await getDeal(dealId);
        if (!deal) return;
        await saveDeal({
          ...deal,
          floor_plan_extraction: extraction as unknown as Record<string, unknown>,
          floor_plan_extracted_at: deal.floor_plan_extracted_at ?? new Date().toISOString(),
          resolved_ambiguity_indices: Array.from(resolvedFlags).sort((a, b) => a - b),
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("[floor-plan-extractor] persist failed", e);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [extraction, resolvedFlags, dealId]);

  function pickFile(picked: File | null) {
    setError(null);
    // Don't wipe extraction here — re-upload should be an explicit action
    // (the "Re-upload" button below) so the GC doesn't accidentally lose
    // their saved extraction by clicking the drop zone.
    setFile(picked);
  }

  // Load the sample extraction without hitting the API. Lets a first-time
  // visitor see the full post-extract UI (verify, apply to estimate) using
  // their existing project — no real PDF required.
  function loadSampleExtraction() {
    setError(null);
    setFile(null);
    setExtraction(SAMPLE_EXTRACTION);
    setResolvedFlags(new Set());
    setCollapsed(false);
  }

  function toggleFlag(idx: number) {
    setResolvedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function startReupload() {
    setExtraction(null);
    setResolvedFlags(new Set());
    setFile(null);
    setCollapsed(false);
  }

  async function runExtraction() {
    if (!file) return;
    setExtracting(true);
    setProgress(0);
    setError(null);

    // Time-based progress simulation: Claude vision is one-shot, so we
    // can't read real progress. Animate 0→95% over ~12s (typical
    // residential plan extraction), holding at 95% until the API
    // returns. Snap to 100% on completion. Never lies — we only show
    // 100% when we actually have the response.
    const start = performance.now();
    const targetMs = 12000; // 12s expected
    progressTimer.current = window.setInterval(() => {
      const elapsed = performance.now() - start;
      // Ease-out curve: fast at first, slow as we approach 95%.
      const t = Math.min(1, elapsed / targetMs);
      const eased = 1 - Math.pow(1 - t, 2.2);
      setProgress(Math.min(95, eased * 95));
    }, 100);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/floorplan-extract", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      setProgress(100);
      // Brief pause at 100% so the user sees the bar finish before the
      // results render.
      await new Promise((r) => setTimeout(r, 250));
      setExtraction(json.extraction);
      // New extraction lands → previously-resolved flag indices are
      // meaningless against the new ambiguity_notes array.
      setResolvedFlags(new Set());
      setCollapsed(false);
      onExtracted?.(json.extraction);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (progressTimer.current !== null) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
      setExtracting(false);
    }
  }

  /**
   * Newer path — instead of flat $/sqft category lines, generate
   * live-editable AssemblyInstance records from the extraction and the
   * derived QuoteLines they explode into. Lands the builder on /quote
   * with the assemblies panel populated, ready to tweak properties at
   * the kitchen table.
   */
  async function applyAssemblies() {
    if (!extraction) return;
    setApplying(true);
    try {
      const deal = await getDeal(dealId);
      if (!deal) throw new Error("Project no longer exists");
      const settings = await getSettings(orgRef);
      const markup = settings?.default_markup_percent ?? 20;

      const existingLines = await listQuoteLines(dealId);
      const existingInstances = deal.assembly_instances ?? [];

      const { instances, lines } = instancesAndLinesFromFloorPlan(
        extraction as unknown as Parameters<typeof instancesAndLinesFromFloorPlan>[0],
        markup,
        existingLines.length + 1,
        () => newId("ql"),
      );

      const combinedLines: QuoteLine[] = [
        ...existingLines,
        ...lines.map((l, i) => ({ ...l, line_number: existingLines.length + i + 1 })),
      ];
      await saveQuoteLines(dealId, orgRef, combinedLines);

      const combinedInstances = [...existingInstances, ...instances];
      const customer = combinedLines.reduce((s, l) => s + (l.customer_extended || 0), 0);
      const cost = combinedLines.reduce((s, l) => s + (l.cost_extended || 0), 0);
      const margin = customer > 0 ? ((customer - cost) / customer) * 100 : 0;

      await saveDeal({
        ...deal,
        assembly_instances: combinedInstances,
        total_quote_value: customer,
        total_cost: cost,
        margin_percent: margin,
        updated_at: new Date().toISOString(),
      });

      router.push(`/deals/${dealId}/quote`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  async function applyToEstimate() {
    if (!extraction) return;
    setApplying(true);
    try {
      const newLines = generateEstimateLines(extraction);
      // Append to any existing lines so prior manual entries survive.
      const existing = await listQuoteLines(dealId);
      const renumbered: QuoteLine[] = [
        ...existing,
        ...newLines.map((l, i) => ({ ...l, line_number: existing.length + i + 1 })),
      ];
      await saveQuoteLines(dealId, orgRef, renumbered);

      // Roll up totals onto the deal record — the milestone generator
      // and pipeline cards read these. Mirrors the quote page onSave.
      const customer = renumbered.reduce((s, l) => s + (l.customer_extended || 0), 0);
      const cost = renumbered.reduce((s, l) => s + (l.cost_extended || 0), 0);
      const margin = customer > 0 ? ((customer - cost) / customer) * 100 : 0;
      const deal = await getDeal(dealId);
      if (deal) {
        await saveDeal({
          ...deal,
          total_quote_value: customer,
          total_cost: cost,
          margin_percent: margin,
          updated_at: new Date().toISOString(),
        });
      }

      router.push(`/deals/${dealId}/quote`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) pickFile(dropped);
  }

  return (
    <section className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 shadow-sm">
      <div className="flex items-center gap-2 border-b border-sky-200 px-6 py-4">
        <SparklesIcon className="h-5 w-5 text-sky-700" />
        <h2 className="text-sm font-semibold text-slate-900">AI Floor Plan Extraction</h2>
        <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-800">
          Beta
        </span>
      </div>

      <div className="space-y-4 p-6">
        {!extraction && (
          <>
            <p className="text-sm text-slate-700">
              Drop a floor plan PDF. Verify before quoting.
            </p>

            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragActive
                  ? "border-sky-500 bg-sky-100"
                  : "border-sky-300 bg-white hover:border-sky-400 hover:bg-sky-50"
              }`}
            >
              <ArrowUpTrayIcon className="h-8 w-8 text-sky-600" />
              <p className="mt-2 text-sm font-medium text-slate-900">
                {file ? file.name : "Drop floor plan PDF here"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "or click to browse · max 32MB"}
              </p>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </div>

            {!file && (
              <p className="text-center text-xs text-slate-500">
                Don&apos;t have a plan handy?{" "}
                <button
                  type="button"
                  onClick={loadSampleExtraction}
                  className="font-semibold text-sky-700 hover:text-sky-900 hover:underline"
                >
                  Try with a sample plan →
                </button>
              </p>
            )}

            {file && (
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => pickFile(null)}
                  disabled={extracting}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                {extracting ? (
                  // Determinate progress bar: time-based fill from 0 to 95%
                  // over ~12s, then jumps to 100% when the API returns.
                  <div
                    role="progressbar"
                    aria-live="polite"
                    aria-valuenow={Math.round(progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="relative w-44 overflow-hidden rounded-md bg-sky-100 px-5 py-2 text-sm font-semibold text-sky-900 ring-1 ring-sky-300"
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-sky-500 transition-all duration-200 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                    <div className="relative flex items-center justify-center gap-1.5">
                      <SparklesIcon className="h-4 w-4" />
                      <span className="tabular-nums">{Math.round(progress)}%</span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={runExtraction}
                    className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    Extract
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <span className="font-semibold">Extraction failed.</span> {error}
            </div>
          </div>
        )}

        {extraction && collapsed && (
          <ExtractionSummary
            extraction={extraction}
            unresolvedFlagCount={
              extraction.ambiguity_notes.filter((_, i) => !resolvedFlags.has(i)).length
            }
            onExpand={() => setCollapsed(false)}
            onReupload={startReupload}
          />
        )}

        {extraction && !collapsed && (
          <ExtractionResults
            extraction={extraction}
            resolvedFlags={resolvedFlags}
            onToggleFlag={toggleFlag}
            onUpdate={setExtraction}
            onApply={applyToEstimate}
            onApplyAssemblies={applyAssemblies}
            onReset={startReupload}
            applying={applying}
          />
        )}
      </div>
    </section>
  );
}

function ExtractionResults({
  extraction,
  resolvedFlags,
  onToggleFlag,
  onUpdate,
  onApply,
  onApplyAssemblies,
  onReset,
  applying,
}: {
  extraction: FloorPlanExtraction;
  resolvedFlags: Set<number>;
  onToggleFlag: (idx: number) => void;
  onUpdate: (e: FloorPlanExtraction) => void;
  onApply: () => void;
  onApplyAssemblies: () => void;
  onReset: () => void;
  applying: boolean;
}) {
  const conf = extraction.confidence;
  const confColor =
    conf === "high" ? "bg-emerald-100 text-emerald-800" : conf === "medium" ? "bg-sky-100 text-sky-800" : "bg-red-100 text-red-800";

  const linesPreview = generateEstimateLines(extraction);
  const totalEstimateCost = linesPreview.reduce((s, l) => s + l.cost_extended, 0);
  const totalEstimatePrice = linesPreview.reduce((s, l) => s + l.customer_extended, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
          <span className="text-sm font-semibold text-slate-900">
            {extraction.plan_name || "Plan extracted"}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${confColor}`}>
            {conf} confidence
          </span>
        </div>
        <button
          onClick={onReset}
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          Try another file
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumField
          label="Total sqft"
          value={extraction.total_sqft}
          onChange={(v) => onUpdate({ ...extraction, total_sqft: v })}
        />
        <NumField
          label="Bedrooms"
          value={extraction.bedrooms}
          onChange={(v) => onUpdate({ ...extraction, bedrooms: v })}
        />
        <NumField
          label="Full baths"
          value={extraction.full_baths}
          onChange={(v) => onUpdate({ ...extraction, full_baths: v })}
        />
        <NumField
          label="Half baths"
          value={extraction.half_baths}
          onChange={(v) => onUpdate({ ...extraction, half_baths: v })}
        />
        <NumField
          label="Garage sqft"
          value={extraction.garage_sqft}
          onChange={(v) => onUpdate({ ...extraction, garage_sqft: v })}
        />
        <NumField
          label="Porch sqft"
          value={extraction.porch_sqft}
          onChange={(v) => onUpdate({ ...extraction, porch_sqft: v })}
        />
      </div>

      <details className="rounded-md border border-slate-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
          Rooms ({extraction.rooms.length})
        </summary>
        <ul className="mt-3 space-y-1 text-xs text-slate-700">
          {extraction.rooms.map((r, i) => (
            <li key={i} className="flex justify-between border-b border-slate-100 py-1 last:border-b-0">
              <span>
                {r.level && <span className="text-slate-400">[{r.level}] </span>}
                {r.name}
              </span>
              <span className="font-mono text-slate-500">
                {r.dimensions || (r.sqft ? `${r.sqft} sf` : "—")}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {extraction.ambiguity_notes.length > 0 && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="font-semibold text-sky-900">
              Open verifications — check off as you confirm
            </p>
            <span className="text-[10px] text-sky-700">
              {extraction.ambiguity_notes.length - resolvedFlags.size} of{" "}
              {extraction.ambiguity_notes.length} open
            </span>
          </div>
          <ul className="space-y-1.5">
            {extraction.ambiguity_notes.map((note, i) => {
              const resolved = resolvedFlags.has(i);
              return (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={resolved}
                      onChange={() => onToggleFlag(i)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-sky-400 text-sky-700 focus:ring-sky-500"
                    />
                    <span
                      className={
                        resolved
                          ? "text-slate-500 line-through"
                          : "text-sky-900"
                      }
                    >
                      {note}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-900">
          Generates {linesPreview.length} line items
        </p>
        <p className="mt-1 text-xs text-emerald-800">
          Cost basis: ~${totalEstimateCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          {" · "}
          Estimate to client: ~${totalEstimatePrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </p>
        <p className="mt-2 text-[11px] italic text-emerald-700">
          Mid-grade defaults using $/sqft rules-of-thumb. Edit on the next screen before sending.
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={onApply}
          disabled={applying}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          title="Generate flat $/sqft category lines — quick ballpark estimate."
        >
          {applying ? "Applying…" : "Quick estimate ($/sqft)"}
        </button>
        <button
          onClick={onApplyAssemblies}
          disabled={applying}
          className="rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-400"
          title="Generate parametric assemblies you can edit live at the kitchen table."
        >
          {applying ? "Applying…" : "Create assemblies →"}
        </button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") onChange(null);
          else {
            const n = parseFloat(v);
            if (Number.isFinite(n)) onChange(n);
          }
        }}
        placeholder="—"
        className="mt-1 w-full bg-transparent text-base font-semibold tabular-nums text-slate-900 focus:outline-none"
      />
    </div>
  );
}

// ── Estimate generation rules ────────────────────────────────────
// Mid-grade residential custom-home rules-of-thumb (USA averages,
// 2026 dollars). These produce a reasonable starting point for a
// schematic estimate; the builder always tunes per project before
// quoting. Builder-friendly grouping by category.

interface DraftLine {
  category: string;
  description: string;
  qty: number;
  unit: string;
  unit_cost: number;       // dollars per unit (sqft, ea, lump, etc.)
  markup_percent: number;
}

function generateEstimateLines(extraction: FloorPlanExtraction): QuoteLine[] {
  const totalSqft = extraction.total_sqft || 0;
  const firstFloor = extraction.first_floor_sqft || totalSqft;
  const garageSqft = extraction.garage_sqft || 0;
  const porchSqft = extraction.porch_sqft || 0;
  const fullBaths = extraction.full_baths || 0;
  const halfBaths = extraction.half_baths || 0;
  const stories = extraction.stories || 1;

  // Footprint approximated from first-floor sqft (excludes 2nd floor that
  // sits above 1st-floor footprint). For single-story this == total.
  const footprintSqft = firstFloor || totalSqft / stories;

  const isBasement = (extraction.foundation_type || "").toLowerCase().includes("basement");
  const isSlab = (extraction.foundation_type || "").toLowerCase().includes("slab");

  const drafts: DraftLine[] = [
    // Site work — based on footprint
    {
      category: "Site Work",
      description: "Site prep, excavation, grading, utilities rough-in",
      qty: footprintSqft,
      unit: "sqft footprint",
      unit_cost: 8,
      markup_percent: 15,
    },

    // Foundation — depends on type
    {
      category: "Foundation",
      description: isBasement
        ? "Basement foundation: footings, walls, slab"
        : isSlab
        ? "Slab on grade w/ footings"
        : "Crawl space foundation: footings, stem walls",
      qty: footprintSqft,
      unit: "sqft footprint",
      unit_cost: isBasement ? 30 : isSlab ? 12 : 14,
      markup_percent: 15,
    },

    // Framing — total heated sqft + garage
    {
      category: "Framing",
      description: "Frame package: lumber, sheathing, labor (including roof structure)",
      qty: totalSqft + garageSqft,
      unit: "sqft",
      unit_cost: 32,
      markup_percent: 15,
    },

    // Roofing — approx 1.3× footprint for hip roof, single coverage
    {
      category: "Exterior",
      description: "Roofing: shingles, underlayment, flashing, gutters",
      qty: Math.round(footprintSqft * 1.35),
      unit: "sqft of roof",
      unit_cost: 8,
      markup_percent: 15,
    },

    // Exterior cladding — perimeter × wall height as proxy via sqft
    {
      category: "Exterior",
      description: "Siding, exterior trim, soffit/fascia",
      qty: Math.round(totalSqft * 0.85),
      unit: "sqft (wall area est.)",
      unit_cost: 14,
      markup_percent: 15,
    },

    // Windows + exterior doors
    {
      category: "Exterior",
      description: "Windows + exterior doors (mid-grade, allowance)",
      qty: (extraction.doors_windows.windows_estimated || Math.round(totalSqft / 150)) +
           (extraction.doors_windows.exterior_doors_estimated || 3),
      unit: "ea",
      unit_cost: 850,
      markup_percent: 15,
    },

    // MEP
    {
      category: "MEP Rough-In",
      description: "Plumbing rough-in",
      qty: totalSqft,
      unit: "sqft",
      unit_cost: 6,
      markup_percent: 15,
    },
    {
      category: "MEP Rough-In",
      description: "Plumbing fixtures + finish (allowance)",
      qty: fullBaths + halfBaths + 1, // +1 for kitchen
      unit: "bath/kitchen",
      unit_cost: 4500,
      markup_percent: 15,
    },
    {
      category: "MEP Rough-In",
      description: "HVAC (system + ductwork + install)",
      qty: totalSqft,
      unit: "sqft",
      unit_cost: 11,
      markup_percent: 15,
    },
    {
      category: "MEP Rough-In",
      description: "Electrical rough-in + finish (panel, wiring, fixtures)",
      qty: totalSqft,
      unit: "sqft",
      unit_cost: 8,
      markup_percent: 15,
    },

    // Insulation + drywall
    {
      category: "Drywall & Insulation",
      description: "Insulation (walls + ceiling)",
      qty: totalSqft,
      unit: "sqft",
      unit_cost: 2.5,
      markup_percent: 15,
    },
    {
      category: "Drywall & Insulation",
      description: "Drywall: hang, finish, prime",
      qty: totalSqft,
      unit: "sqft",
      unit_cost: 3.5,
      markup_percent: 15,
    },

    // Finishes
    {
      category: "Finishes",
      description: "Interior trim, doors, hardware",
      qty: totalSqft,
      unit: "sqft",
      unit_cost: 6,
      markup_percent: 15,
    },
    {
      category: "Finishes",
      description: "Cabinets + countertops (kitchen + baths, allowance)",
      qty: 1,
      unit: "lump",
      unit_cost: 35000 + (fullBaths * 4500),
      markup_percent: 15,
    },
    {
      category: "Finishes",
      description: "Flooring (mid-grade allowance)",
      qty: totalSqft,
      unit: "sqft",
      unit_cost: 9,
      markup_percent: 15,
    },
    {
      category: "Finishes",
      description: "Interior paint",
      qty: totalSqft,
      unit: "sqft",
      unit_cost: 3.5,
      markup_percent: 15,
    },

    // Garage as a separate line if present
    ...(garageSqft > 0
      ? [{
          category: "Exterior",
          description: `Garage build-out (${extraction.garage_cars || ""}-car attached)`,
          qty: garageSqft,
          unit: "sqft",
          unit_cost: 35,
          markup_percent: 15,
        }]
      : []),

    // Porch
    ...(porchSqft > 0
      ? [{
          category: "Exterior",
          description: "Covered porches / outdoor living",
          qty: porchSqft,
          unit: "sqft",
          unit_cost: 45,
          markup_percent: 15,
        }]
      : []),

    // Soft costs
    {
      category: "Soft Costs",
      description: "Permits, fees, surveys, soils report",
      qty: 1,
      unit: "lump",
      unit_cost: Math.round(totalSqft * 4),
      markup_percent: 0,
    },
    {
      category: "Soft Costs",
      description: "General conditions: portable toilets, dumpster, temp power, supervision",
      qty: 1,
      unit: "lump",
      unit_cost: Math.round(totalSqft * 8),
      markup_percent: 10,
    },
  ];

  return drafts.map((d, i) => {
    const cost_unit = d.unit_cost;
    const customer_unit = cost_unit * (1 + d.markup_percent / 100);
    const cost_extended = round(cost_unit * d.qty, 2);
    const customer_extended = round(customer_unit * d.qty, 2);
    const margin =
      customer_extended > 0
        ? ((customer_extended - cost_extended) / customer_extended) * 100
        : 0;

    return {
      id: newId("ql"),
      line_number: i + 1,
      product_code: d.category,            // repurposed to show the phase grouping in the table
      description: `${d.description} (${d.unit})`,
      manufacturer: "",
      is_service: false,
      qty: d.qty,
      list_price: cost_unit,               // builders treat list_price as cost basis (no discount)
      discount_percent: 0,
      customer_unit_price: round(customer_unit, 4),
      customer_extended,
      markup_percent: d.markup_percent,
      cost_unit_price: round(cost_unit, 4),
      cost_extended,
      margin_percent: round(margin, 2),
      subscription_term_months: 0,
      notes: "",
    };
  });
}

function round(n: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

// Compact summary shown when the page loads and an extraction is already
// saved on the deal. Gives Barry an at-a-glance confirmation that work
// is preserved, plus visibility into how many AI-flagged verifications
// are still open. Click 'Show details' to expand into the full editor;
// 'Re-upload' to replace with a new plan.
function ExtractionSummary({
  extraction,
  unresolvedFlagCount,
  onExpand,
  onReupload,
}: {
  extraction: FloorPlanExtraction;
  unresolvedFlagCount: number;
  onExpand: () => void;
  onReupload: () => void;
}) {
  const stats: string[] = [];
  if (extraction.total_sqft) stats.push(`${extraction.total_sqft.toLocaleString()} sqft`);
  if (extraction.bedrooms != null) stats.push(`${extraction.bedrooms} bed`);
  if (extraction.full_baths != null) {
    const baths =
      extraction.full_baths + 0.5 * (extraction.half_baths ?? 0);
    stats.push(`${baths} bath`);
  }
  if (extraction.garage_cars) stats.push(`${extraction.garage_cars}-car garage`);

  return (
    <div className="rounded-lg border border-emerald-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {extraction.plan_name || "Floor plan extracted"}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              {stats.join(" · ") || "Extraction saved"}
            </p>
            {unresolvedFlagCount > 0 && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                <ExclamationTriangleIcon className="h-3 w-3" />
                {unresolvedFlagCount} open verification
                {unresolvedFlagCount === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onExpand}
            className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
          >
            Show details
          </button>
          <button
            type="button"
            onClick={onReupload}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title="Replace with a new plan"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Re-upload
          </button>
        </div>
      </div>
    </div>
  );
}
