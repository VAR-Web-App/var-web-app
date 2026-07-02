"use client";

// Pre-floorplan questionnaire (Barry/Ira's idea): for prospects with no plans
// yet. A few inputs → a rough ballpark built from the same plan→assemblies
// converter, using the standard catalog. Deliberately a top-of-funnel estimate;
// the real number comes from a plan + the builder's priced GFE on a real deal.
import { useState } from "react";
import AppShell from "@/components/app-shell";
import { instancesAndLinesFromPlan } from "@/lib/assemblies/from-plan";

type Foundation = "slab" | "crawl space" | "basement";
type Tier = "economy" | "standard" | "premium";
const TIER_MULT: Record<Tier, number> = {
  economy: 0.9,
  standard: 1.0,
  premium: 1.2,
};

interface Result {
  total: number;
  perSqft: number;
  categories: { label: string; amount: number }[];
}

export default function QuickEstimatePage() {
  const [sqft, setSqft] = useState(2800);
  const [stories, setStories] = useState(1);
  const [bedrooms, setBedrooms] = useState(4);
  const [fullBaths, setFullBaths] = useState(3);
  const [halfBaths, setHalfBaths] = useState(1);
  const [garageCars, setGarageCars] = useState(2);
  const [foundation, setFoundation] = useState<Foundation>("crawl space");
  const [tier, setTier] = useState<Tier>("standard");
  const [markup, setMarkup] = useState(18);
  const [result, setResult] = useState<Result | null>(null);

  function calculate() {
    const s = Math.max(1, stories);
    const extraction = {
      total_sqft: sqft,
      first_floor_sqft: s > 1 ? Math.round(sqft * 0.55) : sqft,
      second_floor_sqft: s > 1 ? Math.round(sqft * 0.45) : 0,
      bonus_sqft: 0,
      porch_sqft: 220,
      garage_sqft: garageCars * 240,
      garage_cars: garageCars,
      bedrooms,
      full_baths: fullBaths,
      half_baths: halfBaths,
      footprint_dimensions: null,
      roof_type: "gable+hip" as const,
      roof_pitch_in_12: 8,
      stories: s,
      foundation_type: foundation,
      exterior_wall_type: "2x6",
      ceiling_heights: "9",
      doors_windows: {
        exterior_doors_estimated: 4,
        interior_doors_estimated: null,
        pocket_doors_estimated: 0,
        windows_estimated: Math.round(sqft / 150),
      },
      notable_features: [],
    };
    let n = 0;
    const { lines } = instancesAndLinesFromPlan(extraction, markup, 1, () => `q${n++}`);
    const mult = TIER_MULT[tier];
    const byCat: Record<string, number> = {};
    for (const l of lines)
      byCat[l.product_code] = (byCat[l.product_code] ?? 0) + l.customer_extended * mult;
    const total = Object.values(byCat).reduce((a, b) => a + b, 0);
    const categories = Object.entries(byCat)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);
    setResult({ total, perSqft: sqft > 0 ? total / sqft : 0, categories });
  }

  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const numField = (
    label: string,
    value: number,
    set: (n: number) => void,
    step = 1,
  ) => (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Quick estimate
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          No plans yet? Answer a few questions for a rough ballpark off your
          standard template. Create a project with a real plan to refine it.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-3">
          {numField("Total sq ft", sqft, setSqft, 100)}
          {numField("Stories", stories, setStories)}
          {numField("Bedrooms", bedrooms, setBedrooms)}
          {numField("Full baths", fullBaths, setFullBaths)}
          {numField("Half baths", halfBaths, setHalfBaths)}
          {numField("Garage cars", garageCars, setGarageCars)}
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Foundation</span>
            <select
              value={foundation}
              onChange={(e) => setFoundation(e.target.value as Foundation)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="slab">Slab</option>
              <option value="crawl space">Crawl space</option>
              <option value="basement">Basement</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Finish tier</span>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as Tier)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="economy">Economy</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </label>
          {numField("Markup %", markup, setMarkup)}
        </div>

        <button
          type="button"
          onClick={calculate}
          className="mt-4 rounded-md bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-800"
        >
          Calculate ballpark
        </button>

        {result && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-500">
                Rough ballpark ({tier}, {markup}% markup)
              </span>
              <span className="text-3xl font-bold text-green-700">
                {money(result.total)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              ≈ {money(result.perSqft)}/sq ft · standard catalog pricing — your
              Settings → Pricing adjustments aren&rsquo;t applied to this quick
              estimate.
            </p>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {result.categories.map((c) => (
                  <tr key={c.label} className="border-b border-slate-100">
                    <td className="py-1.5 text-slate-700">{c.label}</td>
                    <td className="py-1.5 text-right text-slate-600">
                      {money(c.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
