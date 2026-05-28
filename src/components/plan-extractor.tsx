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
import { upload } from "@vercel/blob/client";
import { QuoteLine } from "@/types";
import { saveQuoteLines, listQuoteLines, getDeal, saveDeal, getSettings, newId } from "@/lib/store";
import { instancesAndLinesFromPlan } from "@/lib/assemblies/from-plan";

// Shape returned by /api/plan-extract. Mirrors the schema in the
// route's system prompt; null-allowed for fields Claude couldn't read.
// Synthetic extraction used by the "Try with sample plan" button. Lets a
// builder evaluating the platform see the full post-extract UI without
// having to upload a real PDF. Numbers are realistic for a 4-bed, 3.5-bath
// custom home — roughly the Maddox House profile in the seed data.
const SAMPLE_EXTRACTION: PlanExtraction = {
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
  conditioned_footprint_dimensions: "56' × 40'",
  roof_area_sqft: 3200,
  roof_type: "gable+hip",
  roof_pitch_in_12: 8,
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
    interior_doors_estimated: 32,
    pocket_doors_estimated: 4,
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

export interface PlanExtraction {
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
  /** First-floor heated/cooled area dimensions, excludes porch + garage.
   *  Used by the converter for floor framing + interior wall scope. */
  conditioned_footprint_dimensions?: string | null;
  /** Architect-labeled total roof finish area (SF). Used when present
   *  instead of footprint × pitch math; lets the converter respect a
   *  printed number on the roof plan. */
  roof_area_sqft?: number | null;
  /** Primary roof shape — drives eave LF, ridge LF, and gutter run
   *  scaling in the converter. */
  roof_type?: "gable" | "hip" | "gable+hip" | "complex" | null;
  /** Primary roof pitch in 12ths (e.g. 8 for "8/12"). When present,
   *  the converter uses it to compute roof area and gable height
   *  instead of assuming 6/12 across the board. */
  roof_pitch_in_12?: number | null;
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
    /** All interior doors including pocket doors. Custom-home spec
     *  typically 25-50. Used by the converter when present; falls back
     *  to bedroom/bath heuristic when absent. */
    interior_doors_estimated?: number | null;
    /** Pocket / sliding-into-wall doors. Subset of interior count.
     *  Triggers a +50% unit-cost surcharge on the interior door
     *  assembly (pocket frame + soft-close hardware). */
    pocket_doors_estimated?: number | null;
    windows_estimated: number | null;
  };
  notable_features: string[];
  ambiguity_notes: string[];
  confidence: "high" | "medium" | "low";
}

export default function PlanExtractor({
  dealId,
  orgRef,
  initialExtraction,
  initialResolvedFlags,
  onExtracted,
  onApplied,
}: {
  dealId: string;
  orgRef: string;
  /** If the deal already has a saved extraction, render straight into
   *  the post-extract UI instead of the upload dropzone. */
  initialExtraction?: PlanExtraction;
  initialResolvedFlags?: number[];
  onExtracted?: (extraction: PlanExtraction) => void;
  /** Fired after a successful Apply (either flat or assembly mode).
   *  The quote-editor passes this so it can re-fetch its line state
   *  in place instead of relying on the default router.push("/quote")
   *  (which is a no-op when the user is already on /quote and would
   *  leave the editor showing stale, empty lines while the new data
   *  sits in Firestore). */
  onApplied?: () => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const progressTimer = useRef<number | null>(null);
  /** Aborts the in-flight upload + extraction when the user hits
   *  Cancel mid-flight. Vercel Blob's upload() and our fetch() both
   *  honor the signal. Reset on each new run. */
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [slowExtractionHint, setSlowExtractionHint] = useState(false);
  const slowHintTimer = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  /** Which Apply action is currently running, so each button shows its
   *  own spinner instead of both buttons reading the same `applying` flag. */
  const [applyingMode, setApplyingMode] = useState<
    "flat" | "assemblies" | null
  >(null);
  const [applyProgress, setApplyProgress] = useState(0);
  /** Set when the user clicks Apply (or Create estimate from assemblies)
   *  AND there are existing line items on the quote. Drives the in-app
   *  Replace / Add / Cancel modal — replaces the old window.confirm()
   *  which felt clunky and didn't offer Replace. */
  const [pendingApply, setPendingApply] = useState<{
    kind: "flat" | "assemblies";
    existingCount: number;
  } | null>(null);
  const [extraction, setExtraction] = useState<PlanExtraction | null>(
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
        console.warn("[plan-extractor] persist failed", e);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [extraction, resolvedFlags, dealId]);

  function pickFile(picked: File | null) {
    setError(null);
    // Don't wipe extraction here — re-upload should be an explicit action
    // (the "Replace" button below) so the GC doesn't accidentally lose
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

    // 32MB ceiling — matches Claude's PDF input cap. The /api/upload
    // route enforces the same limit server-side via maximumSizeInBytes
    // on the signed token, but checking here gives a clean message
    // before we spin up the upload at all.
    const MAX_BYTES = 32 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setError(
        `This PDF is ${mb} MB. The extractor caps at 32 MB per file. ` +
          `Try compressing the PDF — re-exporting at a lower DPI usually halves the size.`,
      );
      return;
    }

    // Fresh abort controller for this run. Honored by the upload() call
    // and the /api/plan-extract fetch so the Cancel button can stop both
    // halves of the operation mid-flight.
    abortRef.current = new AbortController();
    setExtracting(true);
    setProgress(0);
    setError(null);
    setSlowExtractionHint(false);

    // Time-based progress simulation across two phases:
    //   0–20%   blob upload (variable, depends on file size + connection)
    //   20–95%  Claude vision (one-shot, scales with PDF page count)
    // Target duration for phase 2 scales by file size — a 1-page floor
    // plan completes in ~8s; a 16-page build set takes 25-30s. Without
    // scaling, big files saw the bar lock at 95% for ~20s of silent
    // wait, which read as "stuck." Now the bar tracks the real wait
    // and we surface a "still analyzing" hint if the API outruns the
    // estimate.
    const targetMs =
      file.size < 1 * 1024 * 1024
        ? 10_000
        : file.size < 3 * 1024 * 1024
          ? 15_000
          : file.size < 10 * 1024 * 1024
            ? 25_000
            : 35_000;
    let phaseStart = performance.now();
    let phaseStartProgress = 0;
    let phaseEndProgress = 20;
    let phaseDuration = 0; // unknown until upload completes
    progressTimer.current = window.setInterval(() => {
      const elapsed = performance.now() - phaseStart;
      if (phaseDuration === 0) {
        // Upload phase — creep 0→18 slowly; the real signal comes from
        // the upload() onUploadProgress callback below.
        const creep = Math.min(18, elapsed / 200);
        setProgress((p) => Math.max(p, creep));
      } else {
        const t = Math.min(1, elapsed / phaseDuration);
        const eased = 1 - Math.pow(1 - t, 2.2);
        const range = phaseEndProgress - phaseStartProgress;
        setProgress(phaseStartProgress + eased * range);
      }
    }, 100);

    try {
      // Phase 1 — direct upload to Vercel Blob via the signed-token
      // handshake at /api/upload. This bypasses the 4.5MB Vercel
      // function body limit; Blob accepts up to 4.5GB.
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
      const blob = await upload(`plan-uploads/${Date.now()}-${safeName}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        contentType: file.type || "application/pdf",
        abortSignal: abortRef.current.signal,
        onUploadProgress: ({ percentage }) => {
          // Map the 0-100 upload percentage into our 0-18 visual range
          // so the bar feels honest about what's actually happening.
          setProgress((p) => Math.max(p, (percentage / 100) * 18));
        },
      });

      // Phase 2 — call the extractor with just the blob URL. Tiny
      // request, never hits the 4.5MB function-body ceiling.
      setProgress(20);
      phaseStart = performance.now();
      phaseStartProgress = 20;
      phaseEndProgress = 95;
      phaseDuration = targetMs;

      // If the bar hits 95% before the API returns, surface a
      // "still analyzing" hint so the wait reads as honest progress
      // rather than a stuck UI. Fires at phaseDuration (the same
      // moment the bar caps at 95).
      slowHintTimer.current = window.setTimeout(() => {
        setSlowExtractionHint(true);
      }, targetMs);

      const res = await fetch("/api/plan-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blob_url: blob.url, filename: file.name }),
        signal: abortRef.current.signal,
      });
      // Parse defensively: even with the blob hop, the function can
      // still 504 (extraction timeout) or return a non-JSON edge error.
      const bodyText = await res.text();
      let json: { ok?: boolean; error?: string; extraction?: PlanExtraction } | null = null;
      try {
        json = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        const snippet = bodyText.slice(0, 80).replace(/\s+/g, " ").trim();
        throw new Error(`Server returned ${res.status}: ${snippet || "no response body"}`);
      }
      if (!res.ok || !json?.ok || !json.extraction) {
        throw new Error(json?.error || `Request failed (${res.status})`);
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
      // User-initiated cancel: don't render an angry error message.
      // The "Cancelled" affordance is just clearing back to the dropzone.
      const isAbort =
        (e instanceof Error && e.name === "AbortError") ||
        (e instanceof DOMException && e.name === "AbortError") ||
        abortRef.current?.signal.aborted;
      if (!isAbort) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (progressTimer.current !== null) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
      if (slowHintTimer.current !== null) {
        clearTimeout(slowHintTimer.current);
        slowHintTimer.current = null;
      }
      setSlowExtractionHint(false);
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
  async function applyAssemblies(replace = false, skipExistingCheck = false) {
    if (!extraction) return;
    // First-call branch: if the quote already has lines, open the modal
    // and let the user choose Replace / Add / Cancel before doing
    // anything. The modal re-invokes this function with skipExistingCheck
    // = true once they pick a path.
    if (!skipExistingCheck) {
      const existing = await listQuoteLines(dealId);
      if (existing.length > 0) {
        setPendingApply({ kind: "assemblies", existingCount: existing.length });
        return;
      }
    }
    setApplyingMode("assemblies");
    setApplyProgress(0);
    setApplying(true);
    // Same eased progress curve the AI extraction uses, scaled to ~2.5s
    // since apply is faster than vision. Holds at 95% until the saves
    // resolve, snaps to 100% on completion.
    const start = performance.now();
    const targetMs = 2500;
    const tick = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / targetMs);
      const eased = 1 - Math.pow(1 - t, 2.2);
      setApplyProgress(Math.min(95, eased * 95));
    }, 80);
    try {
      const deal = await getDeal(dealId);
      if (!deal) throw new Error("Project no longer exists");
      const settings = await getSettings(orgRef);
      const markup = settings?.default_markup_percent ?? 20;

      // Smart Replace: keep anything the builder hand-touched —
      // manual lines, RFQ-won bids, and 1build market-priced lines all
      // survive. Only the previous extractor's catalog-generated lines
      // and "plan"-tagged assemblies get wiped before the new plan
      // output stacks on. Add mode: append everything (original).
      const allLines = await listQuoteLines(dealId);
      const allInstances = deal.assembly_instances ?? [];
      const existingLines = replace
        ? allLines.filter((l) => l.price_source && l.price_source !== "catalog")
        : allLines;
      const existingInstances = replace
        ? allInstances.filter((i) => i.source !== "plan")
        : allInstances;

      const { instances, lines } = instancesAndLinesFromPlan(
        extraction as unknown as Parameters<typeof instancesAndLinesFromPlan>[0],
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

      setApplyProgress(100);
      await new Promise((r) => setTimeout(r, 200));
      // If the parent (quote editor) wants to refresh in place, let it.
      // Otherwise push to the quote page so Overview lands there.
      if (onApplied) {
        onApplied();
      } else {
        router.push(`/deals/${dealId}/quote`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      clearInterval(tick);
      setApplying(false);
      setApplyingMode(null);
    }
  }

  async function applyToEstimate(replace = false, skipExistingCheck = false) {
    if (!extraction) return;
    if (!skipExistingCheck) {
      const existing = await listQuoteLines(dealId);
      if (existing.length > 0) {
        setPendingApply({ kind: "flat", existingCount: existing.length });
        return;
      }
    }
    setApplyingMode("flat");
    setApplyProgress(0);
    setApplying(true);
    const start = performance.now();
    const targetMs = 2000;
    const tick = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / targetMs);
      const eased = 1 - Math.pow(1 - t, 2.2);
      setApplyProgress(Math.min(95, eased * 95));
    }, 80);
    try {
      const newLines = generateEstimateLines(extraction);
      // Smart Replace: keep manual / RFQ-bid / market-priced lines;
      // only wipe the previous catalog-generated set. Add mode keeps
      // everything.
      const allLines = await listQuoteLines(dealId);
      const existing = replace
        ? allLines.filter((l) => l.price_source && l.price_source !== "catalog")
        : allLines;
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

      setApplyProgress(100);
      await new Promise((r) => setTimeout(r, 200));
      if (onApplied) {
        onApplied();
      } else {
        router.push(`/deals/${dealId}/quote`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      clearInterval(tick);
      setApplying(false);
      setApplyingMode(null);
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
        <h2 className="text-sm font-semibold text-slate-900">Plan Extraction</h2>
        <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-800">
          Beta
        </span>
      </div>

      <div className="space-y-4 p-6">
        {!extraction && (
          <>
            <p className="text-sm text-slate-700">
              Drop a plan PDF — floor plan, full build plan, or plan set. Verify before quoting.
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
                {file ? file.name : "Drop plan PDF here"}
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
                  onClick={() => {
                    // Mid-flight: abort the upload + extraction signal.
                    // The runExtraction catch ignores AbortError so we
                    // unwind cleanly without a scary error banner.
                    if (extracting) {
                      abortRef.current?.abort();
                    } else {
                      pickFile(null);
                    }
                  }}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                {extracting ? (
                  // Determinate progress bar: time-based fill from 0 to 95%
                  // scaled by file size, then jumps to 100% when the API
                  // returns. A "still analyzing" hint appears under the
                  // bar if Claude takes longer than the estimate.
                  <div className="flex flex-col items-end gap-1.5">
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
                    {slowExtractionHint && (
                      <span className="text-[11px] italic text-slate-500">
                        Still analyzing the plan — large plan sets can run 30-45s.
                      </span>
                    )}
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
            onApply={() => void applyToEstimate()}
            onApplyAssemblies={() => void applyAssemblies()}
            onReset={startReupload}
            applying={applying}
            applyingMode={applyingMode}
            applyProgress={applyProgress}
          />
        )}
      </div>

      {pendingApply && (
        <ApplyChoiceModal
          existingCount={pendingApply.existingCount}
          kind={pendingApply.kind}
          onReplace={() => {
            const choice = pendingApply;
            setPendingApply(null);
            if (choice.kind === "assemblies") {
              void applyAssemblies(true, true);
            } else {
              void applyToEstimate(true, true);
            }
          }}
          onAdd={() => {
            const choice = pendingApply;
            setPendingApply(null);
            if (choice.kind === "assemblies") {
              void applyAssemblies(false, true);
            } else {
              void applyToEstimate(false, true);
            }
          }}
          onCancel={() => setPendingApply(null)}
        />
      )}
    </section>
  );
}

/**
 * Three-option modal shown when the builder tries to Apply / Create
 * estimate from assemblies and the quote already has line items.
 * Replaces the old window.confirm() — gives a real Replace option
 * (which the confirm couldn't offer) and keeps the visual style
 * consistent with the rest of the app.
 */
function ApplyChoiceModal({
  existingCount,
  kind,
  onReplace,
  onAdd,
  onCancel,
}: {
  existingCount: number;
  kind: "flat" | "assemblies";
  onReplace: () => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const noun = existingCount === 1 ? "line item" : "line items";
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">
          This estimate already has {existingCount} {noun}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          What would you like to do with the plan&apos;s {kind === "assemblies" ? "assemblies" : "lines"}?
        </p>
        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={onReplace}
            className="w-full rounded-md bg-sky-700 px-4 py-2.5 text-left text-sm font-semibold text-white shadow-sm hover:bg-sky-800"
          >
            Replace plan output
            <span className="block text-xs font-normal text-sky-100">
              Swap out the previous extraction&apos;s {noun} and assemblies for the new ones. Anything you&apos;ve hand-edited or accepted from sub bids is kept.
            </span>
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="w-full rounded-md border border-slate-300 bg-white px-4 py-2.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Add to existing
            <span className="block text-xs font-normal text-slate-500">
              Append the plan&apos;s {kind === "assemblies" ? "assemblies" : "lines"} on top of everything currently on the estimate.
            </span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-md px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
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
  applyingMode,
  applyProgress,
}: {
  extraction: PlanExtraction;
  resolvedFlags: Set<number>;
  onToggleFlag: (idx: number) => void;
  onUpdate: (e: PlanExtraction) => void;
  onApply: () => void;
  onApplyAssemblies: () => void;
  onReset: () => void;
  applying: boolean;
  applyingMode: "flat" | "assemblies" | null;
  applyProgress: number;
}) {
  const conf = extraction.confidence;
  const confColor =
    conf === "high" ? "bg-emerald-100 text-emerald-800" : conf === "medium" ? "bg-sky-100 text-sky-800" : "bg-red-100 text-red-800";

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
          title="Replace this extraction with a new plan upload. Existing estimate lines (if you already applied) are not touched."
        >
          Replace
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

      {applying ? (
        // Match the AI extraction's progress UX so the apply step feels
        // like one continuous flow, not a different kind of waiting.
        <div className="rounded-md border border-sky-200 bg-sky-50 p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-sky-900">
              {applyingMode === "assemblies"
                ? "Generating assemblies…"
                : "Building estimate…"}
            </span>
            <span className="tabular-nums text-sky-700">
              {Math.round(applyProgress)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sky-100">
            <div
              className="h-full bg-sky-600 transition-[width] duration-200"
              style={{ width: `${applyProgress}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={onApply}
          disabled={applying}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          title="Generate flat $/sqft category lines — quick ballpark estimate."
        >
          {applyingMode === "flat" ? "Building…" : "Quick estimate ($/sqft)"}
        </button>
        <button
          onClick={onApplyAssemblies}
          disabled={applying}
          className="rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-400"
          title="Generate parametric assemblies you can edit live at the kitchen table."
        >
          {applyingMode === "assemblies" ? "Generating…" : "Create estimate from assemblies →"}
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

function generateEstimateLines(extraction: PlanExtraction): QuoteLine[] {
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
// 'Replace' to swap in a new plan.
function ExtractionSummary({
  extraction,
  unresolvedFlagCount,
  onExpand,
  onReupload,
}: {
  extraction: PlanExtraction;
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
              {extraction.plan_name || "Plan extracted"}
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
            title="Replace this extraction with a new plan upload. Existing estimate lines (if you already applied) are not touched."
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
