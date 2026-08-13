"use client";

// Add-ons gallery. Reframed from a quarter-dated "Roadmap" because the
// audience (builders evaluating the platform solo) reacts better to
// "here's what's possible — pick what you'd use" than to "coming Q3."
// Each card has a stylized preview so the shape of the feature is
// visible without requiring it to actually exist yet. Builder asks for
// one → we prioritize and deliver.

import { useState } from "react";
import {
  CubeIcon,
  HomeModernIcon,
  SparklesIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";

interface Feature {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  description: string;
  bullets: string[];
  preview: React.ReactNode;
}

const FEATURES: Feature[] = [
  {
    id: "materials",
    title: "Materials Sourcing Catalog",
    icon: CubeIcon,
    tagline: "Real-time pricing across Home Depot, Lowe's, and your local supplier.",
    description:
      "Search and add materials directly to your estimate without bouncing between five tabs. Live pricing pulled from supplier APIs.",
    bullets: [
      "Catalog search across HD Pro, Lowe's Pro, local lumber yards",
      "One-click add to estimate as a line item",
      "Markup defaults pre-applied per category",
      "Track your favorites + saved lists for repeat builds",
    ],
    preview: <MaterialsPreview />,
  },
  {
    id: "walkthrough",
    title: "3D Model & Scale Print",
    icon: HomeModernIcon,
    tagline: "Hand your client a to-scale model of their home before ground breaks.",
    description:
      "Turn the floor plan into a to-scale 3D model — a physical, 3D-printed scale model shipped to your client, plus an orbitable 3D preview on their phone. Sell the vision, cut change orders, wow high-end buyers.",
    bullets: [
      "Generated from your uploaded floor plan — no scanning, no site visit",
      "Physical 3D-printed scale model, printed on demand and shipped to your client",
      "Orbitable 3D preview link (mobile-friendly)",
      "Finish/material overlays as selections get made",
    ],
    preview: <WalkthroughPreview />,
  },
];

export default function RoadmapPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700">
          <SparklesIcon className="h-4 w-4" />
          Add-ons
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          What&apos;s possible
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Optional capabilities we can build. We deliver based on what you actually
          need — pick what would save you the most time and we&apos;ll prioritize it.
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {FEATURES.map((f) => (
          <FeatureCard
            key={f.id}
            feature={f}
            expanded={expanded === f.id}
            onToggle={() => setExpanded(expanded === f.id ? null : f.id)}
          />
        ))}
      </div>

      <div className="mt-10 rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center">
        <p className="text-sm font-medium text-slate-900">Have something else you need?</p>
        <p className="mt-1 text-xs text-slate-500">
          The add-ons above are common requests — if there&apos;s something specific to
          how you run jobs that would save real time, tell us and we&apos;ll build it.
        </p>
      </div>
    </AppShell>
  );
}

function FeatureCard({
  feature: f,
  expanded,
  onToggle,
}: {
  feature: Feature;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = f.icon;
  return (
    <article
      className={`rounded-xl border bg-white shadow-sm transition-all ${
        expanded ? "border-sky-300 ring-2 ring-sky-100" : "border-slate-200"
      }`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-5 text-left"
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-sky-100">
          <Icon className="h-5 w-5 text-sky-700" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-semibold text-slate-900">{f.title}</h2>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700">
              Add-on
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-700">{f.tagline}</p>
        </div>
        <span className="mt-1 text-xs font-medium text-sky-700">
          {expanded ? "Hide" : "Preview →"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <p className="text-sm text-slate-700">{f.description}</p>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
            <ul className="space-y-1.5 text-xs text-slate-700">
              {f.bullets.map((b, i) => (
                <li key={i} className="flex gap-1.5">
                  <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sky-600" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              {f.preview}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

// ── preview components ───────────────────────────────────────────
// Stylized non-functional UI. Each one shows the SHAPE of the feature
// so the demo audience can imagine it working without us having to
// actually build it.

function MaterialsPreview() {
  return (
    <div className="w-72 space-y-1.5 text-[10px]">
      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="font-semibold text-slate-900">2x6x10&apos; SPF stud-grade</div>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <PriceTile vendor="HD Pro" price="$11.42" best />
          <PriceTile vendor="Lowe&apos;s" price="$11.97" />
          <PriceTile vendor="Local" price="$10.85" best />
        </div>
        <button className="mt-1.5 w-full rounded bg-sky-600 px-2 py-1 text-[9px] font-semibold text-white">
          Add to estimate
        </button>
      </div>
      <div className="text-center text-slate-400">+ 24,000 SKUs</div>
    </div>
  );
}

function PriceTile({ vendor, price, best }: { vendor: string; price: string; best?: boolean }) {
  return (
    <div className={`rounded border p-1 text-center ${best ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="text-[8px] uppercase tracking-wider text-slate-500">{vendor}</div>
      <div className={`text-[10px] font-bold ${best ? "text-emerald-700" : "text-slate-900"}`}>
        {price}
      </div>
    </div>
  );
}

function WalkthroughPreview() {
  return (
    <div className="relative h-32 w-72 overflow-hidden rounded-lg bg-gradient-to-br from-slate-700 to-slate-900">
      <div className="absolute inset-0 flex items-center justify-center text-white">
        <div className="text-center">
          <HomeModernIcon className="mx-auto h-10 w-10 text-sky-400 opacity-80" />
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider">
            Walk the house
          </p>
          <p className="text-[9px] text-slate-300">Tap and drag to explore</p>
        </div>
      </div>
      <div className="absolute bottom-1 left-1 right-1 flex gap-0.5">
        {["Foyer", "Kitchen", "Living", "Master", "Bath"].map((r) => (
          <div
            key={r}
            className="flex-1 rounded bg-white/20 py-0.5 text-center text-[8px] text-white backdrop-blur"
          >
            {r}
          </div>
        ))}
      </div>
    </div>
  );
}


