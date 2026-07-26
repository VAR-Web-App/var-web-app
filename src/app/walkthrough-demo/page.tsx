"use client";

// Path-B 3D walkthrough — POC test harness. Uses a sample room list (as the
// plan extractor would produce), asks the layout API to place the rooms, then
// renders the extruded model. Standalone + no auth so it's easy to demo.

import { useCallback, useEffect, useState } from "react";
import WalkthroughViewer from "@/components/walkthrough-viewer";
import type { WalkthroughLayout } from "@/app/api/walkthrough/layout/route";

const DEMO_ROOMS = [
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
];

export default function WalkthroughDemoPage() {
  const [layout, setLayout] = useState<WalkthroughLayout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/walkthrough/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: DEMO_ROOMS, footprint: "68' × 42'" }),
      });
      const data = (await res.json()) as { ok: boolean; layout?: WalkthroughLayout; error?: string };
      if (!data.ok || !data.layout) setError(data.error || "Layout failed.");
      else setLayout(data.layout);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void generate();
  }, [generate]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700">
            3D Walkthrough · Path B (POC)
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Sample home — inferred model
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Rooms placed by AI from names + sizes, extruded with three.js. Drag
            to orbit, scroll to zoom. Blue = main level, amber = second.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:bg-sky-300"
        >
          {busy ? "Generating…" : "Regenerate"}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="p-10 text-center text-sm text-red-600">{error}</div>
        ) : !layout ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {busy ? "Laying out the floor plan…" : "Loading…"}
          </div>
        ) : (
          <WalkthroughViewer layout={layout} />
        )}
      </div>

      {layout && (
        <p className="mt-3 text-xs text-slate-400">
          {layout.rooms.length} rooms placed · footprint ~{Math.round(layout.footprint.width)}′ ×{" "}
          {Math.round(layout.footprint.depth)}′. Layout is approximate (Path B);
          survey-accurate geometry needs Path A (CubiCasa).
        </p>
      )}
    </main>
  );
}
