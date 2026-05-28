"use client";

// Settings → Estimate Template editor.
//
// Renders Barry's 70-section / ~210-item Good Faith Estimate template
// (DEFAULT_ESTIMATE_TEMPLATE) with per-org overrides persisted on
// OrgSettings.estimate_template. Sections are collapsible; the whole
// doc is searchable; every item is inline-editable with add/delete
// per section.
//
// Storage model: the WHOLE template (sections + items) is stored on
// OrgSettings.estimate_template. On first visit (no override yet),
// the page initializes from DEFAULT_ESTIMATE_TEMPLATE and saves the
// user's version on first edit. Replacing the whole tree means we
// don't have to track diffs; tradeoff is the doc size, which at
// ~30KB is well under Firestore's 1MB limit.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import { useAuth } from "@/lib/auth-context";
import { getSettings, saveSettings } from "@/lib/store";
import { OrgSettings } from "@/types";
import {
  DEFAULT_ESTIMATE_TEMPLATE,
  type EstimateTemplate,
  type EstimateTemplateSection,
  type EstimateTemplateItem,
} from "@/lib/estimate-template-default";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EstimateTemplatePage() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [template, setTemplate] = useState<EstimateTemplate>(
    DEFAULT_ESTIMATE_TEMPLATE,
  );
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const s = await getSettings(profile.org_ref);
      if (s) setSettings(s);
      const tpl = s?.estimate_template ?? DEFAULT_ESTIMATE_TEMPLATE;
      setTemplate(tpl);
      setSavedSnapshot(JSON.stringify(tpl));
      setLoaded(true);
    })();
  }, [profile]);

  // Lower-cased search needle. Empty = all sections visible (subject
  // to their collapse state).
  const needle = search.trim().toLowerCase();

  // For search, narrow each section to its matching items. When the
  // section header itself matches, every item in it is shown so the
  // builder can scan the matched section as a unit.
  const filteredSections = useMemo(() => {
    if (!needle) return template.sections;
    return template.sections
      .map((sec) => {
        const sectionMatch =
          sec.name.toLowerCase().includes(needle) ||
          sec.id.toLowerCase().includes(needle);
        const items = sec.items.filter(
          (it) =>
            sectionMatch ||
            it.name.toLowerCase().includes(needle) ||
            it.id.toLowerCase().includes(needle) ||
            (it.unit ?? "").toLowerCase().includes(needle),
        );
        if (items.length === 0 && !sectionMatch) return null;
        return { ...sec, items };
      })
      .filter((x): x is EstimateTemplateSection => x !== null);
  }, [needle, template.sections]);

  // When search is active, auto-expand every matched section so the
  // hits are visible. When the user clears search, sections collapse
  // back to whatever the user had open.
  const effectiveOpen = useMemo(() => {
    if (!needle) return openSections;
    return new Set(filteredSections.map((s) => s.id));
  }, [needle, filteredSections, openSections]);

  const dirty = JSON.stringify(template) !== savedSnapshot;
  const totalItems = template.sections.reduce(
    (n, s) => n + s.items.length,
    0,
  );

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateItem(
    sectionId: string,
    itemId: string,
    patch: Partial<EstimateTemplateItem>,
  ) {
    setTemplate((prev) => ({
      sections: prev.sections.map((s) =>
        s.id !== sectionId
          ? s
          : {
              ...s,
              items: s.items.map((it) =>
                it.id !== itemId ? it : { ...it, ...patch },
              ),
            },
      ),
    }));
  }

  function deleteItem(sectionId: string, itemId: string) {
    setTemplate((prev) => ({
      sections: prev.sections.map((s) =>
        s.id !== sectionId
          ? s
          : { ...s, items: s.items.filter((it) => it.id !== itemId) },
      ),
    }));
  }

  function addItem(sectionId: string) {
    setTemplate((prev) => ({
      sections: prev.sections.map((s) => {
        if (s.id !== sectionId) return s;
        // Generate a fresh decimal sub-id. Take the section id +
        // ".N" where N continues past whatever's already there.
        const existing = s.items
          .map((it) => {
            const m = it.id.match(/^\d+\.(\d+)/);
            return m ? parseInt(m[1], 10) : 0;
          })
          .reduce((a, b) => Math.max(a, b), 0);
        const newId = `${s.id}.${existing + 1}`;
        return {
          ...s,
          items: [
            ...s.items,
            {
              id: newId,
              name: "",
              type: null,
              qty: null,
              unit: null,
              unit_cost: null,
            },
          ],
        };
      }),
    }));
    // Make sure the section is open so the new row is visible.
    setOpenSections((prev) => new Set(prev).add(sectionId));
  }

  function addSection() {
    setTemplate((prev) => {
      const maxId = prev.sections
        .map((s) => parseInt(s.id, 10))
        .filter((n) => Number.isFinite(n))
        .reduce((a, b) => Math.max(a, b), 0);
      const newId = String(maxId + 1);
      return {
        sections: [
          ...prev.sections,
          { id: newId, name: "New section", items: [] },
        ],
      };
    });
  }

  function deleteSection(id: string) {
    if (
      !confirm(
        "Delete this entire section and every line item in it? This can be undone by hitting Cancel before Save.",
      )
    ) {
      return;
    }
    setTemplate((prev) => ({
      sections: prev.sections.filter((s) => s.id !== id),
    }));
  }

  async function onSave() {
    if (!profile || !settings) return;
    setSaving(true);
    try {
      const next: OrgSettings = { ...settings, estimate_template: template };
      await saveSettings(next);
      setSettings(next);
      setSavedSnapshot(JSON.stringify(template));
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 2200);
    } finally {
      setSaving(false);
    }
  }

  function onReset() {
    if (
      !confirm(
        "Replace your edits with the original template? Saved changes won't be lost until you hit Save again — Cancel will keep them on disk.",
      )
    )
      return;
    setTemplate(DEFAULT_ESTIMATE_TEMPLATE);
  }

  if (!loaded) {
    return (
      <AppShell>
        <p className="text-sm text-slate-500">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <Link
          href="/settings"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to settings
        </Link>

        <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Estimate Template
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Your Good Faith Estimate categories and line items. Add your
              standard pricing here — these defaults flow into every new
              project estimate. Based on Barry McCluskey&apos;s 70-section
              template; tune to fit your business.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {template.sections.length} section{template.sections.length === 1 ? "" : "s"} · {totalItems} line item{totalItems === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && (
              <span className="text-xs text-emerald-600">✓ Saved</span>
            )}
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              Reset to default
            </button>
            <button
              onClick={() => void onSave()}
              disabled={!dirty || saving}
              className="rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </header>

        {/* Search bar — filters by section name, item name, item id,
         *  or unit. Matched sections auto-expand. */}
        <div className="sticky top-0 z-10 mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sections, items, units…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 pl-9 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          {needle && (
            <p className="mt-1 text-xs text-slate-500">
              {filteredSections.length} section{filteredSections.length === 1 ? "" : "s"} match — auto-expanded
            </p>
          )}
        </div>

        <div className="space-y-3 pb-24">
          {filteredSections.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No sections or items match &ldquo;{search}&rdquo;.
            </p>
          ) : (
            filteredSections.map((sec) => (
              <SectionCard
                key={sec.id}
                section={sec}
                isOpen={effectiveOpen.has(sec.id)}
                onToggle={() => toggleSection(sec.id)}
                onUpdateItem={(itemId, patch) =>
                  updateItem(sec.id, itemId, patch)
                }
                onDeleteItem={(itemId) => deleteItem(sec.id, itemId)}
                onAddItem={() => addItem(sec.id)}
                onRenameSection={(name) =>
                  setTemplate((prev) => ({
                    sections: prev.sections.map((s) =>
                      s.id === sec.id ? { ...s, name } : s,
                    ),
                  }))
                }
                onDeleteSection={() => deleteSection(sec.id)}
              />
            ))
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={addSection}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-sky-300 hover:bg-sky-50"
            >
              <PlusIcon className="h-4 w-4" />
              Add section
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SectionCard({
  section,
  isOpen,
  onToggle,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onRenameSection,
  onDeleteSection,
}: {
  section: EstimateTemplateSection;
  isOpen: boolean;
  onToggle: () => void;
  onUpdateItem: (itemId: string, patch: Partial<EstimateTemplateItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: () => void;
  onRenameSection: (name: string) => void;
  onDeleteSection: () => void;
}) {
  const lineTotal = section.items.reduce(
    (sum, it) => sum + (it.qty ?? 0) * (it.unit_cost ?? 0),
    0,
  );

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
          #{section.id}
        </span>
        <input
          type="text"
          value={section.name}
          onChange={(e) => onRenameSection(e.target.value)}
          className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-sky-400 focus:bg-white focus:outline-none"
        />
        <span className="text-xs text-slate-500">
          {section.items.length} item{section.items.length === 1 ? "" : "s"}
        </span>
        {lineTotal > 0 && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            {fmtMoney(lineTotal)}
          </span>
        )}
        <button
          type="button"
          onClick={onDeleteSection}
          aria-label="Delete section"
          className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </header>

      {isOpen && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-left">Unit</th>
                <th className="px-3 py-2 text-right">Unit Cost</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {section.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-xs italic text-slate-400"
                  >
                    No items in this section yet.
                  </td>
                </tr>
              ) : (
                section.items.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    onChange={(patch) => onUpdateItem(it.id, patch)}
                    onDelete={() => onDeleteItem(it.id)}
                  />
                ))
              )}
            </tbody>
          </table>
          <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-2 text-right">
            <button
              type="button"
              onClick={onAddItem}
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add item
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function ItemRow({
  item,
  onChange,
  onDelete,
}: {
  item: EstimateTemplateItem;
  onChange: (patch: Partial<EstimateTemplateItem>) => void;
  onDelete: () => void;
}) {
  const total = (item.qty ?? 0) * (item.unit_cost ?? 0);
  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">
        {item.id}
      </td>
      <td className="px-3 py-1.5">
        <input
          type="text"
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Item name"
          className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-slate-900 hover:border-slate-200 focus:border-sky-400 focus:bg-white focus:outline-none"
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        <input
          type="number"
          step="any"
          value={item.qty ?? ""}
          onChange={(e) =>
            onChange({
              qty: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          className="w-20 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-right text-sm tabular-nums hover:border-slate-200 focus:border-sky-400 focus:bg-white focus:outline-none"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="text"
          value={item.unit ?? ""}
          onChange={(e) => onChange({ unit: e.target.value || null })}
          placeholder="LF, SF, EA…"
          className="w-20 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-slate-700 hover:border-slate-200 focus:border-sky-400 focus:bg-white focus:outline-none"
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        <input
          type="number"
          step="any"
          value={item.unit_cost ?? ""}
          onChange={(e) =>
            onChange({
              unit_cost: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          placeholder="0.00"
          className="w-24 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-right text-sm tabular-nums hover:border-slate-200 focus:border-sky-400 focus:bg-white focus:outline-none"
        />
      </td>
      <td className="px-3 py-1.5 text-right text-sm tabular-nums text-slate-900">
        {total > 0 ? fmtMoney(total) : "—"}
      </td>
      <td className="px-3 py-1.5 text-right">
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete item"
          className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
