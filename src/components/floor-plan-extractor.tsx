"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpTrayIcon,
  SparklesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { QuoteLine } from "@/types";
import { saveQuoteLines, listQuoteLines, getDeal, saveDeal, newId } from "@/lib/store";

// Shape returned by /api/floorplan-extract. Mirrors the schema in the
// route's system prompt; null-allowed for fields Claude couldn't read.
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
  onExtracted,
}: {
  dealId: string;
  orgRef: string;
  onExtracted?: (extraction: FloorPlanExtraction) => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState<FloorPlanExtraction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  function pickFile(picked: File | null) {
    setError(null);
    setExtraction(null);
    setFile(picked);
  }

  async function runExtraction() {
    if (!file) return;
    setExtracting(true);
    setError(null);
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
      setExtraction(json.extraction);
      onExtracted?.(json.extraction);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtracting(false);
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
    <section className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm">
      <div className="flex items-center gap-2 border-b border-amber-200 px-6 py-4">
        <SparklesIcon className="h-5 w-5 text-amber-700" />
        <h2 className="text-sm font-semibold text-slate-900">AI Floor Plan Extraction</h2>
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
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
                  ? "border-amber-500 bg-amber-100"
                  : "border-amber-300 bg-white hover:border-amber-400 hover:bg-amber-50"
              }`}
            >
              <ArrowUpTrayIcon className="h-8 w-8 text-amber-600" />
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
                  // Progress-bar button — indeterminate slide while Claude reads.
                  // Reuses the .parser-loading-bar keyframe from globals.css.
                  <div
                    role="status"
                    aria-live="polite"
                    aria-label="Reading plan"
                    className="relative w-44 overflow-hidden rounded-md bg-amber-200 px-5 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-300"
                  >
                    <div className="parser-loading-bar absolute inset-y-0 bg-amber-500/70" />
                    <div className="relative flex items-center justify-center gap-1.5">
                      <SparklesIcon className="h-4 w-4" />
                      Reading plan…
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={runExtraction}
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"
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

        {extraction && (
          <ExtractionResults
            extraction={extraction}
            onUpdate={setExtraction}
            onApply={applyToEstimate}
            onReset={() => {
              setExtraction(null);
              setFile(null);
              if (fileInput.current) fileInput.current.value = "";
            }}
            applying={applying}
          />
        )}
      </div>
    </section>
  );
}

function ExtractionResults({
  extraction,
  onUpdate,
  onApply,
  onReset,
  applying,
}: {
  extraction: FloorPlanExtraction;
  onUpdate: (e: FloorPlanExtraction) => void;
  onApply: () => void;
  onReset: () => void;
  applying: boolean;
}) {
  const conf = extraction.confidence;
  const confColor =
    conf === "high" ? "bg-emerald-100 text-emerald-800" : conf === "medium" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";

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
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="mb-1 font-semibold">AI flagged:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {extraction.ambiguity_notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
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

      <div className="flex justify-end gap-2">
        <button
          onClick={onApply}
          disabled={applying}
          className="rounded-md bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-400"
        >
          {applying ? "Applying…" : "Apply to estimate →"}
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
