"use client";

// Reusable typed-name e-signature modal. Used for:
//   - Customer portal draw approval
//   - Customer portal change-order approval
//
// Compliance note: under E-SIGN Act and UETA, a typed name + clear
// intent indicator (the checkbox here) + record retention (we save
// timestamp + signed_by) is sufficient for legally binding electronic
// signature in the U.S. for construction draw + change-order approvals.

import { useState } from "react";
import {
  CheckBadgeIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export interface SignatureResult {
  signature: string;
  signed_at: string;
}

export default function SignatureModal({
  title,
  amountLabel,
  amountValue,
  intentText,
  defaultName,
  ctaLabel = "Sign & approve",
  busy,
  onSign,
  onClose,
}: {
  /** Header — e.g. "Approve Foundation Draw" */
  title: string;
  /** Optional money label (e.g. "Draw amount"). */
  amountLabel?: string;
  amountValue?: string;
  /** The intent statement the user is checking. Should be specific:
   *  "I authorize the $145,000 Foundation draw to be released." */
  intentText: string;
  /** Pre-fill the signature field (e.g. with the client's name). */
  defaultName?: string;
  ctaLabel?: string;
  busy?: boolean;
  onSign: (result: SignatureResult) => Promise<void> | void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName || "");
  const [intent, setIntent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim() || !intent || submitting) return;
    setSubmitting(true);
    try {
      await onSign({
        signature: name.trim(),
        signed_at: new Date().toISOString(),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const isBusy = busy || submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {amountLabel && amountValue && (
            <div className="rounded-md bg-sky-50 p-3 ring-1 ring-sky-200">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
                {amountLabel}
              </div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
                {amountValue}
              </div>
            </div>
          )}

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Type your full legal name to sign
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              autoFocus
            />
            {name.trim() && (
              <p className="mt-1.5 font-cursive text-2xl italic text-sky-800" style={{ fontFamily: "Brush Script MT, cursive" }}>
                {name.trim()}
              </p>
            )}
          </label>

          <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={intent}
              onChange={(e) => setIntent(e.target.checked)}
              className="mt-0.5 rounded text-sky-600 focus:ring-sky-500"
            />
            <span>
              {intentText}{" "}
              <span className="text-slate-500">
                I understand my typed name above is the legal equivalent of my handwritten signature.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            onClick={onClose}
            disabled={isBusy}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || !intent || isBusy}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            <CheckBadgeIcon className="h-4 w-4" />
            {isBusy ? "Signing…" : ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
