"use client";

// Public, no-login homeowner portal at /portal/{token}. Read-only project view
// + approve draws and approve/reject change orders. All data + writes go
// through /api/portal/* (admin, token-verified) — the homeowner never signs in.

import { use, useCallback, useEffect, useState } from "react";
import {
  CheckCircleIcon,
  ClockIcon,
  CurrencyDollarIcon,
  HomeModernIcon,
} from "@heroicons/react/24/outline";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

interface Milestone {
  id: string; name: string; order: number; status: string;
  percentage: number; amount: number;
  planned_start_date: string | null; planned_end_date: string | null; approved_at: string | null;
}
interface ChangeOrder {
  id: string; number: string; title: string; description: string;
  amount_delta: number; schedule_impact_days: number; status: string; rejection_reason: string | null;
}
interface SelOption { id: string; label: string; description: string; cost: number; image_url: string | null; }
interface Selection {
  id: string; number: string; title: string; description: string;
  allowance: number; status: string; selected_option_id: string | null; options: SelOption[];
}
interface PortalData {
  project: { name: string; builder_name: string; client_name: string };
  contract_value: number;
  milestones: Milestone[];
  change_orders: ChangeOrder[];
  selections: Selection[];
}

export default function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sig, setSig] = useState<Record<string, string>>({});
  const [pickedOpt, setPickedOpt] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/data?token=${encodeURIComponent(token)}`);
      const j = (await res.json()) as { ok: boolean } & PortalData;
      if (!j.ok) setMissing(true);
      else setData(j);
    } catch { setMissing(true); }
    finally { setLoaded(true); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function act(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/portal/action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...payload }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!j.ok) alert(j.error === "already_approved" || j.error === "already_decided"
        ? "That was already decided — refreshing." : "Something went wrong. Please try again.");
      await load();
    } finally { setBusy(null); }
  }

  if (!loaded) {
    return <Center>Loading your project…</Center>;
  }
  if (missing || !data) {
    return (
      <Center>
        <p className="text-4xl">🏡</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Project not available</h1>
        <p className="mt-2 text-sm text-slate-600">This link may have expired. Reach out to your builder for an updated one.</p>
      </Center>
    );
  }

  const { project, milestones, change_orders, contract_value, selections } = data;
  const pendingCos = change_orders.filter((c) => c.status === "sent");
  const decidedCos = change_orders.filter((c) => c.status === "approved" || c.status === "rejected");
  const openSelections = selections.filter((s) => s.status === "sent");
  const pickedSelections = selections.filter((s) => s.status === "approved" || s.status === "over_allowance");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700">
            <HomeModernIcon className="h-4 w-4" /> Your build
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{project.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">by {project.builder_name || "your builder"}</p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800">
            <CurrencyDollarIcon className="h-4 w-4" /> Contract: {money(contract_value)}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6">
        {/* Change orders needing a decision */}
        {pendingCos.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Needs your decision</h2>
            <ul className="space-y-3">
              {pendingCos.map((co) => (
                <li key={co.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-900">{co.number} · {co.title}</span>
                    <span className={`font-semibold tabular-nums ${co.amount_delta >= 0 ? "text-slate-900" : "text-emerald-700"}`}>
                      {co.amount_delta >= 0 ? "+" : ""}{money(co.amount_delta)}
                    </span>
                  </div>
                  {co.description && <p className="mt-1 text-sm text-slate-600">{co.description}</p>}
                  {co.schedule_impact_days !== 0 && (
                    <p className="mt-1 text-xs text-slate-500">Schedule impact: {co.schedule_impact_days > 0 ? "+" : ""}{co.schedule_impact_days} days</p>
                  )}
                  <div className="mt-3 space-y-2">
                    <input
                      value={sig[co.id] ?? ""}
                      onChange={(e) => setSig((s) => ({ ...s, [co.id]: e.target.value }))}
                      placeholder="Type your full name to approve"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={busy === co.id || !(sig[co.id]?.trim())}
                        onClick={() => act({ action: "approve_co", coId: co.id, signature: sig[co.id] }, co.id)}
                        className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-300"
                      >
                        {busy === co.id ? "Working…" : "Approve"}
                      </button>
                      <button
                        disabled={busy === co.id}
                        onClick={() => { const r = prompt(`Reject "${co.title}"? Optional reason:`); if (r !== null) void act({ action: "reject_co", coId: co.id, reason: r }, co.id); }}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Selections to pick */}
        {openSelections.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Choose your selections</h2>
            <ul className="space-y-3">
              {openSelections.map((sel) => {
                const chosen = pickedOpt[sel.id];
                return (
                  <li key={sel.id} className="rounded-xl border border-sky-200 bg-white p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-slate-900">{sel.number} · {sel.title}</span>
                      <span className="text-xs text-slate-500">Allowance: {money(sel.allowance)}</span>
                    </div>
                    {sel.description && <p className="mt-1 text-sm text-slate-600">{sel.description}</p>}
                    <div className="mt-3 space-y-2">
                      {sel.options.map((o) => {
                        const over = o.cost - sel.allowance;
                        const active = chosen === o.id;
                        return (
                          <button
                            key={o.id}
                            onClick={() => setPickedOpt((p) => ({ ...p, [sel.id]: o.id }))}
                            className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left ${active ? "border-sky-500 bg-sky-50 ring-1 ring-sky-300" : "border-slate-200 hover:bg-slate-50"}`}
                          >
                            <span className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border ${active ? "border-sky-600 bg-sky-600" : "border-slate-300"}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-slate-900">{o.label}</span>
                              {o.description && <span className="block text-xs text-slate-500">{o.description}</span>}
                            </span>
                            <span className="text-right text-sm">
                              <span className="block font-semibold tabular-nums text-slate-900">{money(o.cost)}</span>
                              {over !== 0 && (
                                <span className={`block text-[11px] font-medium ${over > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                                  {over > 0 ? `+${money(over)} over` : `${money(Math.abs(over))} under`}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {chosen && (
                      <div className="mt-3 space-y-2">
                        {sel.options.find((o) => o.id === chosen)!.cost > sel.allowance && (
                          <p className="rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-800">
                            This is over your allowance — approving adds a change order for the difference.
                          </p>
                        )}
                        <input
                          value={sig[sel.id] ?? ""}
                          onChange={(e) => setSig((s) => ({ ...s, [sel.id]: e.target.value }))}
                          placeholder="Type your full name to confirm"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                        <button
                          disabled={busy === sel.id || !(sig[sel.id]?.trim())}
                          onClick={() => act({ action: "pick_selection", selectionId: sel.id, optionId: chosen, signature: sig[sel.id] }, sel.id)}
                          className="w-full rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:bg-sky-300"
                        >
                          {busy === sel.id ? "Working…" : "Confirm selection"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Draws / phases */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Project phases & draws</h2>
          <ul className="space-y-2">
            {milestones.map((m) => {
              const done = m.status === "approved" || m.status === "released";
              const awaiting = m.status === "awaiting_approval";
              return (
                <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    {done ? <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-emerald-600" />
                      : <ClockIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />}
                    <span className="flex-1 font-medium text-slate-900">{m.name}</span>
                    <span className="text-sm tabular-nums text-slate-500">{m.percentage}% · {money(m.amount)}</span>
                  </div>
                  {awaiting && (
                    <div className="mt-3 space-y-2 rounded-lg bg-sky-50 p-3">
                      <p className="text-sm font-medium text-sky-900">This phase is complete. Approve it to authorize your builder to release the {money(m.amount)} draw payment.</p>
                      <input
                        value={sig[m.id] ?? ""}
                        onChange={(e) => setSig((s) => ({ ...s, [m.id]: e.target.value }))}
                        placeholder="Type your full name to approve"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <button
                        disabled={busy === m.id || !(sig[m.id]?.trim())}
                        onClick={() => act({ action: "approve_draw", milestoneId: m.id, signature: sig[m.id] }, m.id)}
                        className="w-full rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:bg-sky-300"
                      >
                        {busy === m.id ? "Working…" : `Approve draw · ${money(m.amount)}`}
                      </button>
                    </div>
                  )}
                  {done && m.approved_at && (
                    <p className="mt-1 pl-7 text-xs text-emerald-700">Approved {new Date(m.approved_at).toLocaleDateString()}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Decided change orders (history) */}
        {decidedCos.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Change order history</h2>
            <ul className="space-y-1.5">
              {decidedCos.map((co) => (
                <li key={co.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="flex-1 truncate text-slate-700">{co.number} · {co.title}</span>
                  <span className="tabular-nums text-slate-500">{co.amount_delta >= 0 ? "+" : ""}{money(co.amount_delta)}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${co.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                    {co.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pickedSelections.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Your selections</h2>
            <ul className="space-y-1.5">
              {pickedSelections.map((s) => {
                const opt = s.options.find((o) => o.id === s.selected_option_id);
                return (
                  <li key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                    <span className="flex-1 truncate text-slate-700">{s.title}: <span className="font-medium">{opt?.label ?? "—"}</span></span>
                    {opt && <span className="tabular-nums text-slate-500">{money(opt.cost)}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <footer className="pb-8 pt-4 text-center text-xs text-slate-400">
          Questions? Contact {project.builder_name || "your builder"}.
        </footer>
      </main>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-slate-50 px-6 text-center">
      {children}
    </main>
  );
}
