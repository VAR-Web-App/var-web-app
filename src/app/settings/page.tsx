"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { OrgSettings } from "@/types";
import { getSettings, saveSettings } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import AssemblyCostOverridesCard from "@/components/assembly-cost-overrides-card";
import GCPushOptIn from "@/components/gc-push-opt-in";
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

          <Card
            title="Instant alerts (push notifications)"
            subtitle="Get notified the moment a sub flags a conflict, submits a bid, or hits any other alert. Per-device — enable on each phone or computer you want pinged."
          >
            <GCPushOptIn
              settings={settings}
              onChange={(next) => {
                setSettings(next);
                // Persist immediately — subscriptions are useless
                // until they're written to Firestore (the server
                // reads from there to dispatch pushes). Don't make
                // the user remember to click Save below.
                void saveSettings(next);
              }}
            />
          </Card>

          <Card
            title="Reset app cache"
            subtitle="Clears stored data on this device and reloads. Use if the app feels stuck on an old version after an update, or if push notifications won't enable. Your projects, photos, and settings stay safe in the cloud."
          >
            <ResetCacheButton />
          </Card>

          <Card
            title="Invoice template"
            subtitle="Brand and customize the draw-request / invoice document. Add your logo, your lender's loan number, payment terms, and pick which sections show on each draw."
          >
            <InvoiceTemplateEditor
              value={settings.invoice_template}
              onChange={(next) => setSettings({ ...settings, invoice_template: next })}
            />
          </Card>

          <Card
            title="Assembly cost overrides"
            subtitle="Tune the stock catalog's pricing to your local market. Multipliers apply to every estimate you build — material × scales the unit cost, labor × scales install time. Set 1.00 = unchanged."
          >
            <AssemblyCostOverridesCard
              value={settings.cost_overrides}
              onChange={(next) => setSettings({ ...settings, cost_overrides: next })}
            />
          </Card>

          <div className="flex items-center justify-end gap-3">
            {savedAt && (
              <span className="text-xs text-emerald-600">✓ Saved</span>
            )}
            <button
              onClick={onSave}
              className="rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800"
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

function InvoiceTemplateEditor({
  value,
  onChange,
}: {
  value: OrgSettings["invoice_template"];
  onChange: (next: OrgSettings["invoice_template"]) => void;
}) {
  const v = value ?? {};
  const patch = (p: Partial<NonNullable<OrgSettings["invoice_template"]>>) =>
    onChange({ ...v, ...p });

  // Section toggles default ON; an explicit `false` opts out. The
  // `?? true` keeps existing draws looking identical for orgs that
  // never touch this card.
  const showCO = v.show_change_orders ?? true;
  const showSOV = v.show_schedule_of_values ?? true;
  const showOwner = v.show_owner_signature ?? true;
  const showSubs = v.show_subs_on_phase ?? true;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-medium text-slate-700">Default template</div>
        <div className="mt-1.5 inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => patch({ default_template: "aia" })}
            className={`rounded px-3 py-1.5 transition ${
              (v.default_template ?? "aia") === "aia"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            AIA G702 (detailed)
          </button>
          <button
            type="button"
            onClick={() => patch({ default_template: "simple" })}
            className={`rounded px-3 py-1.5 transition ${
              v.default_template === "simple"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Simple invoice
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Per-draw override still available from the draw page toolbar.
        </p>
      </div>

      <Input
        label="Logo URL"
        placeholder="https://example.com/logo.png"
        value={v.logo_url ?? ""}
        onChange={(val) => patch({ logo_url: val })}
      />

      <TextArea
        label="Lender / loan info (shown in invoice header)"
        rows={2}
        value={v.loan_info ?? ""}
        onChange={(val) => patch({ loan_info: val })}
      />

      <TextArea
        label="Payment terms"
        rows={3}
        value={v.payment_terms ?? ""}
        onChange={(val) => patch({ payment_terms: val })}
      />

      <TextArea
        label="Custom certification text (AIA template — blank = use standard)"
        rows={4}
        value={v.certification_text ?? ""}
        onChange={(val) => patch({ certification_text: val })}
      />

      <div>
        <div className="text-xs font-medium text-slate-700">Sections to include</div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Toggle label="Subs on phase" checked={showSubs} onChange={(c) => patch({ show_subs_on_phase: c })} />
          <Toggle label="Approved change orders" checked={showCO} onChange={(c) => patch({ show_change_orders: c })} />
          <Toggle label="Schedule of values (AIA)" checked={showSOV} onChange={(c) => patch({ show_schedule_of_values: c })} />
          <Toggle label="Owner's approval signature" checked={showOwner} onChange={(c) => patch({ show_owner_signature: c })} />
          <Toggle
            label="Notary block (AIA, sworn pay app)"
            checked={v.show_notary_block ?? false}
            onChange={(c) => patch({ show_notary_block: c })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          type="number"
          label="Retainage % (lender hold-back per draw)"
          value={String(v.retainage_percent ?? 0)}
          onChange={(val) =>
            patch({ retainage_percent: Math.max(0, Math.min(100, parseFloat(val) || 0)) })
          }
        />
        <div className="text-[11px] leading-relaxed text-slate-500 sm:pt-7">
          Set 0 to disable. 10% is the residential standard. When set,
          the AIA invoice renders the full G702 9-line summary with
          retainage split (5a / 5b) and reduces the &ldquo;Current Payment
          Due&rdquo; by this draw&apos;s retainage portion.
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-600"
      />
      {label}
    </label>
  );
}

function ResetCacheButton() {
  const [busy, setBusy] = useState(false);
  async function reset() {
    if (!confirm("Reload the app with a fresh cache?")) return;
    setBusy(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      window.location.reload();
    } catch (e) {
      console.warn("[reset-cache]", e);
      window.location.reload();
    }
  }
  return (
    <button
      type="button"
      onClick={() => void reset()}
      disabled={busy}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      {busy ? "Clearing…" : "Clear cache & reload"}
    </button>
  );
}
