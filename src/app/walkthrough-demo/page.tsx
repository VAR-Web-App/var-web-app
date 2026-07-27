"use client";

// Path-B 3D walkthrough — POC test harness. Uses a sample room list (as the
// plan extractor would produce), asks the layout API to place the rooms, then
// renders the extruded model. Standalone + no auth so it's easy to demo.

import { useCallback, useEffect, useState } from "react";
import WalkthroughViewer from "@/components/walkthrough-viewer";
import type { WalkthroughLayout } from "@/app/api/walkthrough/layout/route";
import { layoutToStl, downloadStl } from "@/lib/model3d";

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
  const [printNote, setPrintNote] = useState<string | null>(null);

  // Proof of the physical-model path: turn the same layout into a printable
  // STL, fit to a 200 mm longest side (a typical desk-model size), and download
  // it. Feed the file to a slicer to sanity-check the geometry.
  const downloadModel = useCallback(() => {
    if (!layout) return;
    const { bytes, boundsMm, triangleCount } = layoutToStl(layout, {
      targetLongestMm: 200,
    });
    downloadStl(bytes, "scale-model.stl");
    setPrintNote(
      `Exported ${triangleCount.toLocaleString()} triangles · prints at ~${Math.round(
        boundsMm.x,
      )}×${Math.round(boundsMm.z)}×${Math.round(boundsMm.y)} mm.`,
    );
  }, [layout]);

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
        <div className="flex gap-2">
          <button
            onClick={downloadModel}
            disabled={!layout}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Download STL
          </button>
          <button
            onClick={generate}
            disabled={busy}
            className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:bg-sky-300"
          >
            {busy ? "Generating…" : "Regenerate"}
          </button>
        </div>
      </div>
      {printNote && (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {printNote} Drop the file into a slicer (or a print-on-demand vendor)
          to check the geometry.
        </p>
      )}

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
          {Math.round(layout.footprint.depth)}′. Massing is approximate — good
          enough for a to-scale printed model; refined walls/roof are the next
          step (see lib/model3d TODOs).
        </p>
      )}
    </main>
  );
}
