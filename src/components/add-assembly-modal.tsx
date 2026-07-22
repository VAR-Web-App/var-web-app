"use client";

import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import AssemblyForm, { type AssemblyFormState } from "@/components/assembly-form";
import type {
  AssemblyInstance,
  AssemblyMaterialLine,
} from "@/types/assembly";

export interface AddAssemblyResult {
  /** New persistent instance — gets stored on the Deal and tags its derived lines. */
  instance: AssemblyInstance;
  /** Material lines computed from the instance, ready to become QuoteLines. */
  materials: AssemblyMaterialLine[];
}

/**
 * Modal that wraps the AssemblyForm with a phase label input + confirm.
 * Confirming hands the parent a fully-formed materials breakdown to
 * append to the active quote.
 */
export default function AddAssemblyModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: AddAssemblyResult) => void;
}) {
  const [state, setState] = useState<AssemblyFormState | null>(null);
  const [instanceLabel, setInstanceLabel] = useState<string>("");
  const [labelEdited, setLabelEdited] = useState(false);

  // Auto-fill the label from the assembly name until the user edits it.
  useEffect(() => {
    if (!state) return;
    if (!labelEdited) setInstanceLabel(state.assembly.name);
  }, [state, labelEdited]);

  // Reset when the modal closes/reopens so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setState(null);
      setInstanceLabel("");
      setLabelEdited(false);
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canConfirm =
    !!state && state.result.lines.length > 0 && !state.result.error;

  function handleConfirm() {
    if (!state || !canConfirm) return;
    const label = instanceLabel.trim() || state.assembly.name;
    const newId = () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // New instances start with one variant — the configuration the user
    // just set up. Additional variants get added later from the card UI.
    const variantId = newId();
    const instance: AssemblyInstance = {
      id: newId(),
      instanceLabel: label,
      variants: [
        {
          id: variantId,
          label: state.assembly.name,
          assemblyId: state.assembly.id,
          propertyValues: Object.entries(state.propertyValues).map(
            ([name, value]) => ({ name, value }),
          ),
        },
      ],
      activeVariantId: variantId,
    };
    onConfirm({ instance, materials: state.result.lines });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Add assembly
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Pick an assembly, set its properties, and add the materials to
              the quote.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        {/* Body */}
        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Phase label
            </span>
            <input
              type="text"
              value={instanceLabel}
              onChange={(e) => {
                setLabelEdited(true);
                setInstanceLabel(e.target.value);
              }}
              placeholder="e.g. North Wall, Garage Foundation"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Goes into each derived line&apos;s Phase column — useful for grouping
              and matching draws.
            </span>
          </label>

          <AssemblyForm onChange={setState} compact />
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-xs text-slate-500">
            {state ? state.result.lines.length : 0} material line
            {state && state.result.lines.length === 1 ? "" : "s"}
            {state ? ` · $${state.result.total.toFixed(2)} subtotal` : ""}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Add to quote
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
