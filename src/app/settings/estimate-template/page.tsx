"use client";

// Settings → Estimate Template editor.
//
// Renders Barry's Good Faith Estimate template as 5 main categories
// (PRE-CONSTRUCTION, FOUNDATION, MECHANICAL, FRAMING AND EXTERIOR,
// INTERIOR AND EXTERIOR FINISH, plus Miscellaneous) → collapsible
// sections → editable line items. Persists per-org overrides on
// OrgSettings.estimate_template.
//
// Storage model: the WHOLE template (categories + sections + items)
// is stored on OrgSettings.estimate_template. On first visit the page
// initializes from DEFAULT_ESTIMATE_TEMPLATE and saves the user's
// version on first edit. Replacing the whole tree means we don't have
// to track diffs; tradeoff is doc size (~50KB), still well under
// Firestore's 1MB limit.

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
  type EstimateTemplateCategory,
  type EstimateTemplateSection,
  type EstimateTemplateItem,
} from "@/lib/estimate-template-default";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Back-compat shim: older saved templates used { sections: [...] }
// without categories. Wrap them in a single category so the editor
// can still render them.
function normalizeTemplate(tpl: unknown): EstimateTemplate {
  if (!tpl || typeof tpl !== "object") return DEFAULT_ESTIMATE_TEMPLATE;
  const t = tpl as Partial<EstimateTemplate> & {
    sections?: EstimateTemplateSection[];
  };
  if (Array.isArray(t.categories) && t.categories.length > 0) {
    return { categories: t.categories };
  }
  if (Array.isArray(t.sections) && t.sections.length > 0) {
    return {
      categories: [
        { id: "uncategorized", name: "Uncategorized", sections: t.sections },
      ],
    };
  }
  return DEFAULT_ESTIMATE_TEMPLATE;
}

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
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const s = await getSettings(profile.org_ref);
      if (s) setSettings(s);
      const tpl = normalizeTemplate(s?.estimate_template ?? DEFAULT_ESTIMATE_TEMPLATE);
      setTemplate(tpl);
      setSavedSnapshot(JSON.stringify(tpl));
      // Default: all categories open, all sections closed.
      setOpenCategories(new Set(tpl.categories.map((c) => c.id)));
      setLoaded(true);
    })();
  }, [profile]);

  const needle = search.trim().toLowerCase();

  // For search, narrow each section to its matching items, and each
  // category to its matching sections. When a category or section
  // header itself matches, every descendant is shown so the builder
  // can scan the matched group as a unit.
  const filteredCategories = useMemo(() => {
    if (!needle) return template.categories;
    return template.categories
      .map((cat) => {
        const catMatch = cat.name.toLowerCase().includes(needle);
        const sections = cat.sections
          .map((sec) => {
            const secMatch =
              catMatch ||
              sec.name.toLowerCase().includes(needle) ||
              sec.id.toLowerCase().includes(needle);
            const items = sec.items.filter(
              (it) =>
                secMatch ||
                it.name.toLowerCase().includes(needle) ||
                it.id.toLowerCase().includes(needle) ||
                (it.unit ?? "").toLowerCase().includes(needle),
            );
            if (items.length === 0 && !secMatch) return null;
            return { ...sec, items };
          })
          .filter((x): x is EstimateTemplateSection => x !== null);
        if (sections.length === 0) return null;
        return { ...cat, sections };
      })
      .filter((x): x is EstimateTemplateCategory => x !== null);
  }, [needle, template.categories]);

  // When search is active, auto-expand every matched section AND its
  // parent category. When the user clears search, both collapse back
  // to whatever the user had open.
  const effectiveOpenSections = useMemo(() => {
    if (!needle) return openSections;
    const ids = new Set<string>();
    for (const cat of filteredCategories) {
      for (const sec of cat.sections) ids.add(`${cat.id}/${sec.id}`);
    }
    return ids;
  }, [needle, filteredCategories, openSections]);

  const effectiveOpenCategories = useMemo(() => {
    if (!needle) return openCategories;
    return new Set(filteredCategories.map((c) => c.id));
  }, [needle, filteredCategories, openCategories]);

  const dirty = JSON.stringify(template) !== savedSnapshot;
  const totalSections = template.categories.reduce(
    (n, c) => n + c.sections.length,
    0,
  );
  const totalItems = template.categories.reduce(
    (n, c) => n + c.sections.reduce((m, s) => m + s.items.length, 0),
    0,
  );

  function toggleCategory(id: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSection(catId: string, secId: string) {
    const key = `${catId}/${secId}`;
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function updateItem(
    catId: string,
    sectionId: string,
    itemId: string,
    patch: Partial<EstimateTemplateItem>,
  ) {
    setTemplate((prev) => ({
      categories: prev.categories.map((c) =>
        c.id !== catId
          ? c
          : {
              ...c,
              sections: c.sections.map((s) =>
                s.id !== sectionId
                  ? s
                  : {
                      ...s,
                      items: s.items.map((it) =>
                        it.id !== itemId ? it : { ...it, ...patch },
                      ),
                    },
              ),
            },
      ),
    }));
  }

  function deleteItem(catId: string, sectionId: string, itemId: string) {
    setTemplate((prev) => ({
      categories: prev.categories.map((c) =>
        c.id !== catId
          ? c
          : {
              ...c,
              sections: c.sections.map((s) =>
                s.id !== sectionId
                  ? s
                  : { ...s, items: s.items.filter((it) => it.id !== itemId) },
              ),
            },
      ),
    }));
  }

  function addItem(catId: string, sectionId: string) {
    setTemplate((prev) => ({
      categories: prev.categories.map((c) => {
        if (c.id !== catId) return c;
        return {
          ...c,
          sections: c.sections.map((s) => {
            if (s.id !== sectionId) return s;
            // Generate a fresh decimal sub-id: `${section}.N` where N
            // continues past whatever's already there.
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
        };
      }),
    }));
    setOpenSections((prev) => new Set(prev).add(`${catId}/${sectionId}`));
  }

  function addSection(catId: string) {
    setTemplate((prev) => ({
      categories: prev.categories.map((c) => {
        if (c.id !== catId) return c;
        // Next section ID = max whole-number ID across the whole
        // template + 1, so new sections sort sensibly.
        const maxId = prev.categories
          .flatMap((cc) => cc.sections.map((s) => parseInt(s.id, 10)))
          .filter((n) => Number.isFinite(n))
          .reduce((a, b) => Math.max(a, b), 0);
        const newId = String(maxId + 1);
        return {
          ...c,
          sections: [
            ...c.sections,
            {
              id: newId,
              name: "New section",
              items: [
                {
                  id: `${newId}.1`,
                  name: "",
                  type: null,
                  qty: null,
                  unit: null,
                  unit_cost: null,
                },
              ],
            },
          ],
        };
      }),
    }));
    setOpenCategories((prev) => new Set(prev).add(catId));
  }

  function deleteSection(catId: string, secId: string) {
    if (
      !confirm(
        "Delete this entire section and every line item in it? This can be undone by hitting Cancel before Save.",
      )
    )
      return;
    setTemplate((prev) => ({
      categories: prev.categories.map((c) =>
        c.id !== catId
          ? c
          : { ...c, sections: c.sections.filter((s) => s.id !== secId) },
      ),
    }));
  }

  function renameSection(catId: string, secId: string, name: string) {
    setTemplate((prev) => ({
      categories: prev.categories.map((c) =>
        c.id !== catId
          ? c
          : {
              ...c,
              sections: c.sections.map((s) =>
                s.id === secId ? { ...s, name } : s,
              ),
            },
      ),
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
    setOpenCategories(new Set(DEFAULT_ESTIMATE_TEMPLATE.categories.map((c) => c.id)));
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
              project estimate. Based on Barry McCluskey&apos;s template;
              tune to fit your business.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {template.categories.length} categor{template.categories.length === 1 ? "y" : "ies"} · {totalSections} section{totalSections === 1 ? "" : "s"} · {totalItems} line item{totalItems === 1 ? "" : "s"}
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

        {/* Search bar — filters by category/section name, item name,
         *  item id, or unit. Matched sections + their parent
         *  categories auto-expand. */}
        <div className="sticky top-0 z-10 mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories, sections, items, units…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 pl-9 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          {needle && (
            <p className="mt-1 text-xs text-slate-500">
              {filteredCategories.length} categor{filteredCategories.length === 1 ? "y" : "ies"}, {filteredCategories.reduce((n, c) => n + c.sections.length, 0)} section{filteredCategories.reduce((n, c) => n + c.sections.length, 0) === 1 ? "" : "s"} match — auto-expanded
            </p>
          )}
        </div>

        <div className="space-y-5 pb-24">
          {filteredCategories.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No categories, sections, or items match &ldquo;{search}&rdquo;.
            </p>
          ) : (
            filteredCategories.map((cat) => (
              <CategoryGroup
                key={cat.id}
                category={cat}
                isOpen={effectiveOpenCategories.has(cat.id)}
                onToggle={() => toggleCategory(cat.id)}
                openSectionKeys={effectiveOpenSections}
                onToggleSection={(secId) => toggleSection(cat.id, secId)}
                onUpdateItem={(secId, itemId, patch) =>
                  updateItem(cat.id, secId, itemId, patch)
                }
                onDeleteItem={(secId, itemId) =>
                  deleteItem(cat.id, secId, itemId)
                }
                onAddItem={(secId) => addItem(cat.id, secId)}
                onRenameSection={(secId, name) =>
                  renameSection(cat.id, secId, name)
                }
                onDeleteSection={(secId) => deleteSection(cat.id, secId)}
                onAddSection={() => addSection(cat.id)}
              />
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

function CategoryGroup({
  category,
  isOpen,
  onToggle,
  openSectionKeys,
  onToggleSection,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onRenameSection,
  onDeleteSection,
  onAddSection,
}: {
  category: EstimateTemplateCategory;
  isOpen: boolean;
  onToggle: () => void;
  openSectionKeys: Set<string>;
  onToggleSection: (secId: string) => void;
  onUpdateItem: (
    secId: string,
    itemId: string,
    patch: Partial<EstimateTemplateItem>,
  ) => void;
  onDeleteItem: (secId: string, itemId: string) => void;
  onAddItem: (secId: string) => void;
  onRenameSection: (secId: string, name: string) => void;
  onDeleteSection: (secId: string) => void;
  onAddSection: () => void;
}) {
  const itemCount = category.sections.reduce(
    (n, s) => n + s.items.length,
    0,
  );
  return (
    <section>
      <header className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <ChevronDownIcon
            className={`h-5 w-5 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
          {category.name}
        </h2>
        <span className="text-xs text-slate-400">
          {category.sections.length} section{category.sections.length === 1 ? "" : "s"} · {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>
      </header>

      {isOpen && (
        <div className="space-y-2">
          {category.sections.map((sec) => (
            <SectionCard
              key={sec.id}
              section={sec}
              isOpen={openSectionKeys.has(`${category.id}/${sec.id}`)}
              onToggle={() => onToggleSection(sec.id)}
              onUpdateItem={(itemId, patch) =>
                onUpdateItem(sec.id, itemId, patch)
              }
              onDeleteItem={(itemId) => onDeleteItem(sec.id, itemId)}
              onAddItem={() => onAddItem(sec.id)}
              onRenameSection={(name) => onRenameSection(sec.id, name)}
              onDeleteSection={() => onDeleteSection(sec.id)}
            />
          ))}
          <div className="pt-1">
            <button
              type="button"
              onClick={onAddSection}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-sky-300 hover:bg-sky-50"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add section to {category.name}
            </button>
          </div>
        </div>
      )}
    </section>
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
