"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PrinterIcon,
  QuestionMarkCircleIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import Tooltip from "@/components/tooltip";
import AddAssemblyModal, {
  type AddAssemblyResult,
} from "@/components/add-assembly-modal";
import AssemblyInstancesPanel from "@/components/assembly-instances-panel";
import NumberInput from "@/components/number-input";
import SoftCostsPanel, {
  computeSoftCosts,
} from "@/components/soft-costs-panel";
import { findStubAssembly } from "@/lib/assemblies/stub-catalog";
import { computeMaterials, resolveOverrides } from "@/lib/assemblies/compute";
import {
  activeVariantOf,
  findCountProperty,
  migrateInstance,
  type AssemblyInstance,
  type AssemblyVariant,
} from "@/types/assembly";
import { useAuth } from "@/lib/auth-context";
import {
  getDeal,
  getSettings,
  listAttachments,
  listQuoteLines,
  saveDeal,
  saveQuoteLines,
  newId,
} from "@/lib/store";
import { Deal, QuoteLine, OrgSettings, QuoteScenario, SoftCosts, PriceSource } from "@/types";
import ScenariosBar from "@/components/scenarios-bar";
import PlanExtractor, { type PlanExtraction } from "@/components/plan-extractor";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface ParsedAttCache {
  attachment_id: string;
  attachment_name: string;
  bom: Array<{
    item_number: string;
    description: string;
    part_number: string;
    qty: number;
    unit_price: number;
    extended_price: number;
  }>;
}

export default function DealQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [savedLinesSnapshot, setSavedLinesSnapshot] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [parsedDistributorBoms, setParsedDistributorBoms] = useState<ParsedAttCache[]>([]);
  const [showAssemblyModal, setShowAssemblyModal] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Client-presentation mode — hides cost columns + margin from the
  // screen so the builder can turn the laptop / phone toward the
  // homeowner without exposing internals. Session-only, defaults off.
  const [clientMode, setClientMode] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  // Toast queue for destructive-action undo. Each toast carries the
  // restore closure that the Undo button calls; toasts auto-dismiss
  // after 7s. Capturing the state BEFORE the destructive write is what
  // makes undo work without persisted history.
  const [toasts, setToasts] = useState<
    Array<{ id: string; message: string; undo: () => void }>
  >([]);
  function showUndoToast(message: string, undo: () => void) {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, undo }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 7000);
  }
  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }
  const [assemblyInstances, setAssemblyInstances] = useState<
    AssemblyInstance[]
  >([]);
  const [savedInstancesSnapshot, setSavedInstancesSnapshot] = useState<string>(
    "",
  );
  const [savedSoftCostsSnapshot, setSavedSoftCostsSnapshot] =
    useState<string>("");
  const [scenarios, setScenarios] = useState<QuoteScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!profile) return;
    let active = true;
    async function load() {
      const d = await getDeal(id);
      if (!active) return;
      if (!d || d.org_ref !== profile!.org_ref) {
        router.replace("/deals");
        return;
      }
      const [theLines, theSettings, attachments] = await Promise.all([
        listQuoteLines(id),
        getSettings(profile!.org_ref),
        listAttachments(id),
      ]);
      if (!active) return;
      setDeal(d);
      setLines(theLines);
      setSavedLinesSnapshot(JSON.stringify(theLines));
      // Migrate any legacy single-property-bag instances into the new
      // variants schema on load so the rest of this page only ever
      // touches the new shape.
      const instances = (d.assembly_instances ?? []).map(migrateInstance);
      setAssemblyInstances(instances);
      setSavedInstancesSnapshot(JSON.stringify(instances));
      setSavedSoftCostsSnapshot(JSON.stringify(d.soft_costs ?? null));
      setScenarios(d.scenarios ?? []);
      setActiveScenarioId(d.active_scenario_id);
      setSettings(theSettings);
      // Pull parsed BOM cache from sessionStorage (set by the deal detail
      // page when a PDF was uploaded + parsed). Filter to attachments that
      // are still present in this deal so stale cache doesn't show up.
      try {
        const cached = sessionStorage.getItem(`parsed:${id}`);
        if (cached) {
          const parsed = JSON.parse(cached) as Record<string, { bom: ParsedAttCache["bom"] }>;
          const attMap = new Map(attachments.map((a) => [a.id, a]));
          const list: ParsedAttCache[] = [];
          for (const [attId, p] of Object.entries(parsed)) {
            const att = attMap.get(attId);
            if (att && (att.category === "distributor_quote" || att.category === "customer_quote")) {
              list.push({ attachment_id: attId, attachment_name: att.name, bom: p.bom });
            }
          }
          setParsedDistributorBoms(list);
        }
      } catch {
        // ignore — cache is best-effort
      }
      setLoaded(true);
    }
    void load();
    return () => { active = false; };
  }, [id, router, profile]);

  const totals = useMemo(() => {
    const customer = lines.reduce((s, l) => s + (l.customer_extended || 0), 0);
    const cost = lines.reduce((s, l) => s + (l.cost_extended || 0), 0);
    const margin = customer > 0 ? ((customer - cost) / customer) * 100 : 0;
    // Soft-cost layer rolls up tax + contingency + GC on top of the
    // line-item subtotal. Grand total drives the deal's total_quote_value
    // on save so the proposal + budget panel + pipeline all show the
    // number the client actually owes.
    const soft = computeSoftCosts(cost, customer, deal?.soft_costs);
    return {
      customer,
      cost,
      margin,
      soft,
      grandTotal: soft.grandTotal,
    };
  }, [lines, deal?.soft_costs]);

  function updateSoftCosts(next: Deal["soft_costs"]) {
    if (!deal) return;
    setDeal({ ...deal, soft_costs: next, updated_at: new Date().toISOString() });
  }

  const dirty =
    JSON.stringify(lines) !== savedLinesSnapshot ||
    JSON.stringify(assemblyInstances) !== savedInstancesSnapshot ||
    JSON.stringify(deal?.soft_costs ?? null) !== savedSoftCostsSnapshot;

  function recomputeLine(line: QuoteLine): QuoteLine {
    // Builder pricing model: the user types their cost directly into the
    // 'Unit Cost' column (stored as list_price). discount_percent is
    // always 0 for builder workflows, so cost_unit == list_price ==
    // typed cost. customer_unit = cost × (1 + markup%). list_price /
    // discount_percent field names are vestigial VAR schema; the UI
    // never exposes a discount input to builders.
    const cost_unit = line.list_price * (1 - (line.discount_percent || 0) / 100);
    const customer_unit = cost_unit * (1 + (line.markup_percent || 0) / 100);
    const cost_extended = cost_unit * (line.qty || 0);
    const customer_extended = customer_unit * (line.qty || 0);
    const margin = customer_extended > 0
      ? ((customer_extended - cost_extended) / customer_extended) * 100
      : 0;
    return {
      ...line,
      cost_unit_price: round(cost_unit, 4),
      customer_unit_price: round(customer_unit, 4),
      cost_extended: round(cost_extended, 2),
      customer_extended: round(customer_extended, 2),
      margin_percent: round(margin, 2),
    };
  }

  function updateLine(idx: number, patch: Partial<QuoteLine>) {
    setLines((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch };
      // If the builder typed over a price field (cost or markup), the
      // line is no longer a passive catalog/market/bid value — they've
      // taken intentional ownership. Flip the provenance tag to
      // "manual" so the pill reflects that. Catalog-regenerated lines
      // get their tag re-set when the assembly is edited (see
      // updateInstance flow), so this only sticks for manual hand-tweaks.
      const touchedPrice =
        patch.list_price !== undefined ||
        patch.markup_percent !== undefined ||
        patch.cost_unit_price !== undefined ||
        patch.customer_unit_price !== undefined;
      if (touchedPrice && patch.price_source === undefined) {
        merged.price_source = "manual";
      }
      next[idx] = recomputeLine(merged);
      return next;
    });
  }

  function addBlankLine() {
    const next: QuoteLine = recomputeLine({
      id: newId("ql"),
      line_number: lines.length + 1,
      product_code: "",
      description: "",
      // Builder pricing model: the GC types their cost directly into the
      // Unit Cost column (stored as list_price). discount_percent stays
      // at 0 so cost_unit == list_price == what they typed. The
      // default_blanket_discount_percent setting is VAR-era (federal IT
      // resellers buy at a list/discount); ignored here.
      manufacturer: "",
      is_service: false,
      qty: 1,
      list_price: 0,
      discount_percent: 0,
      customer_unit_price: 0,
      customer_extended: 0,
      markup_percent: settings?.default_markup_percent ?? 20,
      cost_unit_price: 0,
      cost_extended: 0,
      margin_percent: 0,
      subscription_term_months: 0,
      notes: "",
      // Builder typed this line in directly — flag as "manual" so the
      // provenance pill in the table reads correctly.
      price_source: "manual",
    });
    setLines((prev) => [...prev, next]);
  }

  function removeLine(idx: number) {
    // Capture the line + its position before the destructive write so
    // Undo can splice it back exactly where it was.
    const removed = lines[idx];
    if (!removed) return;
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((l, i) => ({ ...l, line_number: i + 1 }));
    });
    showUndoToast("Line removed", () => {
      setLines((prev) => {
        const restored = [...prev];
        restored.splice(Math.min(idx, restored.length), 0, removed);
        return restored.map((l, i) => ({ ...l, line_number: i + 1 }));
      });
    });
  }

  function importFromBom(bom: ParsedAttCache) {
    const markup = settings?.default_markup_percent ?? 20;
    const newLines: QuoteLine[] = bom.bom.map((b, i) =>
      recomputeLine({
        id: newId("ql"),
        line_number: lines.length + i + 1,
        product_code: b.part_number,
        description: b.description,
        // Builder pricing: imported BOM unit_price is treated as the cost
        // the GC pays directly (sub bid or supplier line). No blanket
        // discount applied — the math runs as cost × (1 + markup).
        manufacturer: "",
        is_service: false,
        qty: b.qty,
        list_price: b.unit_price,
        discount_percent: 0,
        markup_percent: markup,
        customer_unit_price: 0,
        customer_extended: 0,
        cost_unit_price: 0,
        cost_extended: 0,
        margin_percent: 0,
        subscription_term_months: 0,
        notes: "",
      }),
    );
    setLines((prev) => [...prev, ...newLines]);
  }

  function makeInstanceLine(
    instance: AssemblyInstance,
    material: {
      name: string;
      uom: string;
      quantity: number;
      unitCostUsd: number;
      laborCostUsd: number;
    },
    lineNumber: number,
    markup: number,
  ): QuoteLine {
    return recomputeLine({
      id: newId("ql"),
      line_number: lineNumber,
      // product_code is the builder UI's "Phase" column. Every line
      // from one assembly instance shares the same label so it groups
      // cleanly into milestones / draws downstream.
      product_code: instance.instanceLabel,
      description: `${material.name} (from ${activeVariantOf(instance).label})`,
      // The link to the persistent instance — editing the instance
      // regenerates every line carrying this id.
      instance_id: instance.id,
      manufacturer: "",
      is_service: false,
      qty: material.quantity,
      // Builder pricing is single-cost-per-line; material + labor are
      // bundled into list_price and markup is applied on top.
      list_price: material.unitCostUsd + material.laborCostUsd,
      discount_percent: 0,
      markup_percent: markup,
      customer_unit_price: 0,
      customer_extended: 0,
      cost_unit_price: 0,
      cost_extended: 0,
      margin_percent: 0,
      subscription_term_months: 0,
      notes: "",
      // Cost came from the stock assembly catalog (stub prices today;
      // becomes "market" once 1build is wired). Builder can still
      // override per-line — that flip is handled by the table edit
      // handler downstream.
      price_source: "catalog",
    });
  }

  /** Derive a fresh QuoteLine block from the instance's ACTIVE variant.
   *  Inactive variants are reference state and never contribute to the
   *  project's line items — switching active causes a full regeneration. */
  function instanceToQuoteLines(
    instance: AssemblyInstance,
    startingLineNumber: number,
  ): QuoteLine[] {
    const variant = activeVariantOf(instance);
    const assembly = findStubAssembly(variant.assemblyId);
    if (!assembly) return [];
    const propertyValues = Object.fromEntries(
      variant.propertyValues.map((p) => [p.name, p.value]),
    );
    const overrides = resolveOverrides(
      settings?.cost_overrides,
      assembly.id,
    );
    const result = computeMaterials(assembly, propertyValues, overrides);
    const markup = settings?.default_markup_percent ?? 20;
    return result.lines.map((m, i) =>
      makeInstanceLine(instance, m, startingLineNumber + i, markup),
    );
  }

  function importFromAssembly(result: AddAssemblyResult) {
    const { instance, materials } = result;
    const markup = settings?.default_markup_percent ?? 20;
    const newLines: QuoteLine[] = materials.map((m, i) =>
      makeInstanceLine(instance, m, lines.length + i + 1, markup),
    );
    setLines((prev) => [...prev, ...newLines]);
    setAssemblyInstances((prev) => [...prev, instance]);
    setShowAssemblyModal(false);
  }

  /** Live-edit handler from the AssemblyInstancesPanel. */
  function updateInstance(next: AssemblyInstance) {
    setAssemblyInstances((prev) =>
      prev.map((i) => (i.id === next.id ? next : i)),
    );
    setLines((prev) => {
      const firstIdx = prev.findIndex((l) => l.instance_id === next.id);
      const derived = instanceToQuoteLines(next, 0);
      let combined: QuoteLine[];
      if (firstIdx === -1) {
        combined = [...prev, ...derived];
      } else {
        // Splice the new block in where the first old line was; drop
        // any subsequent lines tagged with this instance id.
        const before = prev.slice(0, firstIdx);
        const after = prev
          .slice(firstIdx)
          .filter((l) => l.instance_id !== next.id);
        combined = [...before, ...derived, ...after];
      }
      return combined.map((l, i) => ({ ...l, line_number: i + 1 }));
    });
  }

  function removeInstance(instanceId: string) {
    // Capture instance + its derived lines + position before the write
    // so Undo can fully restore both the panel card and the line block.
    const instanceIdx = assemblyInstances.findIndex((i) => i.id === instanceId);
    const removedInstance = assemblyInstances[instanceIdx];
    const removedLines = lines.filter((l) => l.instance_id === instanceId);
    if (!removedInstance) return;

    setAssemblyInstances((prev) => prev.filter((i) => i.id !== instanceId));
    setLines((prev) =>
      prev
        .filter((l) => l.instance_id !== instanceId)
        .map((l, i) => ({ ...l, line_number: i + 1 })),
    );

    const n = removedLines.length;
    showUndoToast(
      `Assembly removed${n > 0 ? ` (${n} line${n === 1 ? "" : "s"})` : ""}`,
      () => {
        setAssemblyInstances((prev) => {
          const next = [...prev];
          next.splice(Math.min(instanceIdx, next.length), 0, removedInstance);
          return next;
        });
        setLines((prev) =>
          [...prev, ...removedLines].map((l, i) => ({
            ...l,
            line_number: i + 1,
          })),
        );
      },
    );
  }

  /**
   * Split one unit off an assembly with a count property — for the
   * "5 doors but the client wants one upgraded" case. Decrements the
   * count on the source by 1, creates a new sibling instance with qty=1
   * (and the same property values, so the GC starts from the same spec
   * and just changes the one thing they need). The new card is inserted
   * right after the source so it's adjacent in the UI.
   */
  function splitInstance(instanceId: string) {
    const sourceIdx = assemblyInstances.findIndex((i) => i.id === instanceId);
    if (sourceIdx < 0) return;
    const source = assemblyInstances[sourceIdx];
    const sourceActive = activeVariantOf(source);
    const assembly = findStubAssembly(sourceActive.assemblyId);
    if (!assembly) return;
    const countProp = findCountProperty(assembly);
    if (!countProp) return;
    const currentCount =
      sourceActive.propertyValues.find((p) => p.name === countProp.name)
        ?.value ?? 0;
    if (currentCount <= 1) return;

    const now = Date.now().toString(36);
    const newVariantId = `var_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const newInstanceId = `inst_${now}_${Math.random().toString(36).slice(2, 8)}`;

    // Decrement source: count → count - 1.
    const decrementedSource: AssemblyInstance = {
      ...source,
      variants: source.variants.map((v) =>
        v.id === sourceActive.id
          ? {
              ...v,
              propertyValues: v.propertyValues.map((p) =>
                p.name === countProp.name ? { ...p, value: currentCount - 1 } : p,
              ),
            }
          : v,
      ),
    };

    // Sibling: clone of the source's active variant with count = 1.
    // Single variant on the new instance — variants on the source
    // (alt material options, etc.) don't carry over; the GC will pick
    // their custom spec from scratch.
    const siblingVariant: AssemblyVariant = {
      id: newVariantId,
      label: sourceActive.label,
      assemblyId: sourceActive.assemblyId,
      propertyValues: sourceActive.propertyValues.map((p) =>
        p.name === countProp.name ? { ...p, value: 1 } : p,
      ),
    };
    const sibling: AssemblyInstance = {
      id: newInstanceId,
      instanceLabel: `${source.instanceLabel} (custom)`,
      variants: [siblingVariant],
      activeVariantId: newVariantId,
    };

    // Insert sibling after source. Build the next array, then push lines
    // through updateInstance for each so derived QuoteLines stay in sync.
    const nextInstances = [...assemblyInstances];
    nextInstances[sourceIdx] = decrementedSource;
    nextInstances.splice(sourceIdx + 1, 0, sibling);
    setAssemblyInstances(nextInstances);

    // Regenerate lines for both: drop any tied to either id, then append
    // the freshly-derived sets. Simpler than per-instance splice tracking
    // when two instances change in one pass.
    setLines((prev) => {
      const filtered = prev.filter(
        (l) =>
          l.instance_id !== decrementedSource.id &&
          l.instance_id !== sibling.id,
      );
      const derivedSource = instanceToQuoteLines(decrementedSource, 0);
      const derivedSibling = instanceToQuoteLines(sibling, 0);
      return [...filtered, ...derivedSource, ...derivedSibling].map((l, i) => ({
        ...l,
        line_number: i + 1,
      }));
    });
  }

  // ── Named scenarios (Standard / Premium / Budget) ────────────────
  // Each scenario is a snapshot of (assembly_instances, quote_lines,
  // soft_costs). Switching loads the snapshot back into the working
  // state; editing while a scenario is active marks it unsaved and
  // the GC clicks "Update {name}" to sync edits back into the record.

  /** Whether the current working state differs from the active
   *  scenario's snapshot. Drives the unsaved-changes pill + the
   *  "Update {name}" button visibility. */
  const hasUnsavedScenarioChanges = useMemo(() => {
    if (!activeScenarioId) return false;
    const active = scenarios.find((s) => s.id === activeScenarioId);
    if (!active) return false;
    return (
      JSON.stringify(active.assembly_instances) !==
        JSON.stringify(assemblyInstances) ||
      JSON.stringify(active.quote_lines) !== JSON.stringify(lines) ||
      JSON.stringify(active.soft_costs ?? null) !==
        JSON.stringify(deal?.soft_costs ?? null)
    );
  }, [
    activeScenarioId,
    scenarios,
    assemblyInstances,
    lines,
    deal?.soft_costs,
  ]);

  /** Snapshot the current working state into a QuoteScenario shape.
   *  Used by saveAsNewScenario + updateActiveScenario. */
  function snapshotCurrentState(
    id: string,
    name: string,
    createdAt: string,
  ): QuoteScenario {
    return {
      id,
      name,
      assembly_instances: assemblyInstances,
      quote_lines: lines,
      ...(deal?.soft_costs ? { soft_costs: deal.soft_costs } : {}),
      total_quote_value: totals.grandTotal,
      total_cost: totals.cost,
      margin_percent: totals.margin,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
    };
  }

  async function saveAsNewScenario(name: string) {
    if (!deal) return;
    const now = new Date().toISOString();
    const sid = `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const snapshot = snapshotCurrentState(sid, name, now);
    const nextScenarios = [...scenarios, snapshot];
    setScenarios(nextScenarios);
    setActiveScenarioId(sid);
    // Persist immediately so the GC doesn't lose the named save if
    // they navigate away before hitting the main Save button.
    const updatedDeal: Deal = {
      ...deal,
      scenarios: nextScenarios,
      active_scenario_id: sid,
      updated_at: now,
    };
    await saveDeal(updatedDeal);
    setDeal(updatedDeal);
  }

  async function updateActiveScenario() {
    if (!deal || !activeScenarioId) return;
    const existing = scenarios.find((s) => s.id === activeScenarioId);
    if (!existing) return;
    const refreshed = snapshotCurrentState(
      existing.id,
      existing.name,
      existing.created_at,
    );
    const nextScenarios = scenarios.map((s) =>
      s.id === activeScenarioId ? refreshed : s,
    );
    setScenarios(nextScenarios);
    const updatedDeal: Deal = {
      ...deal,
      scenarios: nextScenarios,
      updated_at: new Date().toISOString(),
    };
    await saveDeal(updatedDeal);
    setDeal(updatedDeal);
  }

  async function switchScenario(scenarioId: string) {
    if (!deal) return;
    const target = scenarios.find((s) => s.id === scenarioId);
    if (!target) return;
    if (hasUnsavedScenarioChanges) {
      if (
        !confirm(
          `Switch to "${target.name}"? You have unsaved changes in the current scenario — they'll be lost unless you cancel and click Update first.`,
        )
      ) {
        return;
      }
    }
    // Replace working state with the target scenario's snapshot.
    setAssemblyInstances(target.assembly_instances);
    setLines(target.quote_lines);
    // Push soft_costs onto the deal so SoftCostsPanel re-renders.
    const nextSoftCosts: SoftCosts | undefined = target.soft_costs;
    setActiveScenarioId(scenarioId);
    const updatedDeal: Deal = {
      ...deal,
      soft_costs: nextSoftCosts,
      active_scenario_id: scenarioId,
      updated_at: new Date().toISOString(),
    };
    setDeal(updatedDeal);
    // Persist immediately so the active flip + soft costs survive
    // navigation. Lines + instances persist on the next Save.
    await saveDeal(updatedDeal);
  }

  async function renameScenario(scenarioId: string, name: string) {
    if (!deal) return;
    const nextScenarios = scenarios.map((s) =>
      s.id === scenarioId
        ? { ...s, name, updated_at: new Date().toISOString() }
        : s,
    );
    setScenarios(nextScenarios);
    const updatedDeal: Deal = {
      ...deal,
      scenarios: nextScenarios,
      updated_at: new Date().toISOString(),
    };
    await saveDeal(updatedDeal);
    setDeal(updatedDeal);
  }

  async function deleteScenario(scenarioId: string) {
    if (!deal) return;
    const nextScenarios = scenarios.filter((s) => s.id !== scenarioId);
    const nextActive =
      activeScenarioId === scenarioId ? undefined : activeScenarioId;
    setScenarios(nextScenarios);
    setActiveScenarioId(nextActive);
    const updatedDeal: Deal = {
      ...deal,
      scenarios: nextScenarios,
      active_scenario_id: nextActive,
      updated_at: new Date().toISOString(),
    };
    await saveDeal(updatedDeal);
    setDeal(updatedDeal);
  }

  async function onSave() {
    if (!profile || !deal) return;
    setSaving(true);
    setSaveProgress(0);
    // Eased progress simulation matching the apply / extract UX — saves
    // take 1-3 seconds in practice, so the progress bar gives the user
    // something to watch instead of a flat "Saving…" label.
    const start = performance.now();
    const targetMs = 1500;
    const tick = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / targetMs);
      const eased = 1 - Math.pow(1 - t, 2.2);
      setSaveProgress(Math.min(95, eased * 95));
    }, 60);
    try {
      const renumbered = lines.map((l, i) => ({ ...l, line_number: i + 1 }));
      await saveQuoteLines(id, profile.org_ref, renumbered);
      // Update deal totals so the kanban + deal detail reflect the latest
      // quote roll-up. This is a separate write — race-safe since deal docs
      // and quote lines are independent.
      // If a scenario is active, sync this save into its snapshot so
      // hasUnsavedScenarioChanges goes false. Otherwise persist the
      // scenarios list as-is.
      const syncedScenarios = activeScenarioId
        ? scenarios.map((s) =>
            s.id === activeScenarioId
              ? snapshotCurrentState(s.id, s.name, s.created_at)
              : s,
          )
        : scenarios;

      const updatedDeal: Deal = {
        ...deal,
        // total_quote_value reflects the GRAND total (with soft costs)
        // — that's what the client owes, what shows on the proposal,
        // what feeds the budget panel + pipeline cards.
        total_quote_value: totals.grandTotal,
        total_cost: totals.cost,
        margin_percent: totals.margin,
        assembly_instances: assemblyInstances,
        soft_costs: deal.soft_costs,
        scenarios: syncedScenarios,
        active_scenario_id: activeScenarioId,
        updated_at: new Date().toISOString(),
      };
      await saveDeal(updatedDeal);
      setDeal(updatedDeal);
      setScenarios(syncedScenarios);
      setLines(renumbered);
      setSavedLinesSnapshot(JSON.stringify(renumbered));
      setSavedInstancesSnapshot(JSON.stringify(assemblyInstances));
      setSavedSoftCostsSnapshot(JSON.stringify(deal.soft_costs ?? null));
      setSaveProgress(100);
      // Hold at 100% briefly so the user sees completion before the
      // "Saved" pill swaps in.
      await new Promise((r) => setTimeout(r, 250));
    } finally {
      clearInterval(tick);
      setSaving(false);
    }
  }

  if (!loaded || !deal) {
    return (
      <AppShell>
        <div className="text-sm text-slate-500">Loading…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Link
            href={`/deals/${id}`}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            {deal.name}
          </Link>
        </div>

        {/* Plan extractor — also lives on the project Overview. Shown
         *  here so a builder can stay in the quote editor and re-apply
         *  / swap the AI extraction without navigating back. Defaults
         *  collapsed to a compact summary when an extraction already
         *  exists, full-width dropzone when starting fresh. */}
        <PlanExtractor
          dealId={id}
          orgRef={deal.org_ref}
          initialExtraction={
            deal.floor_plan_extraction as unknown as PlanExtraction | undefined
          }
          initialResolvedFlags={deal.resolved_ambiguity_indices}
          onApplied={async () => {
            // Plan apply ran in-place — re-fetch lines, deal record,
            // AND assembly instances so the editor doesn't sit on
            // stale state while the new data lives in Firestore.
            // The assembly panel reads its own assemblyInstances state
            // (initialized once on mount), so refreshing the deal alone
            // wouldn't surface the new instances — we have to push
            // them into the panel's state explicitly.
            const [freshLines, freshDeal] = await Promise.all([
              listQuoteLines(id),
              getDeal(id),
            ]);
            setLines(freshLines);
            if (freshDeal) {
              setDeal(freshDeal);
              const freshInstances = (freshDeal.assembly_instances ?? []).map(
                migrateInstance,
              );
              setAssemblyInstances(freshInstances);
              setSavedInstancesSnapshot(JSON.stringify(freshInstances));
              setSavedLinesSnapshot(JSON.stringify(freshLines));
            }
          }}
        />

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                <span className="md:hidden">Estimate</span>
                <span className="hidden md:inline">Project Estimate</span>
              </h1>
              <button
                type="button"
                onClick={() => setHelpOpen((v) => !v)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-sky-700"
                aria-expanded={helpOpen}
                aria-label={helpOpen ? "Close help" : "Open help"}
                title="How this page works"
              >
                <QuestionMarkCircleIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Client-presentation toggle — hides cost columns + margin
             *  so the screen is safe to turn toward the homeowner. */}
            <Tooltip
              label={
                clientMode
                  ? "Showing client-safe view: costs and margin are hidden. Tap to show your internals again."
                  : "Hide your costs and margin so you can turn the screen toward the client."
              }
            >
              <button
                type="button"
                onClick={() => setClientMode((v) => !v)}
                aria-pressed={clientMode}
                aria-label={
                  clientMode ? "Show internals" : "Hide internals (client view)"
                }
                className={
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-2 text-sm font-medium sm:px-3 " +
                  (clientMode
                    ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
                }
              >
                {clientMode ? (
                  <EyeSlashIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {clientMode ? "Client view" : "Client view"}
                </span>
              </button>
            </Tooltip>
            {/* Export CSV + Generate proposal — desktop-only actions.
             *  Kitchen-table flow on mobile doesn't need them; keep Save
             *  as the primary action and everything else accessible from
             *  desktop. */}
            {!dirty && !saving && lines.length > 0 && (
              <>
                <Tooltip label="Download these line items as CSV. Opens in Excel / Numbers / Google Sheets, or imports into QuickBooks via Bulk Add.">
                  <button
                    type="button"
                    onClick={() => exportLinesCsv(deal, lines)}
                    className="hidden items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 md:inline-flex"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    Export CSV
                  </button>
                </Tooltip>
                <Tooltip
                  variant="directive"
                  label="Build the client-facing proposal document from these line items. The client never sees your costs or margin — just the bottom-line scope + total."
                >
                  <Link
                    href={`/deals/${id}/proposal`}
                    className="hidden items-center gap-1.5 rounded-md border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50 md:inline-flex"
                  >
                    <PaperAirplaneIcon className="h-4 w-4" />
                    Generate proposal
                  </Link>
                </Tooltip>
              </>
            )}
            {!dirty && !saving ? (
              // Resting state: button area shows a green "Saved" pill so the
              // user knows their work is persisted (rather than seeing a
              // disabled grey button).
              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 sm:px-5">
                <CheckIcon className="h-4 w-4" />
                Saved
              </span>
            ) : (
              <SaveButton
                onClick={onSave}
                saving={saving}
                progress={saveProgress}
              />
            )}
          </div>
        </div>

        {helpOpen ? (
          <HelpPanel onClose={() => setHelpOpen(false)} />
        ) : null}

        {parsedDistributorBoms.length > 0 && (
          <ImportBanner
            boms={parsedDistributorBoms}
            onImport={importFromBom}
          />
        )}

        <ScenariosBar
          scenarios={scenarios}
          activeScenarioId={activeScenarioId}
          hasUnsavedChanges={hasUnsavedScenarioChanges}
          onSaveAsNew={(name) => void saveAsNewScenario(name)}
          onSwitch={(id) => void switchScenario(id)}
          onRename={(id, name) => void renameScenario(id, name)}
          onDelete={(id) => void deleteScenario(id)}
          onUpdateActive={() => void updateActiveScenario()}
        />

        <TotalsBar
          totals={totals}
          lineCount={lines.length}
          clientMode={clientMode}
        />

        <AssemblyInstancesPanel
          instances={assemblyInstances}
          costOverrides={settings?.cost_overrides}
          onChange={updateInstance}
          onRemove={removeInstance}
          onSplit={splitInstance}
          onAddAssembly={() => setShowAssemblyModal(true)}
        />

        {lines.length === 0 ? (
          <EmptyState onAddBlank={addBlankLine} hasParsedBoms={parsedDistributorBoms.length > 0} />
        ) : (
          <CollapsibleLineEditor
            lines={lines}
            assemblyCount={assemblyInstances.length}
            onUpdate={updateLine}
            onRemove={removeLine}
            clientMode={clientMode}
          />
        )}

        {lines.length > 0 && deal ? (
          <SoftCostsPanel
            deal={deal}
            costSubtotal={totals.cost}
            customerSubtotal={totals.customer}
            onChange={updateSoftCosts}
          />
        ) : null}

        <div className="flex flex-wrap justify-between gap-2 pb-24 sm:pb-0">
          <button
            onClick={addBlankLine}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            title="Add a one-off line not tied to an assembly — for materials or labor that don't come from an assembly's formula."
          >
            <PlusIcon className="h-4 w-4" />
            Add blank line
          </button>
          {/* Takeoff PDF — desktop-only (printing/lumber-yard workflow). */}
          <Link
            href={`/deals/${id}/takeoff`}
            className="hidden items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 md:inline-flex"
            title="Open the printable takeoff document — internal/lumber-yard facing with full cost + markup detail. Print to PDF from the browser."
          >
            <PrinterIcon className="h-4 w-4" />
            Takeoff PDF
          </Link>
        </div>
      </div>

      <AddAssemblyModal
        open={showAssemblyModal}
        onClose={() => setShowAssemblyModal(false)}
        onConfirm={importFromAssembly}
      />

      {/* Undo toasts for destructive actions — bottom-right on desktop,
       *  raised above the mobile sticky bar + bottom nav on phones so
       *  they don't get hidden. Each toast auto-dismisses after 7s. */}
      {toasts.length > 0 ? (
        <div
          className="fixed right-4 z-50 flex flex-col gap-2 sm:bottom-6 sm:right-6"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 7.5rem)" }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className="flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"
            >
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() => {
                  t.undo();
                  dismissToast(t.id);
                }}
                className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Dismiss"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Sticky mobile-only bottom bar — phone real estate is precious,
       *  keep the running total + Save action thumb-reachable while the
       *  builder scrolls long assembly + line lists. Sits just above the
       *  global MobileBottomNav (4rem tall + safe area), so they stack
       *  rather than overlap. */}
      <div
        className="fixed inset-x-0 z-30 border-t border-slate-200 bg-white px-4 py-2 shadow-lg sm:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 4rem)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[10px] uppercase tracking-wider text-slate-500">
              Estimate to client
            </div>
            <div className="text-sm font-bold tabular-nums text-emerald-700">
              {fmtMoney(totals.grandTotal)}
            </div>
          </div>
          {!dirty && !saving ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <CheckIcon className="h-4 w-4" />
              Saved
            </span>
          ) : (
            <SaveButton
              onClick={onSave}
              saving={saving}
              progress={saveProgress}
              compact
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Wraps the LineEditor in a collapsible section. Default-collapsed when
 * there are assembly instances on the quote AND more than 5 derived
 * lines — the assemblies already show their materials inline, so the
 * full table is duplicate info most of the time. Ad-hoc-only quotes
 * (no assemblies) start expanded.
 */
function CollapsibleLineEditor({
  lines,
  assemblyCount,
  onUpdate,
  onRemove,
  clientMode,
}: {
  lines: QuoteLine[];
  assemblyCount: number;
  onUpdate: (idx: number, patch: Partial<QuoteLine>) => void;
  onRemove: (idx: number) => void;
  clientMode: boolean;
}) {
  const [open, setOpen] = useState<boolean>(
    !(assemblyCount > 0 && lines.length > 5),
  );
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDownIcon className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-slate-500" />
        )}
        <span className="text-sm font-semibold text-slate-900">Line items</span>
        <span className="text-xs text-slate-500">
          {lines.length} line{lines.length === 1 ? "" : "s"}
        </span>
        {!open && assemblyCount > 0 ? (
          <span className="ml-auto hidden text-xs text-slate-500 sm:inline">
            Derived from {assemblyCount} assembl
            {assemblyCount === 1 ? "y" : "ies"} above
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="border-t border-slate-200">
          <LineEditor
            lines={lines}
            onUpdate={onUpdate}
            onRemove={onRemove}
            clientMode={clientMode}
          />
        </div>
      ) : null}
    </section>
  );
}

function ImportBanner({
  boms,
  onImport,
}: {
  boms: ParsedAttCache[];
  onImport: (bom: ParsedAttCache) => void;
}) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-sm text-sky-900">
          <span className="font-semibold">Import from a parsed bid or material list.</span>{" "}
          Pull line items in from an attached PDF. Default markup from your settings is
          applied — edit per line.
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {boms.map((b) => (
          <button
            key={b.attachment_id}
            onClick={() => onImport(b)}
            className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
          >
            Import {b.bom.length} line{b.bom.length === 1 ? "" : "s"} from {b.attachment_name}
          </button>
        ))}
      </div>
    </div>
  );
}

function TotalsBar({
  totals,
  lineCount,
  clientMode,
}: {
  totals: {
    customer: number;
    cost: number;
    margin: number;
    grandTotal: number;
  };
  lineCount: number;
  clientMode: boolean;
}) {
  // The full 4-tile grid stays in normal document flow at all times —
  // never changes height or position. A separate compact overlay (below)
  // appears as a fixed-position bar when the full grid has scrolled out
  // of view. This avoids the layout-thrash oscillation we had earlier
  // where shrinking/growing the bar moved the sentinel and re-triggered
  // the observer in a loop.
  const [scrolledOut, setScrolledOut] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolledOut(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const marginAccent: "emerald" | "amber" | "red" =
    totals.margin >= 15 ? "emerald" : totals.margin >= 5 ? "amber" : "red";

  return (
    <>
      {/* Full bar — always rendered, always in normal flow, same height.
       *  Client-presentation mode collapses to just Line Items +
       *  Estimate to Client (Cost + Margin hidden). */}
      <section
        className={
          clientMode
            ? "grid grid-cols-2 gap-4"
            : "grid grid-cols-2 gap-4 sm:grid-cols-4"
        }
      >
        <Stat label="Line Items" value={String(lineCount)} />
        {!clientMode && (
          <Stat label="Total Cost" value={fmtMoney(totals.cost)} />
        )}
        <Stat
          label="Estimate to Client"
          value={fmtMoney(totals.grandTotal)}
          accent="emerald"
        />
        {!clientMode && (
          <Stat
            label="Profit Margin"
            value={`${totals.margin.toFixed(1)}%`}
            accent={marginAccent}
          />
        )}
      </section>
      {/* Sentinel sits just below the full bar; observer fires when it
       *  leaves the top of the viewport (i.e. the user scrolled past
       *  the full bar). */}
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {/* Compact overlay — fixed-position so it doesn't change document
       *  flow when it appears/disappears. Visible on every viewport;
       *  mobile gets a slimmer 2-stat version focused on what matters
       *  in the kitchen-table flow (client total + margin). */}
      {scrolledOut ? (
        <div
          className="fixed inset-x-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur"
          style={{ top: "env(safe-area-inset-top)" }}
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
            {/* Mobile compact: 2 most-important stats — or just Client
             *  in presentation mode. */}
            <div className="flex items-baseline gap-4 sm:hidden">
              <CompactStat
                label="Client"
                value={fmtMoney(totals.grandTotal)}
                accent="emerald"
              />
              {!clientMode && (
                <CompactStat
                  label="Margin"
                  value={`${totals.margin.toFixed(1)}%`}
                  accent={marginAccent}
                />
              )}
            </div>
            {/* Desktop full: 4 stats — or Lines + Client in presentation
             *  mode. */}
            <div className="hidden items-baseline gap-5 sm:flex">
              <CompactStat label="Lines" value={String(lineCount)} />
              {!clientMode && (
                <CompactStat label="Cost" value={fmtMoney(totals.cost)} />
              )}
              <CompactStat
                label="Client"
                value={fmtMoney(totals.grandTotal)}
                accent="emerald"
              />
              {!clientMode && (
                <CompactStat
                  label="Margin"
                  value={`${totals.margin.toFixed(1)}%`}
                  accent={marginAccent}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CompactStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber" | "red";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "amber"
        ? "text-sky-700"
        : accent === "red"
          ? "text-red-700"
          : "text-slate-900";
  return (
    <div className="flex items-baseline gap-1.5 tabular-nums">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber" | "red";
}) {
  const color =
    accent === "emerald" ? "text-emerald-700" : accent === "amber" ? "text-sky-700" : accent === "red" ? "text-red-700" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

/** Best-guess source of a line's pricing, given that older records may
 *  lack the price_source field. Order of inference:
 *   1. Explicit price_source — trust what the line says.
 *   2. instance_id present + no source — came from an assembly →
 *      "catalog".
 *   3. Description matches the RFQ-push pattern "<scope> — <sub>" →
 *      "bid".
 *   4. Fall back to "manual" — best we can guess for ad-hoc lines.
 *  Used only for the provenance pill; never re-saved to the line. */
function resolvePriceSource(line: QuoteLine): PriceSource {
  if (line.price_source) return line.price_source;
  if (line.instance_id) return "catalog";
  if (/\s—\s.+/.test(line.description)) return "bid";
  return "manual";
}

/** Tiny colored pill that shows where a line item's cost came from.
 *  Hover for the full label. */
function PriceSourcePill({ source }: { source: PriceSource }) {
  const cfg: Record<
    PriceSource,
    { label: string; full: string; cls: string }
  > = {
    bid: {
      label: "bid",
      full: "Awarded sub bid — real local pricing",
      cls: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    },
    market: {
      label: "mkt",
      full: "Market data (regional)",
      cls: "bg-amber-100 text-amber-800 ring-amber-200",
    },
    catalog: {
      label: "cat",
      full: "Catalog stub — placeholder until bid or market data fills in",
      cls: "bg-slate-100 text-slate-600 ring-slate-200",
    },
    manual: {
      label: "man",
      full: "Manually entered by builder",
      cls: "bg-sky-100 text-sky-800 ring-sky-200",
    },
  };
  const c = cfg[source];
  return (
    <span
      title={c.full}
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${c.cls}`}
    >
      {c.label}
    </span>
  );
}

function EmptyState({
  onAddBlank,
  hasParsedBoms,
}: {
  onAddBlank: () => void;
  hasParsedBoms: boolean;
}) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-base font-semibold text-slate-900">No line items yet</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {hasParsedBoms
          ? "Import lines from a parsed sub bid or material list (banner above), or add a line manually."
          : "Add line items here — materials, labor, and sub trades. Or upload a plan PDF on the project page and AI will pre-fill the structure (coming soon)."}
      </p>
      <button
        onClick={onAddBlank}
        className="mt-4 rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800"
      >
        Add first line item
      </button>
    </div>
  );
}

function LineEditor({
  lines,
  onUpdate,
  onRemove,
  clientMode,
}: {
  lines: QuoteLine[];
  onUpdate: (idx: number, patch: Partial<QuoteLine>) => void;
  onRemove: (idx: number) => void;
  clientMode: boolean;
}) {
  // Filter via CSS hide — keeps the array indices stable so `onUpdate`
  // and `onRemove` still address the right line, no matter what the
  // user has typed into the search box.
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const matches = (l: QuoteLine) =>
    !q ||
    l.description.toLowerCase().includes(q) ||
    l.product_code.toLowerCase().includes(q) ||
    (l.notes ?? "").toLowerCase().includes(q);
  const visibleCount = q ? lines.filter(matches).length : lines.length;

  // Soft tint per Phase — alternates plain white and sky-50 so every
  // other phase group reads as a tinted section without the page
  // feeling busy. Hover bumps a shade for the row under the cursor.
  const phaseRowClass = useMemo(() => {
    const palette = [
      "hover:bg-slate-50",
      "bg-sky-50 hover:bg-sky-100",
    ];
    const map = new Map<string, string>();
    for (const line of lines) {
      const phase = line.product_code?.trim();
      if (!phase) continue;
      if (!map.has(phase)) map.set(phase, palette[map.size % palette.length]);
    }
    return map;
  }, [lines]);

  // Sort lines for display so same-phase rows cluster together. First
  // appearance of a phase locks in its position; subsequent lines with
  // that phase fall in beside the cluster. Empty-phase lines sort
  // last. Display index is independent of the underlying array index
  // — the original index is what onUpdate / onRemove need.
  const displayLines = useMemo(() => {
    const phaseOrder = new Map<string, number>();
    for (const line of lines) {
      const phase = line.product_code?.trim() ?? "";
      if (!phaseOrder.has(phase)) phaseOrder.set(phase, phaseOrder.size);
    }
    const empty = phaseOrder.size; // empty phase sorts after named phases
    const indexed = lines.map((line, origIdx) => ({ line, origIdx }));
    return indexed.sort((a, b) => {
      const pa = a.line.product_code?.trim() ?? "";
      const pb = b.line.product_code?.trim() ?? "";
      const oa = pa ? (phaseOrder.get(pa) ?? empty) : empty;
      const ob = pb ? (phaseOrder.get(pb) ?? empty) : empty;
      if (oa !== ob) return oa - ob;
      // Within same phase: preserve original insertion order.
      return a.origIdx - b.origIdx;
    });
  }, [lines]);

  // Outer chrome (rounded, border, shadow) is provided by the parent
  // CollapsibleLineEditor wrapper — keep this as a plain container.
  return (
    <div className="bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by phase, description, or notes…"
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            aria-label="Search line items"
          />
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
        </div>
        <span className="whitespace-nowrap text-xs text-slate-500">
          {q
            ? `Showing ${visibleCount} of ${lines.length}`
            : `${lines.length} line${lines.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="max-h-[640px] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500 shadow-sm">
            <tr>
              <th className="px-3 py-3 text-left">#</th>
              <th className="px-3 py-3 text-left">
                <Tooltip label="Group lines by construction phase (Foundation, Framing, Finishes, etc). Phases roll up into milestones on the project schedule.">
                  <span>Phase</span>
                </Tooltip>
              </th>
              <th className="px-3 py-3 text-left">Description</th>
              <th className="px-3 py-3 text-right">Qty</th>
              {!clientMode && (
                <>
                  <th className="px-3 py-3 text-right">
                    <Tooltip label="What you pay (sub bid, supplier invoice, internal labor cost). The client never sees this column.">
                      <span>Unit Cost</span>
                    </Tooltip>
                  </th>
                  <th className="px-3 py-3 text-right">
                    <Tooltip label="Your markup over cost. Defaults to your settings markup (typically 15-25% for residential builders). Editable per line.">
                      <span>Markup %</span>
                    </Tooltip>
                  </th>
                </>
              )}
              <th className="px-3 py-3 text-right">
                <Tooltip label="What the client pays per unit. Calculated as Unit Cost × (1 + Markup %). This is the only price the client sees.">
                  <span>Unit Price</span>
                </Tooltip>
              </th>
              <th className="px-3 py-3 text-right">Line Total</th>
              {!clientMode && (
                <th className="px-3 py-3 text-right">
                  <Tooltip label="Profit margin on this line as a percentage of the client price. Green ≥ 15%, sky ≥ 5%, red below 5%.">
                    <span>Margin</span>
                  </Tooltip>
                </th>
              )}
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayLines.map(({ line, origIdx }, displayIdx) => {
              const tint =
                phaseRowClass.get(line.product_code?.trim()) ??
                "hover:bg-slate-50";
              return (
              <tr
                key={line.id}
                className={`${tint} ${matches(line) ? "" : "hidden"}`}
              >
                <td className="px-3 py-2 text-xs text-slate-500">
                  {displayIdx + 1}
                </td>
                <td className="px-2 py-1.5">
                  <CellInput
                    value={line.product_code}
                    onChange={(v) => onUpdate(origIdx, { product_code: v })}
                    className="w-48 text-xs"
                    placeholder="Foundation"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <PriceSourcePill source={resolvePriceSource(line)} />
                    <CellInput
                      value={line.description}
                      onChange={(v) => onUpdate(origIdx, { description: v })}
                      className="w-full min-w-[280px]"
                    />
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <NumInput
                    value={line.qty}
                    onChange={(v) => onUpdate(origIdx, { qty: v })}
                    width="w-20"
                  />
                </td>
                {!clientMode && (
                  <>
                    <td className="px-2 py-1.5 text-right">
                      <NumInput
                        value={line.list_price}
                        onChange={(v) => onUpdate(origIdx, { list_price: v })}
                        width="w-28"
                        decimals
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <NumInput
                        value={line.markup_percent}
                        onChange={(v) =>
                          onUpdate(origIdx, { markup_percent: v })
                        }
                        width="w-20"
                        decimals
                      />
                    </td>
                  </>
                )}
                <td
                  className="cursor-default px-3 py-2 text-right tabular-nums text-slate-500"
                  title="Calculated — Unit Cost × (1 + Markup %)"
                >
                  {fmtMoney(line.customer_unit_price)}
                </td>
                <td
                  className="cursor-default px-3 py-2 text-right font-medium tabular-nums text-slate-700"
                  title="Calculated — Qty × Unit Price"
                >
                  {fmtMoney(line.customer_extended)}
                </td>
                {!clientMode && (
                  <td
                    className="cursor-default px-3 py-2 text-right text-xs"
                    title="Calculated margin"
                  >
                    <span
                      className={
                        line.margin_percent >= 15
                          ? "text-emerald-700"
                          : line.margin_percent >= 5
                          ? "text-sky-700"
                          : line.margin_percent === 0
                          ? "text-slate-400"
                          : "text-red-700"
                      }
                    >
                      {line.margin_percent.toFixed(1)}%
                    </span>
                  </td>
                )}
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onRemove(origIdx)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Remove line"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Save button that morphs into a progress bar while a save is in flight.
 * Same eased curve as the apply/extract progress UX — saves take a couple
 * seconds and the bar gives the user something concrete to watch instead
 * of a flat "Saving…" label.
 */
function SaveButton({
  onClick,
  saving,
  progress,
  compact = false,
}: {
  onClick: () => void;
  saving: boolean;
  progress: number;
  compact?: boolean;
}) {
  if (saving) {
    const widthClass = compact ? "min-w-[80px]" : "min-w-[140px]";
    return (
      <div
        className={`relative ${widthClass} overflow-hidden rounded-md bg-sky-700 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm`}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="absolute inset-y-0 left-0 bg-sky-500 transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
        <span className="relative tabular-nums">
          {progress >= 99 ? "Saved ✓" : `Saving ${Math.round(progress)}%`}
        </span>
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className={
        compact
          ? "rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800"
          : "rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800"
      }
    >
      {compact ? "Save" : "Save estimate"}
    </button>
  );
}

/**
 * Inline help panel — toggled by the question-mark icon next to the page
 * title. Explains the column model and the assembly/line-item split so
 * a first-time builder isn't stuck guessing what each input does.
 */
function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="relative rounded-xl border border-sky-200 bg-sky-50/60 p-5 text-sm text-slate-800">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Close help"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
      <h3 className="text-sm font-semibold text-slate-900">
        How this page works
      </h3>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-800">
            Two ways to build the estimate
          </h4>
          <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed text-slate-700">
            <li>
              <strong>Add assembly</strong> — pick a pre-built component
              (Exterior Wall, Roof, Slab, Window, Kitchen Cabinetry, etc.).
              Set its properties (length, height, material, style) and it
              generates a block of material lines automatically. Edit any
              property and the lines regenerate live.
            </li>
            <li>
              <strong>Add blank line</strong> — for anything not covered by
              an assembly. Type the description, qty, unit cost, and markup
              directly.
            </li>
          </ul>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-800">
            Scenarios (kitchen-table feature)
          </h4>
          <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed text-slate-700">
            <li>
              Above the totals bar, click{" "}
              <strong>+ Save current as…</strong> to freeze the estimate as
              a named scenario (Standard / Premium / Budget / whatever).
            </li>
            <li>
              Tweak the assemblies + variants for that scenario, then save
              another. Click any chip to instantly load that scenario&apos;s
              full state and show the client side-by-side variations.
            </li>
            <li>
              Editing while a scenario is active shows an amber dot + an{" "}
              <strong>Update {"{name}"}</strong> button — click it to sync
              your edits back into that scenario&apos;s snapshot.
            </li>
          </ul>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-800">
            Inside an assembly card
          </h4>
          <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed text-slate-700">
            <li>
              <strong>+ Add variant</strong> — compare options (vinyl vs
              wood windows, builder vs premium carpet) side-by-side. Pick a
              curated preset; the active variant&apos;s chip is filled,
              inactive chips show their price + delta. Click a chip to
              switch the active variant.
            </li>
            <li>
              <strong>Split 1 →</strong> — on assemblies with a Quantity
              field (doors, windows, garage doors), peel one unit off into
              a sibling card you can customize independently. Use case: 5
              standard doors, but the client wants 1 in mahogany.
            </li>
            <li>
              <strong>Collapse</strong> — chevron in the card header
              shrinks the card to a one-line summary.
            </li>
          </ul>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-800">
            Column meanings (line items)
          </h4>
          <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed text-slate-700">
            <li>
              <strong>Phase</strong> — group label (Foundation, Framing,
              Finishes…) that rolls up into milestones / draws downstream.
            </li>
            <li>
              <strong>Unit Cost</strong> — what you pay (sub bid, supplier
              invoice, labor cost). Client never sees this column.
            </li>
            <li>
              <strong>Markup %</strong> — your margin on top of cost.
              Default from Settings; editable per line.
            </li>
            <li>
              <strong>Unit Price</strong> = Unit Cost × (1 + Markup %).
              What the client pays per unit.
            </li>
            <li>
              <strong>Line Total</strong> = Qty × Unit Price. Margin column
              colors green ≥15%, sky ≥5%, red below 5%.
            </li>
          </ul>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-800">
            Soft costs (below the line subtotal)
          </h4>
          <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed text-slate-700">
            <li>
              <strong>Tax</strong> — percentage on the materials subtotal
              (default) or full customer subtotal.
            </li>
            <li>
              <strong>Contingency</strong> — percentage reserve on cost
              subtotal; your buffer for change orders + price swings.
            </li>
            <li>
              <strong>General Conditions</strong> — supervision, dumpsters,
              port-a-john, etc. Either a percent on cost or a flat dollar
              amount.
            </li>
            <li>
              These stack on top to produce the <strong>Grand Total</strong>{" "}
              — what the client owes and what feeds the proposal + draw
              schedule.
            </li>
          </ul>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-800">
            Saving + sending
          </h4>
          <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed text-slate-700">
            <li>
              <strong>Save</strong> — commits the current state, including
              scenarios. The deal&apos;s roll-up totals + margin update at
              the same time.
            </li>
            <li>
              <strong>Export CSV</strong> — downloads a spreadsheet of the
              line items.
            </li>
            <li>
              <strong>Takeoff PDF</strong> — internal/lumber-yard-facing
              printable estimate with full cost + markup detail. Print to
              PDF from your browser.
            </li>
            <li>
              <strong>Generate proposal</strong> — builds the client-facing
              document. The client never sees cost or markup, just the
              scope and total.
            </li>
          </ul>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-800">
            Customizing the catalog
          </h4>
          <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed text-slate-700">
            <li>
              In <strong>Settings → Assembly cost overrides</strong>: tune
              every assembly to your local market with global ×
              multipliers + per-assembly fine-tuning.
            </li>
            <li>
              Click <strong>Materials</strong> next to any assembly to
              uncheck stock lines you don&apos;t use, or add custom lines
              that scale off the assembly&apos;s properties.
            </li>
            <li>
              The <strong>✨ AI assist</strong> panel inside that editor:
              describe a custom line in plain English (e.g. <em>&ldquo;vapor
              barrier under slab, $0.45/SF, 10% waste&rdquo;</em>) and
              Claude fills the form fields for you. Review + save.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function CellInput({
  value,
  onChange,
  className = "",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 ${className}`}
    />
  );
}

function NumInput({
  value,
  onChange,
  width,
  decimals = false,
}: {
  value: number;
  onChange: (v: number) => void;
  width: string;
  decimals?: boolean;
}) {
  return (
    <NumberInput
      value={value}
      onChange={onChange}
      decimals={decimals}
      className={`rounded border border-transparent bg-transparent px-2 py-1 text-right text-sm tabular-nums hover:border-slate-200 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 ${width}`}
    />
  );
}

function round(n: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

// CSV export of the estimate line items. Format is plain CSV (RFC 4180-
// ish) with column headers, suitable for opening in Excel/Numbers, the
// QuickBooks Online Bulk Add tool, or any other accounting/spreadsheet
// program. Keeps it neutral rather than baking in QB's specific invoice-
// import schema (which requires customer/date/terms columns we don't
// always have at estimate time).
function exportLinesCsv(deal: Deal, lines: QuoteLine[]) {
  const headers = [
    "Line",
    "Phase",
    "Description",
    "Qty",
    "Unit Cost",
    "Markup %",
    "Unit Price",
    "Line Total",
    "Margin %",
  ];
  // Quote-wrap any value that contains a comma, quote, or newline. Inner
  // quotes are doubled per RFC 4180.
  const esc = (v: string | number): string => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = lines.map((l) => [
    l.line_number,
    l.product_code || "",
    l.description || "",
    l.qty,
    round(l.cost_unit_price, 2),
    l.markup_percent,
    round(l.customer_unit_price, 2),
    round(l.customer_extended, 2),
    round(l.margin_percent, 1),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map(esc).join(","))
    .join("\n");

  const dateStamp = new Date().toISOString().slice(0, 10);
  const safeName = (deal.name || "estimate")
    .replace(/[^a-z0-9_\- ]/gi, "")
    .replace(/\s+/g, "-");
  const filename = `${safeName}_estimate_${dateStamp}.csv`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
