"use client";

// Public designer portal. The token in the URL path is the doc ID of a
// designer_links record (see firestore.rules — anyone with the token can
// read it). NO auth required.
//
// A designer curates selection OPTIONS for one project: title, category,
// description, allowance, needed-by, and the option set (label /
// description / cost / image). They can also add new draft selections.
// project_selections is auth-gated, so reads + writes both go through
// /api/designer/* (admin SDK), which verifies the token and scopes every
// write to this link's project. Status / client-pick / approval fields
// stay in the builder + client flow — the designer never sees or sets
// them beyond a read-only status badge.

import { use, useEffect, useState } from "react";
import {
  PlusIcon,
  TrashIcon,
  SwatchIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import {
  ProjectSelection,
  SelectionOption,
  SelectionCategory,
  SelectionStatus,
  SELECTION_CATEGORIES,
  SELECTION_CATEGORY_LABELS,
  SELECTION_STATUS_LABELS,
  SELECTION_STATUS_STYLES,
} from "@/types/builder";

const fmtMoney = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Editable working copy of a selection, plus a stable React key so new
 *  (unsaved) drafts keep their identity before they get a server id. */
interface Draft {
  _key: string;
  id?: string;
  number?: string;
  category: SelectionCategory;
  title: string;
  description: string;
  allowance: number;
  needed_by?: string;
  status?: SelectionStatus;
  selected_option_id?: string;
  options: SelectionOption[];
}

function toDraft(s: ProjectSelection): Draft {
  return {
    _key: s.id,
    id: s.id,
    number: s.number,
    category: s.category,
    title: s.title,
    description: s.description || "",
    allowance: s.allowance,
    needed_by: s.needed_by,
    status: s.status,
    selected_option_id: s.selected_option_id,
    options: s.options || [],
  };
}

function newOptionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `opt-${Math.random().toString(36).slice(2)}`;
}

export default function DesignerPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [meta, setMeta] = useState<{ project_name: string; builder_name: string } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/designer/selections?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { ok: boolean; link?: typeof meta; selections?: ProjectSelection[] } | null) => {
        if (!active) return;
        if (!res || !res.ok || !res.link) {
          setMissing(true);
        } else {
          setMeta(res.link);
          setDrafts((res.selections || []).map(toDraft));
        }
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setMissing(true);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  function addDraft() {
    setDrafts((prev) => [
      ...prev,
      {
        _key: newOptionId(),
        category: "countertops",
        title: "",
        description: "",
        allowance: 0,
        status: "draft",
        options: [],
      },
    ]);
  }

  function replaceDraft(key: string, saved: ProjectSelection) {
    setDrafts((prev) =>
      prev.map((d) => (d._key === key ? { ...toDraft(saved), _key: key } : d)),
    );
  }

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="text-sm text-slate-500">Loading selections…</div>
      </main>
    );
  }

  if (missing || !meta) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <p className="text-4xl">🎨</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">
          Selections not available
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          This link may have expired. Reach out to the builder for an updated one.
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
            Designer selections
          </div>
          <div className="mt-0.5 text-base font-semibold text-slate-900">
            {meta.project_name}
          </div>
          <div className="pb-3 text-xs text-slate-500">
            for {meta.builder_name || "your builder"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <p className="mb-4 text-sm text-slate-600">
          Curate the options for each selection — add products with a
          description, cost, and photo. The builder reviews, then sends them to
          the homeowner to pick. Approved selections lock and can&apos;t be
          edited here.
        </p>

        {drafts.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
            <SwatchIcon className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              No selections yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
              Add the first selection to start curating options.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {drafts.map((d) => (
              <SelectionCard
                key={d._key}
                token={token}
                draft={d}
                onSaved={(saved) => replaceDraft(d._key, saved)}
              />
            ))}
          </ul>
        )}

        <button
          onClick={addDraft}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
        >
          <PlusIcon className="h-4 w-4" />
          Add selection
        </button>

        <footer className="mt-10 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] text-center text-xs text-slate-400">
          Questions? Contact {meta.builder_name || "your builder"}.
        </footer>
      </main>
    </div>
  );
}

function SelectionCard({
  token,
  draft,
  onSaved,
}: {
  token: string;
  draft: Draft;
  onSaved: (saved: ProjectSelection) => void;
}) {
  const locked =
    draft.status === "approved" || draft.status === "over_allowance";

  const [category, setCategory] = useState(draft.category);
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [allowance, setAllowance] = useState(draft.allowance);
  const [neededBy, setNeededBy] = useState(draft.needed_by || "");
  const [options, setOptions] = useState<SelectionOption[]>(draft.options);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addOption() {
    setOptions((prev) => [
      ...prev,
      { id: newOptionId(), label: "", description: "", cost: 0 },
    ]);
  }
  function updateOption(id: string, patch: Partial<SelectionOption>) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  function removeOption(id: string) {
    setOptions((prev) => prev.filter((o) => o.id !== id));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSavedMsg(false);
    try {
      const res = await fetch("/api/designer/save-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          selection: {
            id: draft.id,
            category,
            title,
            description,
            allowance,
            needed_by: neededBy || undefined,
            options,
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        selection?: ProjectSelection;
      };
      if (!res.ok || !data.ok || !data.selection) {
        setError(humanError(data.error));
        return;
      }
      onSaved(data.selection);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        {draft.number && (
          <span className="font-mono text-xs font-semibold text-slate-600">
            {draft.number}
          </span>
        )}
        {draft.status && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${SELECTION_STATUS_STYLES[draft.status]}`}
          >
            {SELECTION_STATUS_LABELS[draft.status]}
          </span>
        )}
        <span className="ml-auto text-xs font-semibold tabular-nums text-slate-600">
          {fmtMoney(allowance)} allowance
        </span>
      </div>

      {locked ? (
        <div className="space-y-2 px-4 py-4">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {description && <p className="text-xs text-slate-500">{description}</p>}
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
            This selection is approved and locked. Contact the builder to reopen it.
          </p>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SelectionCategory)}
                className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {SELECTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{SELECTION_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='e.g. "Kitchen Countertops"'
                className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this selection covers…"
              className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Allowance ($)
              </label>
              <input
                type="number"
                value={allowance}
                onChange={(e) => setAllowance(parseFloat(e.target.value) || 0)}
                className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Needed by</label>
              <input
                type="date"
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">
                Options ({options.length})
              </label>
              <button
                onClick={addOption}
                className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
              >
                <PlusIcon className="h-3 w-3" /> Add option
              </button>
            </div>
            {options.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-400">
                No options yet. Add the products the homeowner can choose from.
              </p>
            ) : (
              <div className="space-y-3">
                {options.map((opt) => {
                  const delta = opt.cost - allowance;
                  return (
                    <div key={opt.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <input
                                type="text"
                                value={opt.label}
                                onChange={(e) => updateOption(opt.id, { label: e.target.value })}
                                placeholder="Option name"
                                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                              />
                            </div>
                            <div>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1.5 text-sm text-slate-400">$</span>
                                <input
                                  type="number"
                                  value={opt.cost}
                                  onChange={(e) => updateOption(opt.id, { cost: parseFloat(e.target.value) || 0 })}
                                  className="w-full rounded-md border border-slate-300 py-1.5 pl-6 pr-2.5 text-sm tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                />
                              </div>
                              {allowance > 0 && (
                                <p className={`mt-0.5 text-[10px] font-semibold tabular-nums ${delta > 0 ? "text-orange-600" : delta < 0 ? "text-emerald-600" : "text-slate-400"}`}>
                                  {delta > 0 ? `+${fmtMoney(delta)} over` : delta < 0 ? `${fmtMoney(Math.abs(delta))} under` : "At allowance"}
                                </p>
                              )}
                            </div>
                          </div>
                          <input
                            type="text"
                            value={opt.description}
                            onChange={(e) => updateOption(opt.id, { description: e.target.value })}
                            placeholder="Description…"
                            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                          <input
                            type="url"
                            value={opt.image_url || ""}
                            onChange={(e) => updateOption(opt.id, { image_url: e.target.value })}
                            placeholder="Image URL (optional)"
                            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                        <button
                          onClick={() => removeOption(opt.id)}
                          className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            {savedMsg && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <CheckCircleIcon className="h-4 w-4" /> Saved
              </span>
            )}
            <button
              onClick={save}
              disabled={saving || !title.trim()}
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
            >
              {saving ? "Saving…" : draft.id ? "Save changes" : "Save selection"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function humanError(code?: string): string {
  switch (code) {
    case "token_not_found":
      return "This link has expired. Reach out to the builder.";
    case "locked":
      return "This selection is approved and locked — contact the builder to reopen it.";
    case "wrong_project":
      return "That selection belongs to a different project.";
    case "not_configured":
      return "Saving is temporarily unavailable. Try again later.";
    default:
      return "Couldn't save — try again.";
  }
}
