"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  findStubAssembly,
  STUB_ASSEMBLIES,
} from "@/lib/assemblies/stub-catalog";
import { computeMaterials } from "@/lib/assemblies/compute";
import NumberInput from "@/components/number-input";
import {
  activeVariantOf,
  type Assembly,
  type AssemblyInstance,
  type AssemblyProperty,
  type AssemblyVariant,
  type AssemblyVariantPreset,
} from "@/types/assembly";

/** Roll up a single variant to a dollar total via the shared compute. */
function variantTotal(variant: AssemblyVariant): number {
  const assembly = findStubAssembly(variant.assemblyId);
  if (!assembly) return 0;
  const propertyMap = Object.fromEntries(
    variant.propertyValues.map((p) => [p.name, p.value]),
  );
  return computeMaterials(assembly, propertyMap).total;
}

/** Roll up the ACTIVE variant of an instance — the one that drives the
 *  estimate's QuoteLines + project totals. Inactive variants are
 *  reference state and don't contribute to project totals. */
function instanceTotal(instance: AssemblyInstance): number {
  return variantTotal(activeVariantOf(instance));
}

/** Trade buckets ordered by construction sequence — same order the GC
 *  experiences on the job, so the assemblies list reads top-to-bottom
 *  the way the build happens. */
const TRADE_ORDER: Array<Assembly["trade"]> = [
  "foundation",
  "framing",
  "roofing",
  "exterior",
  "drywall",
  "flooring",
  "millwork",
  "finishes",
  "other",
];

const TRADE_LABELS: Record<Assembly["trade"], string> = {
  foundation: "Foundation",
  framing: "Framing",
  roofing: "Roofing",
  exterior: "Exterior",
  drywall: "Drywall",
  flooring: "Flooring",
  millwork: "Millwork",
  finishes: "Finishes",
  other: "Other",
};

/** Alternating left-accent stripes by group position — white section
 *  bg, only the stripe distinguishes one trade from the next. Most
 *  minimal aesthetic; lets the cards inside read clean. */
const ALT_ACCENTS: Array<{ bar: string }> = [
  { bar: "bg-slate-400" },
  { bar: "bg-sky-500" },
];

interface TradeBucket {
  trade: Assembly["trade"];
  label: string;
  items: AssemblyInstance[];
}

function groupByTrade(instances: AssemblyInstance[]): TradeBucket[] {
  const map = new Map<Assembly["trade"], AssemblyInstance[]>();
  for (const inst of instances) {
    // Trade comes from the ACTIVE variant's assembly — that's what
    // currently drives the QuoteLines, so it determines where this
    // instance belongs in the GC's read-order.
    const variant = activeVariantOf(inst);
    const a = findStubAssembly(variant.assemblyId);
    const trade = a?.trade ?? "other";
    if (!map.has(trade)) map.set(trade, []);
    map.get(trade)!.push(inst);
  }
  return TRADE_ORDER.filter((t) => map.has(t)).map((t) => ({
    trade: t,
    label: TRADE_LABELS[t],
    items: map.get(t)!,
  }));
}

/**
 * Live-editable list of assembly instances on a quote.
 *
 * Built for the "Barry is sitting with a client" scenario: tweak
 * properties (stud spacing, slab thickness, roof pitch) and the
 * derived QuoteLines regenerate live so the client sees the cost
 * update in real time.
 *
 * State of the underlying instances + lines is owned by the parent
 * (quote page); this component is a controlled view.
 */
export default function AssemblyInstancesPanel({
  instances,
  onChange,
  onRemove,
  onSwap,
  onDuplicate,
  onAddAssembly,
}: {
  instances: AssemblyInstance[];
  onChange: (next: AssemblyInstance) => void;
  onRemove: (instanceId: string) => void;
  /** Swap an instance to a different assembly definition (e.g. vinyl → wood window family). */
  onSwap: (instanceId: string, newAssemblyId: string) => void;
  /** Clone an instance into a sibling for side-by-side what-if comparison. */
  onDuplicate: (instanceId: string) => void;
  /** Opens the Add Assembly modal. Optional — when absent the header
   *  button is hidden (e.g. sandbox / read-only embeds). */
  onAddAssembly?: () => void;
}) {
  if (instances.length === 0) return null;

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Assemblies on this quote
          </h2>
          <span className="text-xs text-slate-500">
            {instances.length} assembl{instances.length === 1 ? "y" : "ies"}
          </span>
        </div>
        {onAddAssembly ? (
          <button
            type="button"
            onClick={onAddAssembly}
            className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add assembly
          </button>
        ) : null}
      </header>
      <AssemblyComparisonHeader instances={instances} />
      {/* Group cards by trade so the GC can find a specific phase
       *  quickly. Each group is independently collapsible — useful when
       *  a floor-plan import generates 13 assemblies across 6 trades. */}
      {groupByTrade(instances).map((group, idx) => (
        <TradeGroup
          key={group.trade}
          group={group}
          accentIdx={idx}
          totalInstances={instances.length}
          onChange={onChange}
          onRemove={onRemove}
          onSwap={onSwap}
          onDuplicate={onDuplicate}
        />
      ))}
    </section>
  );
}

/** One trade section (Framing / Roofing / etc.) with a collapsible
 *  header showing the trade name + card count + subtotal, and the
 *  two-column card grid inside. */
function TradeGroup({
  group,
  accentIdx,
  totalInstances,
  onChange,
  onRemove,
  onSwap,
  onDuplicate,
}: {
  group: TradeBucket;
  accentIdx: number;
  totalInstances: number;
  onChange: (next: AssemblyInstance) => void;
  onRemove: (instanceId: string) => void;
  onSwap: (instanceId: string, newAssemblyId: string) => void;
  onDuplicate: (instanceId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const subtotal = useMemo(
    () => group.items.reduce((s, i) => s + instanceTotal(i), 0),
    [group.items],
  );
  const accent = ALT_ACCENTS[accentIdx % ALT_ACCENTS.length];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-stretch text-left hover:bg-black/5"
        aria-expanded={open}
      >
        <span className={`w-1.5 ${accent.bar}`} aria-hidden />
        <span className="flex flex-1 items-center gap-2 px-3 py-2">
          {open ? (
            <ChevronDownIcon className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-slate-500" />
          )}
          <span className="text-sm font-semibold text-slate-900">
            {group.label}
          </span>
          <span className="text-xs text-slate-500">
            {group.items.length} assembl
            {group.items.length === 1 ? "y" : "ies"}
          </span>
          <span className="ml-auto text-sm font-semibold tabular-nums text-slate-700">
            ${subtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </span>
      </button>
      {open ? (
        <div className="grid grid-cols-1 items-start gap-3 p-3 md:grid-cols-2">
          {group.items.map((instance, idx) => (
            <AssemblyInstanceCard
              key={instance.id}
              instance={instance}
              onChange={onChange}
              onRemove={() => onRemove(instance.id)}
              onSwap={(newAssemblyId) => onSwap(instance.id, newAssemblyId)}
              onDuplicate={() => onDuplicate(instance.id)}
              // Smart default: keep cards open when the project has 3
              // or fewer assemblies total; otherwise start collapsed
              // (except the first of the first group) so a 13-assembly
              // floor-plan import isn't a wall of text.
              defaultCollapsed={totalInstances > 3 && !(group.trade === "foundation" && idx === 0)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * "Option A vs Option B" delta widget. Shown above the instance cards when
 * 2+ assemblies are on the quote. Defaults A and B to the first two
 * instances so the comparison populates as soon as Barry duplicates one;
 * either side can be repointed from the dropdown.
 */
function AssemblyComparisonHeader({
  instances,
}: {
  instances: AssemblyInstance[];
}) {
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);
  // Open by default when there are exactly 2 instances (the "Barry just
  // duplicated one" case where compare is what the user wants). Closed
  // when there are many instances — opening eats screen real estate and
  // is only situationally useful in that mode.
  const [open, setOpen] = useState<boolean>(instances.length === 2);
  const [helpOpen, setHelpOpen] = useState(false);

  const a = useMemo(() => {
    const picked = instances.find((i) => i.id === aId);
    return picked ?? instances[0] ?? null;
  }, [instances, aId]);

  const b = useMemo(() => {
    const picked = instances.find((i) => i.id === bId);
    if (picked) return picked;
    const fallback = instances.find((i) => i.id !== a?.id) ?? instances[1];
    return fallback ?? null;
  }, [instances, bId, a]);

  const aTotal = useMemo(() => (a ? instanceTotal(a) : 0), [a]);
  const bTotal = useMemo(() => (b ? instanceTotal(b) : 0), [b]);

  if (instances.length < 2 || !a || !b) return null;

  const delta = bTotal - aTotal;
  const deltaPct = aTotal > 0 ? (delta / aTotal) * 100 : 0;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const absDelta = Math.abs(delta);

  const deltaColor =
    delta < -0.005
      ? "text-emerald-700"
      : delta > 0.005
        ? "text-amber-700"
        : "text-slate-500";
  const deltaBg =
    delta < -0.005
      ? "bg-emerald-50 border-emerald-200"
      : delta > 0.005
        ? "bg-amber-50 border-amber-200"
        : "bg-slate-50 border-slate-200";

  // Collapsed header — single row with the delta peek-through so the
  // builder can decide whether to expand without losing the info.
  const collapsedSummary =
    absDelta < 0.005
      ? "Same price"
      : `${sign}$${absDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}${aTotal > 0 ? ` (${sign}${Math.abs(deltaPct).toFixed(0)}%)` : ""}`;

  return (
    // When expanded, stick to the top of the viewport (clearing the
    // sticky TotalsBar height ~48px) so the GC can keep an eye on the
    // running A/B delta while scrolling through the assembly cards
    // below. Collapsed state stays in normal flow.
    <div
      className={
        "rounded-xl border border-sky-200 bg-sky-50/95 backdrop-blur " +
        (open ? "sticky top-12 z-20 shadow-md" : "")
      }
    >
      <div className="flex items-center px-1 py-0.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sky-100/50"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDownIcon className="h-4 w-4 text-sky-700" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-sky-700" />
          )}
          <span className="text-sm font-semibold text-sky-900">
            Option compare
          </span>
        </button>
        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          className="rounded-full p-1 text-sky-700 hover:bg-sky-100"
          aria-expanded={helpOpen}
          aria-label={helpOpen ? "Close compare help" : "How to use Option compare"}
          title="How to use Option compare"
        >
          <QuestionMarkCircleIcon className="h-4 w-4" />
        </button>
        <span className={`ml-auto pr-3 text-xs tabular-nums ${deltaColor}`}>
          A vs B: {collapsedSummary}
        </span>
      </div>
      {helpOpen ? (
        <div className="relative border-t border-sky-200 bg-white/70 p-4 text-xs leading-relaxed text-slate-700">
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close compare help"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
          <p className="font-semibold text-sky-900">
            How to use Option compare
          </p>
          <p className="mt-1 text-[11px] italic text-slate-500">
            Walk a client through trade-offs live — vinyl vs wood
            windows, 16&quot; vs 24&quot; stud spacing, etc.
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>
              <strong>Add an assembly</strong>{" "}
              (e.g. Window Unit) and set its properties as you&apos;d
              normally quote it — say Vinyl frame, double-hung.
            </li>
            <li>
              <strong>Click the duplicate icon</strong>{" "}
              (the two-overlapping-squares icon) on that assembly&apos;s
              card. A copy appears below it.
            </li>
            <li>
              <strong>On the copy, change one property</strong> — switch
              Frame Material to Wood, or change the stud spacing, etc.
              You now have two versions to compare.
            </li>
            <li>
              <strong>Expand this Option compare bar</strong> (click the
              chevron above). The Option A and Option B dropdowns
              auto-pick your first two assemblies — change them if you
              want to compare different ones.
            </li>
            <li>
              <strong>Read the Difference</strong>{" "}
              tile — green means Option B is cheaper than A, amber means
              more expensive. Tweak either side&apos;s properties live;
              the delta updates in real time both here and in this
              collapsed header.
            </li>
          </ol>
        </div>
      ) : null}
      {open ? (
    <div className="border-t border-sky-200 p-4">
      <div className="mb-3 text-xs text-sky-700 sm:hidden">
        Pick any two assemblies — totals update live as you edit
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <ComparisonSide
          label="Option A"
          instances={instances}
          selectedId={a.id}
          onChange={setAId}
          total={aTotal}
        />
        <ComparisonSide
          label="Option B"
          instances={instances}
          selectedId={b.id}
          onChange={setBId}
          total={bTotal}
        />
        <div className={`rounded-lg border ${deltaBg} px-3 py-2`}>
          <div className="text-xs font-medium text-slate-600">Difference</div>
          <div
            className={`mt-1 text-lg font-semibold tabular-nums ${deltaColor}`}
          >
            {absDelta < 0.005
              ? "Same price"
              : `${sign}$${absDelta.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <div className={`text-xs tabular-nums ${deltaColor}`}>
            {aTotal > 0 && absDelta >= 0.005
              ? `${sign}${Math.abs(deltaPct).toFixed(1)}% vs Option A`
              : "—"}
          </div>
        </div>
      </div>
    </div>
      ) : null}
    </div>
  );
}

function ComparisonSide({
  label,
  instances,
  selectedId,
  onChange,
  total,
}: {
  label: string;
  instances: AssemblyInstance[];
  selectedId: string;
  onChange: (id: string) => void;
  total: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
      >
        {instances.map((i) => (
          <option key={i.id} value={i.id}>
            {i.instanceLabel?.trim() ? i.instanceLabel : i.assemblyName}
          </option>
        ))}
      </select>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
        ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}

function AssemblyInstanceCard({
  instance,
  onChange,
  onRemove,
  onSwap,
  onDuplicate,
  defaultCollapsed = false,
}: {
  instance: AssemblyInstance;
  onChange: (next: AssemblyInstance) => void;
  onRemove: () => void;
  onSwap: (newAssemblyId: string) => void;
  onDuplicate: () => void;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);

  const activeVariant = activeVariantOf(instance);
  const assembly: Assembly | null = useMemo(
    () => findStubAssembly(activeVariant.assemblyId),
    [activeVariant.assemblyId],
  );

  // Roll up every variant once so the chips can show their own price +
  // delta vs active without re-computing inside each chip render.
  const variantTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of instance.variants) m.set(v.id, variantTotal(v));
    return m;
  }, [instance.variants]);
  const activeTotal = variantTotals.get(activeVariant.id) ?? 0;

  const propertyMap = useMemo(
    () =>
      Object.fromEntries(
        activeVariant.propertyValues.map((p) => [p.name, p.value]),
      ),
    [activeVariant.propertyValues],
  );

  const computed = useMemo(
    () => (assembly ? computeMaterials(assembly, propertyMap) : null),
    [assembly, propertyMap],
  );

  function updateLabel(label: string) {
    onChange({ ...instance, instanceLabel: label });
  }

  function switchActive(variantId: string) {
    if (variantId === instance.activeVariantId) return;
    onChange({ ...instance, activeVariantId: variantId });
  }

  function renameVariant(variantId: string, label: string) {
    onChange({
      ...instance,
      variants: instance.variants.map((v) =>
        v.id === variantId ? { ...v, label } : v,
      ),
    });
  }

  function mintVarId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `var_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Clone the currently active variant — used by the "Clone current"
   *  entry in the + Add variant menu when the builder wants to start
   *  from where they are rather than a preset. */
  function addVariantFromClone() {
    const newId = mintVarId();
    const letter = String.fromCharCode(65 + instance.variants.length);
    const proposed = `Option ${letter}`;
    const labelTaken = instance.variants.some((v) => v.label === proposed);
    const label = labelTaken
      ? `Variant ${instance.variants.length + 1}`
      : proposed;
    const newVariant: AssemblyVariant = {
      id: newId,
      label,
      assemblyId: activeVariant.assemblyId,
      propertyValues: activeVariant.propertyValues.map((p) => ({ ...p })),
    };
    onChange({
      ...instance,
      variants: [...instance.variants, newVariant],
      activeVariantId: newId,
    });
  }

  /** Apply a curated preset from the assembly catalog — overrides land
   *  on top of the new variant's assembly defaults. Property names that
   *  the preset doesn't override keep their assembly default. */
  function addVariantFromPreset(preset: AssemblyVariantPreset) {
    const newId = mintVarId();
    const targetAssemblyId = preset.assemblyId ?? activeVariant.assemblyId;
    const targetAssembly = findStubAssembly(targetAssemblyId);
    if (!targetAssembly) return;
    // Start from the new assembly's defaults so all required properties
    // exist, then apply the preset's overrides on top.
    const propertyValues = targetAssembly.properties.map((p) => {
      const override = preset.propertyOverrides[p.name];
      if (override != null) return { name: p.name, value: override };
      const fallback =
        p.defaultValue ??
        (p.kind === "option" ? p.options?.[0]?.value : undefined) ??
        (p.kind === "choice" ? p.choices?.[0] : undefined) ??
        0;
      return { name: p.name, value: fallback };
    });
    const newVariant: AssemblyVariant = {
      id: newId,
      label: preset.label,
      assemblyId: targetAssemblyId,
      propertyValues,
    };
    onChange({
      ...instance,
      variants: [...instance.variants, newVariant],
      activeVariantId: newId,
    });
  }

  function deleteVariant(variantId: string) {
    if (instance.variants.length <= 1) return;
    const remaining = instance.variants.filter((v) => v.id !== variantId);
    const nextActive =
      instance.activeVariantId === variantId
        ? remaining[0].id
        : instance.activeVariantId;
    onChange({
      ...instance,
      variants: remaining,
      activeVariantId: nextActive,
    });
  }

  function updateActiveProperty(name: string, value: number) {
    onChange({
      ...instance,
      variants: instance.variants.map((v) =>
        v.id === activeVariant.id
          ? {
              ...v,
              propertyValues: v.propertyValues.map((p) =>
                p.name === name ? { ...p, value } : p,
              ),
            }
          : v,
      ),
    });
  }

  if (!assembly) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Assembly definition for{" "}
        <span className="font-mono">{activeVariant.assemblyId}</span> was
        not found. It may have been removed from the catalog.{" "}
        <button
          onClick={onRemove}
          className="font-semibold underline hover:no-underline"
        >
          Remove from quote
        </button>
      </div>
    );
  }

  // Compact property summary for the collapsed card header — built from
  // the active variant's property values.
  const propSummary = activeVariant.propertyValues
    .map(({ name, value }) => {
      const p = assembly.properties.find((x) => x.name === name);
      if (!p) return null;
      if (p.kind === "option" && p.options) {
        const opt = p.options.find((o) => o.value === value);
        return opt?.label ?? null;
      }
      if (!Number.isFinite(value) || value === 0) return null;
      const uom = p.uom ? ` ${p.uom}` : "";
      return `${value}${uom}`;
    })
    .filter(Boolean)
    .join(" · ");

  const hasMultipleVariants = instance.variants.length > 1;

  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header — instance-level controls (label, swap active variant's
       *  assembly type, duplicate the whole card, remove the card). */}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label={collapsed ? "Expand assembly" : "Collapse assembly"}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRightIcon className="h-4 w-4" />
          ) : (
            <ChevronDownIcon className="h-4 w-4" />
          )}
        </button>
        <input
          type="text"
          value={instance.instanceLabel}
          onChange={(e) => updateLabel(e.target.value)}
          placeholder="Phase label"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-sky-500 focus:outline-none"
        />
        {!collapsed ? (
          <select
            value={activeVariant.assemblyId}
            onChange={(e) => onSwap(e.target.value)}
            className="hidden rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-slate-600 hover:border-slate-300 focus:border-sky-500 focus:outline-none sm:block"
            title="Swap the active variant's assembly type — properties with matching names carry over."
          >
            {STUB_ASSEMBLIES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : null}
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          ${activeTotal.toFixed(2)}
        </span>
        <button
          onClick={onDuplicate}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-sky-700"
          aria-label="Duplicate this card"
          title="Duplicate the entire card (a separate sibling assembly — for compare options within the same assembly, use + Add variant below instead)"
        >
          <DocumentDuplicateIcon className="h-4 w-4" />
        </button>
        <button
          onClick={onRemove}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
          aria-label="Remove assembly"
          title="Remove assembly (and its derived line items)"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </header>

      {collapsed ? (
        propSummary ? (
          <div className="px-4 py-2 text-xs text-slate-500">
            {hasMultipleVariants ? (
              <span className="mr-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-800">
                {activeVariant.label}
              </span>
            ) : null}
            {propSummary}
          </div>
        ) : null
      ) : (
        <>
          {/* Variant chips — one per variant, plus an + Add chip. Active
           *  variant is sky-filled; inactive variants show the delta to
           *  active so the builder can read "Wood is +$2,400 vs Vinyl"
           *  at a glance. */}
          <div className="flex flex-wrap items-stretch gap-2 px-4 pt-3">
            {instance.variants.map((v) => (
              <VariantChip
                key={v.id}
                variant={v}
                isActive={v.id === instance.activeVariantId}
                total={variantTotals.get(v.id) ?? 0}
                activeTotal={activeTotal}
                onSelect={() => switchActive(v.id)}
                onRename={(label) => renameVariant(v.id, label)}
                onDelete={
                  hasMultipleVariants ? () => deleteVariant(v.id) : undefined
                }
              />
            ))}
            <AddVariantMenu
              presets={assembly.variantPresets ?? []}
              onCloneCurrent={addVariantFromClone}
              onPickPreset={addVariantFromPreset}
            />
          </div>

          {/* Active variant's property editors. Edits write back to
           *  the active variant only — inactive variants are untouched. */}
          <div className="flex gap-2 px-4 py-3">
            {assembly.properties.map((p) => (
              <PropertyEditor
                key={p.name}
                property={p}
                value={propertyMap[p.name] ?? 0}
                onChange={(v) => updateActiveProperty(p.name, v)}
              />
            ))}
          </div>

          <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            <span>
              Editing{" "}
              <strong className="text-slate-700">
                {activeVariant.label}
              </strong>
              {" — "}
              {computed?.lines.length ?? 0} material line
              {computed?.lines.length === 1 ? "" : "s"} regenerate on every edit
            </span>
            {computed?.error ? (
              <span className="text-rose-600">{computed.error}</span>
            ) : null}
          </footer>
        </>
      )}
    </article>
  );
}

/** One variant chip in the strip on an instance card. The active variant
 *  shows a filled sky pill; inactive variants outline with a "Δ vs
 *  active" indicator. Single-click selects; double-click renames inline;
 *  hover reveals a trash icon when more than one variant exists. */
/**
 * Popover menu opened by clicking the "+ Add variant" button. Surfaces
 * the assembly's curated presets (Wood Casement Premium, Standing-seam
 * metal, etc.) so the builder picks a common alternative in one click
 * instead of cloning + manually tweaking properties. "Clone current"
 * is always available as the bottom escape hatch.
 */
function AddVariantMenu({
  presets,
  onCloneCurrent,
  onPickPreset,
}: {
  presets: AssemblyVariantPreset[];
  onCloneCurrent: () => void;
  onPickPreset: (preset: AssemblyVariantPreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Click-outside + Escape to close. Keeps the menu feeling like a
  // proper popover instead of a sticky modal.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(action: () => void) {
    action();
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-sky-500 hover:bg-sky-50 hover:text-sky-700"
        title="Add a variant — pick a curated preset or clone the active configuration"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        Add variant
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {presets.length > 0 ? (
            <>
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Common alternatives
              </div>
              <ul className="max-h-64 overflow-auto py-1">
                {presets.map((p) => (
                  <li key={p.label}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => pick(() => onPickPreset(p))}
                      className="block w-full px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-sky-50 hover:text-sky-800"
                    >
                      <div className="font-medium">{p.label}</div>
                      {p.description ? (
                        <div className="text-[11px] text-slate-500">
                          {p.description}
                        </div>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-100" />
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(onCloneCurrent)}
            className="block w-full px-3 py-2 text-left text-xs italic text-slate-600 hover:bg-slate-50"
          >
            Clone current configuration
          </button>
        </div>
      ) : null}
    </div>
  );
}

function VariantChip({
  variant,
  isActive,
  total,
  activeTotal,
  onSelect,
  onRename,
  onDelete,
}: {
  variant: AssemblyVariant;
  isActive: boolean;
  total: number;
  activeTotal: number;
  onSelect: () => void;
  onRename: (label: string) => void;
  onDelete?: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(variant.label);
  // Mirror external label changes while not renaming.
  useEffect(() => {
    if (!renaming) setDraft(variant.label);
  }, [variant.label, renaming]);

  const delta = total - activeTotal;
  const deltaColor =
    delta < -0.005
      ? "text-emerald-700"
      : delta > 0.005
        ? "text-amber-700"
        : "text-slate-500";

  if (renaming) {
    return (
      <span className="inline-flex items-center rounded-lg border border-sky-500 bg-white px-2 py-1">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const clean = draft.trim() || variant.label;
            onRename(clean);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(variant.label);
              setRenaming(false);
            }
          }}
          className="w-24 bg-transparent text-xs font-semibold text-slate-900 focus:outline-none"
        />
      </span>
    );
  }

  return (
    <span
      className={
        "group relative inline-flex items-stretch overflow-hidden rounded-lg border transition-colors " +
        (isActive
          ? "border-sky-600 bg-sky-50 text-sky-900 ring-1 ring-sky-600"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50")
      }
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() => setRenaming(true)}
        className="flex flex-col items-start px-3 py-1.5 text-left"
        title={
          isActive
            ? `Active variant — drives totals. Double-click to rename.`
            : `Switch to ${variant.label} (double-click to rename)`
        }
      >
        <span className="flex items-center gap-1">
          <span
            className={
              "inline-block h-2 w-2 rounded-full " +
              (isActive ? "bg-sky-600" : "border border-slate-400 bg-white")
            }
            aria-hidden
          />
          <span className="text-xs font-semibold">{variant.label}</span>
        </span>
        <span className="mt-0.5 text-xs tabular-nums text-slate-900">
          ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          {!isActive && Math.abs(delta) >= 0.5 ? (
            <span className={`ml-1.5 ${deltaColor}`}>
              {delta > 0 ? "+" : "−"}$
              {Math.abs(delta).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </span>
          ) : null}
        </span>
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="flex w-6 items-center justify-center text-slate-400 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
          aria-label={`Delete variant ${variant.label}`}
          title={`Delete ${variant.label}`}
        >
          <XMarkIcon className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

function PropertyEditor({
  property,
  value,
  onChange,
}: {
  property: AssemblyProperty;
  value: number;
  onChange: (v: number) => void;
}) {
  // Stretch pill — each property pill takes flex-1 of the parent row
  // so they distribute across the full width of the card on one line.
  // The control in the middle is the only stretching part; the label
  // and UoM stay sized to their text.
  const isOption = property.kind === "option" && property.options;
  const isChoice = property.kind === "choice" && property.choices;
  return (
    <label className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-slate-300 bg-white text-sm focus-within:border-sky-500">
      <span className="flex shrink-0 items-center bg-slate-50 px-2 text-[11px] font-medium text-slate-600">
        {property.name}
      </span>
      {isOption ? (
        <select
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="min-w-0 flex-1 bg-white px-1.5 py-1 text-sm text-slate-900 focus:outline-none"
        >
          {property.options!.map((opt) => (
            <option key={opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : isChoice ? (
        <select
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="min-w-0 flex-1 bg-white px-1.5 py-1 text-sm text-slate-900 focus:outline-none"
        >
          {property.choices!.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <NumberInput
          value={value}
          onChange={onChange}
          className="min-w-0 flex-1 bg-white px-1.5 py-1 text-right text-sm tabular-nums text-slate-900 focus:outline-none"
        />
      )}
      {property.uom ? (
        <span className="flex shrink-0 items-center bg-slate-50 px-2 text-[11px] font-medium text-slate-500">
          {property.uom}
        </span>
      ) : null}
    </label>
  );
}
