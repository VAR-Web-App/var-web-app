"use client";

// First-run onboarding walkthrough. Shows once per org (until
// settings.onboarding_done is set) right after account creation. Step 1 is
// branding by design — the company name, logo, contact info, and license #
// are what every client-facing surface (proposals, portal, emails, SMS) is
// stamped with, so we capture them before the builder does anything else.

import { useState } from "react";
import {
  BuildingOffice2Icon,
  RectangleStackIcon,
  BellAlertIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { saveSettings } from "@/lib/store";
import type { OrgSettings } from "@/types";

const STEPS = ["Brand", "Workspace", "Done"] as const;

export default function OnboardingWizard({
  initial,
  onClose,
}: {
  initial: OrgSettings;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [s, setS] = useState<OrgSettings>(initial);
  const [saving, setSaving] = useState(false);

  const patch = (p: Partial<OrgSettings>) => setS((prev) => ({ ...prev, ...p }));
  const setLogo = (url: string) =>
    setS((prev) => ({
      ...prev,
      invoice_template: { ...(prev.invoice_template ?? {}), logo_url: url },
    }));

  async function persist(done: boolean) {
    setSaving(true);
    try {
      await saveSettings(done ? { ...s, onboarding_done: true } : s);
    } catch {
      /* never block the user on a save hiccup — they can edit in Settings */
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    await persist(false);
    setStep((n) => Math.min(n + 1, STEPS.length - 1));
  }
  async function finishOrSkip() {
    await persist(true);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden>
              <circle cx="32" cy="32" r="32" fill="#0369a1" />
              <path
                d="M18 40 L32 24 L46 40"
                stroke="#fff"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            <span className="text-sm font-bold tracking-tight text-slate-900">
              Welcome to KeystonePro
            </span>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full ${
                  i <= step ? "bg-sky-600" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <div className="space-y-4">
              <Heading
                icon={<BuildingOffice2Icon className="h-5 w-5 text-sky-700" />}
                title="Brand your business"
                sub="This is what your clients see on every proposal, portal page, email, and text. Takes a minute."
              />
              <Field label="Business name">
                <input
                  value={s.company_name}
                  onChange={(e) => patch({ company_name: e.target.value })}
                  placeholder="Maddox Custom Homes"
                  className={inputCls}
                />
              </Field>
              <Field label="Logo URL" hint="A public link to your logo (shown on proposals & draws).">
                <input
                  value={s.invoice_template?.logo_url ?? ""}
                  onChange={(e) => setLogo(e.target.value)}
                  placeholder="https://yoursite.com/logo.png"
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Business phone">
                  <input
                    value={s.company_phone}
                    onChange={(e) => patch({ company_phone: e.target.value })}
                    placeholder="(210) 555-0142"
                    className={inputCls}
                  />
                </Field>
                <Field label="Business email" hint="Replies from clients land here.">
                  <input
                    value={s.company_email}
                    onChange={(e) => patch({ company_email: e.target.value })}
                    placeholder="you@yourco.com"
                    className={inputCls}
                  />
                </Field>
              </div>
              <Field label="Contractor license #" hint="Shown on contracts & proposals where required.">
                <input
                  value={s.cage_code}
                  onChange={(e) => patch({ cage_code: e.target.value })}
                  placeholder="e.g. TX-123456"
                  className={inputCls}
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Heading
                icon={<RectangleStackIcon className="h-5 w-5 text-sky-700" />}
                title="Your workspace"
                sub="Three places you'll live in day to day."
              />
              <ul className="space-y-3">
                <Bullet title="Projects" body="Your pipeline from lead to closeout. Create a project, or click “Try with sample data” to explore a fully-loaded example first." />
                <Bullet title="Inbox" body="Everything waiting on you across all projects — bids to award, draws to approve, change orders out for signature." />
                <Bullet title="Subs & Suppliers" body="Your trade roster. Invite bids and assign crews to phases from here." />
              </ul>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Heading
                icon={<CheckCircleIcon className="h-5 w-5 text-emerald-600" />}
                title="You're set"
                sub="Your branding is live on every client-facing surface. Two quick things to finish in Settings when you're ready:"
              />
              <ul className="space-y-3">
                <Bullet
                  icon={<BellAlertIcon className="h-4 w-4 text-sky-700" />}
                  title="Turn on notifications"
                  body="Settings → enable Instant alerts to get a push when a client signs or a payment lands."
                />
                <Bullet
                  icon={<BuildingOffice2Icon className="h-4 w-4 text-sky-700" />}
                  title="Invite your team"
                  body="Settings → Team to bring teammates into this workspace."
                />
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button
            onClick={finishOrSkip}
            disabled={saving}
            className="text-xs font-medium text-slate-400 hover:text-slate-600"
          >
            {step === STEPS.length - 1 ? "" : "Skip for now"}
          </button>
          <button
            onClick={step === STEPS.length - 1 ? finishOrSkip : next}
            disabled={saving}
            className="rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : step === 0
                ? "Save & continue"
                : step === STEPS.length - 1
                  ? "Finish"
                  : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

function Heading({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{sub}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function Bullet({
  icon,
  title,
  body,
}: {
  icon?: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mt-0.5 shrink-0">
        {icon ?? <RectangleStackIcon className="h-4 w-4 text-sky-700" />}
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{body}</div>
      </div>
    </li>
  );
}
