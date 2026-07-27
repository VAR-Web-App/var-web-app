"use client";

// Path-B 3D walkthrough — POC test harness. Uses a sample room list (as the
// plan extractor would produce), asks the layout API to place the rooms, then
// renders the extruded model. Standalone + no auth so it's easy to demo.

import { useCallback, useEffect, useState } from "react";
import WalkthroughViewer from "@/components/walkthrough-viewer";
import type { WalkthroughLayout } from "@/app/api/walkthrough/layout/route";
import { layoutToStl, downloadStl, buildHouseMesh } from "@/lib/model3d";
import { exportGlb, exportUsdz } from "@/lib/model3d/three-export";

// Maddox — Country Dream House (Architectural Designs plan 46380L), the app's
// sample project. Rooms + dimensions taken straight off the labeled floor plan
// (72'9" × 82'7" footprint, 10' main / 9' second ceilings).
const DEMO_ROOMS = [
  { name: "Foyer", dimensions: "12' × 12'", sqft: 144, level: "main" },
  { name: "Study", dimensions: "12' × 12'", sqft: 144, level: "main" },
  { name: "Dining", dimensions: "12' × 12'", sqft: 144, level: "main" },
  { name: "Bedroom 2", dimensions: "12' × 12'", sqft: 144, level: "main" },
  { name: "Bedroom 3", dimensions: "12' × 12'", sqft: 144, level: "main" },
  { name: "Vaulted Family", dimensions: "17' × 19'", sqft: 329, level: "main" },
  { name: "Kitchen", dimensions: "11' × 24'", sqft: 269, level: "main" },
  { name: "Owner's Suite", dimensions: "16' × 17'", sqft: 272, level: "main" },
  { name: "Garage", dimensions: "26' × 33'", sqft: 858, level: "main" },
  { name: "Bedroom 4", dimensions: "12' × 14'", sqft: 170, level: "second" },
  { name: "Bedroom 5", dimensions: "12' × 14'", sqft: 170, level: "second" },
  { name: "Bonus / 6th BR", dimensions: "12' × 19'", sqft: 243, level: "second" },
];

export default function WalkthroughDemoPage() {
  const [layout, setLayout] = useState<WalkthroughLayout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printNote, setPrintNote] = useState<string | null>(null);
  const [ar, setAr] = useState<{ glb: string; usdz: string } | null>(null);
  const [arBusy, setArBusy] = useState(false);

  // AR proof: build the same mesh, export GLB (Android/web) + USDZ (iOS AR
  // Quick Look), and hand back object URLs. On an iPhone, the "View in AR"
  // link drops the house on your table at ~20 cm.
  const buildAr = useCallback(async () => {
    if (!layout) return;
    setArBusy(true);
    try {
      const mesh = buildHouseMesh(layout, { targetLongestMm: 200 });
      const [glb, usdz] = await Promise.all([exportGlb(mesh), exportUsdz(mesh)]);
      setAr((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev.glb);
          URL.revokeObjectURL(prev.usdz);
        }
        return { glb: URL.createObjectURL(glb), usdz: URL.createObjectURL(usdz) };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "AR export failed.");
    } finally {
      setArBusy(false);
    }
  }, [layout]);

  // Android: launch Google's Scene Viewer against the server-hosted GLB (it
  // needs a real URL, not a blob). No-op on non-Android — Chrome falls back to
  // the browser_fallback_url (the raw GLB download).
  function openAndroidAr() {
    const glb = `${window.location.origin}/api/walkthrough/glb`;
    const intent =
      `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(glb)}` +
      `&mode=ar_preferred&title=${encodeURIComponent("Maddox — Country Dream House")}` +
      `#Intent;scheme=https;package=com.google.android.googlequicksearchbox;` +
      `action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(glb)};end;`;
    window.location.href = intent;
  }

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
        body: JSON.stringify({ rooms: DEMO_ROOMS, footprint: "72' × 82'" }),
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
            Maddox — Country Dream House
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
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                View on your table (AR)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Drop the house on your table at ~20&nbsp;cm.{" "}
                <span className="font-medium text-slate-700">Android:</span> tap
                “View in AR” (opens Scene Viewer).{" "}
                <span className="font-medium text-slate-700">iPhone:</span>{" "}
                Generate first, then “View in AR (iOS)”. Works on the deployed
                site, not localhost.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={openAndroidAr}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                View in AR (Android)
              </button>
              <button
                onClick={buildAr}
                disabled={arBusy}
                className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:bg-sky-300"
              >
                {arBusy ? "Building…" : ar ? "Rebuild iOS/files" : "Generate iOS / files"}
              </button>
            </div>
          </div>
          {ar && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* rel="ar" + an <img> child triggers iOS AR Quick Look. */}
              <a
                rel="ar"
                href={ar.usdz}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <img
                  src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
                  alt=""
                  className="h-0 w-0"
                />
                View in AR (iOS)
              </a>
              <a
                href={ar.glb}
                download="maddox-house.glb"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Download GLB
              </a>
              <a
                href={ar.usdz}
                download="maddox-house.usdz"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Download USDZ
              </a>
              <span className="text-[11px] text-slate-400">
                Android AR (Scene Viewer) needs the GLB hosted at a URL — a small
                follow-up.
              </span>
            </div>
          )}
        </div>
      )}

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
