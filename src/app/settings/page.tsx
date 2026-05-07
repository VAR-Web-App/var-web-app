"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { OrgSettings } from "@/types";
import { getSettings, saveSettings } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { Input, TextArea } from "../accounts/page";

const DEFAULT_SETTINGS = (orgRef: string): OrgSettings => ({
  org_ref: orgRef,
  company_name: "",
  company_address: "",
  company_phone: "",
  company_email: "",
  // Builder repurpose: the federal-contractor identifier fields are
  // reused for builder-side license/registration fields. Schema names
  // are kept for compatibility; UI labels remap them.
  cage_code: "",     // → State Contractor License #
  duns: "",          // → EIN (or business reg #)
  sam_id: "",        // → Local business license #
  default_blanket_discount_percent: 0,  // not used by builders; kept zero
  default_markup_percent: 15,           // typical mid-grade builder markup
  default_manufacturer: "Custom Home",  // → default project type
  prepared_by_name: "",
  prepared_by_phone: "",
});

export default function SettingsPage() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;
    getSettings(profile.org_ref).then((s) =>
      setSettings(s ?? DEFAULT_SETTINGS(profile.org_ref)),
    );
  }, [profile]);

  if (!settings) {
    return (
      <AppShell>
        <div className="text-sm text-slate-500">Loading…</div>
      </AppShell>
    );
  }

  async function onSave() {
    if (!settings) return;
    await saveSettings(settings);
    setSavedAt(Date.now());
    window.setTimeout(() => setSavedAt(null), 2000);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your business info and defaults. Used to populate estimates, draw requests,
            and customer-facing pages throughout the app.
          </p>
        </div>

        <section className="space-y-6">
          <Card title="Business info" subtitle="Used on estimate and draw-request headers, the customer portal, and email signatures.">
            <div className="space-y-4">
              <Input label="Business name" value={settings.company_name} onChange={(v) => setSettings({ ...settings, company_name: v })} />
              <TextArea label="Address" value={settings.company_address} onChange={(v) => setSettings({ ...settings, company_address: v })} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Phone" value={settings.company_phone} onChange={(v) => setSettings({ ...settings, company_phone: v })} />
                <Input label="Email" value={settings.company_email} onChange={(v) => setSettings({ ...settings, company_email: v })} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input label="State License #" value={settings.cage_code} onChange={(v) => setSettings({ ...settings, cage_code: v })} />
                <Input label="EIN" value={settings.duns} onChange={(v) => setSettings({ ...settings, duns: v })} />
                <Input label="Local License #" value={settings.sam_id} onChange={(v) => setSettings({ ...settings, sam_id: v })} />
              </div>
            </div>
          </Card>

          <Card title="Estimate defaults" subtitle="Applied to new line items so you don't have to set markup every time.">
            <div className="grid grid-cols-1 gap-4">
              <Input
                type="number"
                label="Default markup %"
                value={String(settings.default_markup_percent)}
                onChange={(v) => setSettings({ ...settings, default_markup_percent: parseFloat(v) || 0 })}
              />
            </div>
          </Card>

          <Card title="Project defaults" subtitle="Pre-fills on new projects and the estimate document.">
            <div className="space-y-4">
              <Input
                label="Default project type"
                value={settings.default_manufacturer}
                onChange={(v) => setSettings({ ...settings, default_manufacturer: v })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Estimates prepared by" value={settings.prepared_by_name} onChange={(v) => setSettings({ ...settings, prepared_by_name: v })} />
                <Input label="Phone (on estimates)" value={settings.prepared_by_phone} onChange={(v) => setSettings({ ...settings, prepared_by_phone: v })} />
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-end gap-3">
            {savedAt && (
              <span className="text-xs text-emerald-600">✓ Saved</span>
            )}
            <button
              onClick={onSave}
              className="rounded-md bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Save changes
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}
