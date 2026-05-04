"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { OrgSettings } from "@/types";
import { getSettings, saveSettings } from "@/lib/store";
import { Input, TextArea } from "../accounts/page";

export default function SettingsPage() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => setSettings(getSettings()), []);

  if (!settings) {
    return (
      <AppShell>
        <div className="text-sm text-slate-500">Loading…</div>
      </AppShell>
    );
  }

  function onSave() {
    if (!settings) return;
    saveSettings(settings);
    setSavedAt(Date.now());
    window.setTimeout(() => setSavedAt(null), 2000);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Org-level info, pricing defaults, and quote-document fields. Used to populate quotes
            and POs throughout the app.
          </p>
        </div>

        <section className="space-y-6">
          <Card title="Company info" subtitle="Used in quote and PO headers, email signatures.">
            <div className="space-y-4">
              <Input label="Company name" value={settings.company_name} onChange={(v) => setSettings({ ...settings, company_name: v })} />
              <TextArea label="Address" value={settings.company_address} onChange={(v) => setSettings({ ...settings, company_address: v })} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Phone" value={settings.company_phone} onChange={(v) => setSettings({ ...settings, company_phone: v })} />
                <Input label="Email" value={settings.company_email} onChange={(v) => setSettings({ ...settings, company_email: v })} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input label="CAGE Code" value={settings.cage_code} onChange={(v) => setSettings({ ...settings, cage_code: v })} />
                <Input label="DUNS" value={settings.duns} onChange={(v) => setSettings({ ...settings, duns: v })} />
                <Input label="SAM ID" value={settings.sam_id} onChange={(v) => setSettings({ ...settings, sam_id: v })} />
              </div>
            </div>
          </Card>

          <Card title="Pricing defaults" subtitle="Applied automatically to imported lines.">
            <div className="grid grid-cols-2 gap-4">
              <Input
                type="number"
                label="Default blanket discount %"
                value={String(settings.default_blanket_discount_percent)}
                onChange={(v) => setSettings({ ...settings, default_blanket_discount_percent: parseFloat(v) || 0 })}
              />
              <Input
                type="number"
                label="Default markup %"
                value={String(settings.default_markup_percent)}
                onChange={(v) => setSettings({ ...settings, default_markup_percent: parseFloat(v) || 0 })}
              />
            </div>
          </Card>

          <Card title="App defaults" subtitle="Pre-fills on new deals and customer quote exports.">
            <div className="space-y-4">
              <Input
                label="Default manufacturer"
                value={settings.default_manufacturer}
                onChange={(v) => setSettings({ ...settings, default_manufacturer: v })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Quotes prepared by" value={settings.prepared_by_name} onChange={(v) => setSettings({ ...settings, prepared_by_name: v })} />
                <Input label="Phone (on quotes)" value={settings.prepared_by_phone} onChange={(v) => setSettings({ ...settings, prepared_by_phone: v })} />
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-end gap-3">
            {savedAt && (
              <span className="text-xs text-emerald-600">✓ Saved</span>
            )}
            <button
              onClick={onSave}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
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
