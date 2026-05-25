"use client";

import { useMemo, useState } from "react";
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
import type {
  Assembly,
  AssemblyInstance,
  AssemblyProperty,
} from "@/types/assembly";

/** Roll up an instance to a single dollar total via the shared compute. */
function instanceTotal(instance: AssemblyInstance): number {
  const assembly = findStubAssembly(instance.assemblyId);
  if (!assembly) return 0;
  const propertyMap = Object.fromEntries(
    instance.propertyValues.map((p) => [p.name, p.value]),
  );
  return computeMaterials(assembly, propertyMap).total;
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

/** Subtle pastel tints for each trade so adjacent groups visually
 *  separate at a glance. Kept very light so they don't fight with
 *  the white cards inside. */
const TRADE_ACCENTS: Record<
  Assembly["trade"],
  { bg: string; bar: string }
> = {
  foundation: { bg: "bg-stone-50", bar: "bg-stone-400" },
  framing: { bg: "bg-amber-50", bar: "bg-amber-500" },
  roofing: { bg: "bg-slate-50", bar: "bg-slate-500" },
  exterior: { bg: "bg-sky-50", bar: "bg-sky-500" },
  drywall: { bg: "bg-zinc-50", bar: "bg-zinc-400" },
  flooring: { bg: "bg-orange-50", bar: "bg-orange-400" },
  millwork: { bg: "bg-yellow-50", bar: "bg-yellow-500" },
  finishes: { bg: "bg-emerald-50", bar: "bg-emerald-500" },
  other: { bg: "bg-slate-50", bar: "bg-slate-400" },
};

interface TradeBucket {
  trade: Assembly["trade"];
  label: string;
  items: AssemblyInstance[];
}

function groupByTrade(instances: AssemblyInstance[]): TradeBucket[] {
  const map = new Map<Assembly["trade"], AssemblyInstance[]>();
  for (const inst of instances) {
    const a = findStubAssembly(inst.assemblyId);
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
      {groupByTrade(instances).map((group) => (
        <TradeGroup
          key={group.trade}
          group={group}
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
  totalInstances,
  onChange,
  onRemove,
  onSwap,
  onDuplicate,
}: {
  group: TradeBucket;
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
  const accent = TRADE_ACCENTS[group.trade];
  return (
    <div
      className={`overflow-hidden rounded-xl border border-slate-200 shadow-sm ${accent.bg}`}
    >
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
            Walk a client through trade-offs at the kitchen table — vinyl
            vs wood windows, 16&quot; vs 24&quot; stud spacing, etc.
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>
              <strong>Add an assembly</strong> (e.g. Window Unit) and set
              its properties as you&apos;d normally quote it — say Vinyl
              frame, double-hung.
            </li>
            <li>
              <strong>Click the duplicate icon</strong> (the
              two-overlapping-squares icon) on that assembly&apos;s card.
              A copy appears below it.
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
              <strong>Read the Difference</strong> tile — green means
              Option B is cheaper than A, amber means more expensive.
              Tweak either side&apos;s properties live; the delta updates
              in real time both here and in this collapsed header.
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
  const assembly: Assembly | null = useMemo(
    () => findStubAssembly(instance.assemblyId),
    [instance.assemblyId],
  );

  const propertyMap = useMemo(
    () =>
      Object.fromEntries(
        instance.propertyValues.map((p) => [p.name, p.value]),
      ),
    [instance.propertyValues],
  );

  const computed = useMemo(
    () => (assembly ? computeMaterials(assembly, propertyMap) : null),
    [assembly, propertyMap],
  );

  function updateLabel(label: string) {
    onChange({ ...instance, instanceLabel: label });
  }

  function updateProperty(name: string, value: number) {
    onChange({
      ...instance,
      propertyValues: instance.propertyValues.map((p) =>
        p.name === name ? { ...p, value } : p,
      ),
    });
  }

  if (!assembly) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Assembly definition for{" "}
        <span className="font-mono">{instance.assemblyId}</span> was not
        found. It may have been removed from the catalog.{" "}
        <button
          onClick={onRemove}
          className="font-semibold underline hover:no-underline"
        >
          Remove from quote
        </button>
      </div>
    );
  }

  // Compact property summary shown in the collapsed-card header — gives
  // the GC enough info to recognize the assembly without expanding it.
  // Skips long string options ("Vinyl") and zero/empty values, joins with
  // dots so the line stays short.
  const propSummary = instance.propertyValues
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

  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
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
            value={instance.assemblyId}
            onChange={(e) => onSwap(e.target.value)}
            className="hidden rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-slate-600 hover:border-slate-300 focus:border-sky-500 focus:outline-none sm:block"
            title="Swap to a different assembly — properties with matching names carry over."
          >
            {STUB_ASSEMBLIES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : null}
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          ${computed ? computed.total.toFixed(2) : "—"}
        </span>
        <button
          onClick={onDuplicate}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-sky-700"
          aria-label="Duplicate assembly"
          title="Duplicate this assembly to compare a what-if side by side"
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
        // Collapsed: one-line property summary so the GC can see what
        // configuration this instance is at without expanding.
        propSummary ? (
          <div className="px-4 py-2 text-xs text-slate-500">{propSummary}</div>
        ) : null
      ) : (
        <>
          {/* Property inputs — inline pills wrap as needed. Each pill is
           *  "Label [input] UoM" on one line, much narrower per property
           *  than the previous stacked grid. Three properties usually
           *  fit on one row of a half-width card. */}
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {assembly.properties.map((p) => (
              <PropertyEditor
                key={p.name}
                property={p}
                value={propertyMap[p.name] ?? 0}
                onChange={(v) => updateProperty(p.name, v)}
              />
            ))}
          </div>

          {/* Footer summary */}
          <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
            <span>
              {computed?.lines.length ?? 0} material line
              {computed?.lines.length === 1 ? "" : "s"} regenerated on every edit
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

function PropertyEditor({
  property,
  value,
  onChange,
}: {
  property: AssemblyProperty;
  value: number;
  onChange: (v: number) => void;
}) {
  // Inline pill — label, control, and UoM all on one line. Width is
  // determined by content so each property takes only the room it
  // actually needs (a short "16 IN" stays narrow; a long "Vinyl"
  // option fits its widest choice). Card lays them out via flex-wrap.
  const isOption = property.kind === "option" && property.options;
  const isChoice = property.kind === "choice" && property.choices;
  return (
    <label className="inline-flex items-stretch overflow-hidden rounded-md border border-slate-300 bg-white text-sm focus-within:border-sky-500">
      <span className="flex items-center bg-slate-50 px-2 text-[11px] font-medium text-slate-600">
        {property.name}
      </span>
      {isOption ? (
        <select
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="bg-white px-1.5 py-1 text-sm text-slate-900 focus:outline-none"
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
          className="bg-white px-1.5 py-1 text-sm text-slate-900 focus:outline-none"
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
          className="w-16 bg-white px-1.5 py-1 text-right text-sm tabular-nums text-slate-900 focus:outline-none"
        />
      )}
      {property.uom ? (
        <span className="flex items-center bg-slate-50 px-2 text-[11px] font-medium text-slate-500">
          {property.uom}
        </span>
      ) : null}
    </label>
  );
}
