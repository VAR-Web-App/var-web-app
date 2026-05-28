"use client";

// Draw request page — bank-ready document the GC sends to the homeowner
// (and they forward to their construction lender). Modeled loosely on
// AIA G702 / G703 — Application & Certificate for Payment + Schedule of
// Values — which is what most residential construction lenders expect.
//
// Optimized for browser-native print: the GC opens this page, hits
// Print → Save as PDF, gets a clean PDF that beats a QuickBooks
// screenshot. No PDF generation library needed for v1.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  PrinterIcon,
  EnvelopeIcon,
  CloudArrowUpIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";
import { Deal, Distributor, OrgSettings } from "@/types";
import { ProjectMilestone, ProjectChangeOrder, MILESTONE_STATUS_LABELS } from "@/types/builder";
import {
  getDeal,
  getSettings,
  listMilestones,
  listDistributors,
  saveMilestone,
  listChangeOrders,
  effectiveContractValue,
} from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import DrawAttachmentsSection from "@/components/draw-attachments-section";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DrawRequestPage({
  params,
}: {
  params: Promise<{ id: string; milestoneId: string }>;
}) {
  const { id, milestoneId } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [subs, setSubs] = useState<Distributor[]>([]);
  const [changeOrders, setChangeOrders] = useState<ProjectChangeOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Template picker. "aia" = full AIA G702/G703 (lender-grade).
  // "simple" = minimal invoice for banks/clients who don't need the full
  // ceremony — single Phase row, totals, one signature line. Default is
  // pulled from OrgSettings.invoice_template.default_template once
  // settings load (initial render shows aia until then).
  const [template, setTemplate] = useState<"aia" | "simple">("aia");
  const [templateInited, setTemplateInited] = useState(false);

  // Sync the picker to the org's preferred default the first time
  // settings arrive. After that, user toggles are sticky for the session.
  useEffect(() => {
    if (!settings || templateInited) return;
    const def = settings.invoice_template?.default_template;
    if (def) setTemplate(def);
    setTemplateInited(true);
  }, [settings, templateInited]);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    async function load() {
      const d = await getDeal(id);
      if (!active) return;
      if (!d || d.org_ref !== profile!.org_ref) {
        router.replace("/deals");
        return;
      }
      const [m, s, subList, cos] = await Promise.all([
        listMilestones(id),
        getSettings(profile!.org_ref),
        listDistributors(profile!.org_ref),
        listChangeOrders(id),
      ]);
      if (!active) return;
      setDeal(d);
      setMilestones(m);
      setSettings(s);
      setSubs(subList);
      setChangeOrders(cos);
      setLoaded(true);
    }
    void load();
    return () => { active = false; };
  }, [id, milestoneId, profile, router]);

  if (!deal || !loaded) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-10 text-sm text-slate-500">
        Loading draw request…
      </div>
    );
  }

  const thisMs = milestones.find((m) => m.id === milestoneId);
  if (!thisMs) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          Milestone not found on this project.{" "}
          <Link href={`/deals/${id}`} className="font-semibold underline">
            Back to project
          </Link>
        </div>
      </div>
    );
  }

  const baseContract = deal.award_total > 0 ? deal.award_total : deal.total_quote_value;
  const approvedCoTotal = changeOrders
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + c.amount_delta, 0);
  const contractValue = effectiveContractValue(baseContract, changeOrders);

  // Build the "Schedule of Values" cumulative view through this milestone.
  const ordered = [...milestones].sort((a, b) => a.order - b.order);
  const thisIdx = ordered.findIndex((m) => m.id === milestoneId);
  const cumulativeBefore = ordered
    .slice(0, thisIdx)
    .filter((m) => m.status === "approved" || m.status === "released")
    .reduce((s, m) => s + m.amount, 0);
  const previouslyPaid = ordered
    .filter((m) => m.status === "released" && m.id !== milestoneId)
    .reduce((s, m) => s + (m.released_amount || m.amount), 0);
  const thisRequest = thisMs.amount;
  const totalApproved = cumulativeBefore + thisRequest;
  const remaining = Math.max(0, contractValue - totalApproved);
  const completionPercent = contractValue > 0 ? (totalApproved / contractValue) * 100 : 0;

  // Draw # = position of this milestone among non-pending milestones.
  const drawNumber = ordered.filter((m) => m.status !== "pending" && m.order <= thisMs.order).length;

  const date = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Resolve template config with sensible defaults so a fresh org with no
  // customization still gets the full document.
  const tpl = settings?.invoice_template ?? {};
  const showSubs = tpl.show_subs_on_phase ?? true;
  const showCO = tpl.show_change_orders ?? true;
  const showSOV = tpl.show_schedule_of_values ?? true;
  const showOwnerSig = tpl.show_owner_signature ?? true;
  const showNotary = tpl.show_notary_block ?? false;

  // Retainage math — AIA G702 lines 5a, 5b, 5, 6, 7, 8, 9. When
  // retainage % = 0, line 5/5a/5b are $0 and line 6 = line 4, line 8
  // = line 4 - line 7. Materials-stored retainage (5b) is always 0
  // until we track stored materials separately from work completed.
  const retainagePct = tpl.retainage_percent ?? 0;
  const retainageOnCompleted = totalApproved * (retainagePct / 100);
  const retainageOnStored = 0;
  const totalRetainage = retainageOnCompleted + retainageOnStored;
  const totalEarnedLessRetainage = totalApproved - totalRetainage;
  const currentPaymentDue = Math.max(0, totalEarnedLessRetainage - previouslyPaid);
  const balanceToFinishWithRetainage = contractValue - totalEarnedLessRetainage;

  async function pushToQuickBooks() {
    if (!deal || !thisMs) return;
    if (thisMs.qb_invoice_id) {
      if (!confirm(
        `This draw is already synced to QuickBooks as ${thisMs.qb_invoice_number}. Re-sync anyway?`
      )) return;
    }
    // Demo behavior: real QB sync is Q3 (OAuth flow + invoice push API).
    // For now, simulate the push so the workflow + UX shape are real.
    // Mock invoice number format matches QB's: INV-{4-digit}
    const mockNumber = `INV-${1000 + Math.floor(Math.random() * 9000)}`;
    const now = new Date().toISOString();
    const updated: ProjectMilestone = {
      ...thisMs,
      qb_invoice_id: `mock_${Date.now()}`,
      qb_invoice_number: mockNumber,
      qb_synced_at: now,
      updated_at: now,
    };
    setMilestones((prev) => prev.map((m) => (m.id === thisMs.id ? updated : m)));
    await saveMilestone(updated);
    alert(
      `Pushed to QuickBooks · ${mockNumber}\n\n` +
      `(Demo mode — your real QuickBooks integration ships Q3. ` +
      `When live, this creates an invoice on your QBO account using ` +
      `the customer mapping you set up in Settings.)`
    );
  }

  function emailToClient() {
    // Build a mailto: link with prefilled draw request notification +
    // portal link. GC forwards in their normal email client.
    if (!deal || !thisMs) return;
    const subject = `Draw Request #${drawNumber}: ${thisMs.name} — ${deal.name}`;
    const portalUrl = `${window.location.origin}/deals/${id}/portal`;
    const body = [
      `Hi,`,
      ``,
      `Draw Request #${drawNumber} is ready for your review on ${deal.name}:`,
      ``,
      `Phase: ${thisMs.name}`,
      `This draw: ${fmtMoney(thisRequest)} (${thisMs.percentage}% of contract)`,
      `Contract total: ${fmtMoney(contractValue)}`,
      `Project completion: ${completionPercent.toFixed(1)}%`,
      ``,
      `Review and approve here: ${portalUrl}`,
      ``,
      `Once approved, the formal draw request PDF (attached separately) can be submitted to your lender.`,
      ``,
      `Thanks,`,
      `${settings?.company_name || settings?.prepared_by_name || "Your builder"}`,
    ].join("\n");
    const href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toolbar — hidden on print */}
      <div className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <Link
            href={`/deals/${id}`}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to project
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs font-medium"
              role="group"
              aria-label="Invoice template"
            >
              <button
                type="button"
                onClick={() => setTemplate("aia")}
                className={`rounded px-3 py-1.5 transition ${
                  template === "aia"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="AIA G702 — lender-grade with full Schedule of Values and dual signatures"
              >
                AIA G702
              </button>
              <button
                type="button"
                onClick={() => setTemplate("simple")}
                className={`rounded px-3 py-1.5 transition ${
                  template === "simple"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Simple invoice — single phase, totals, one signature"
              >
                Simple Invoice
              </button>
            </div>
            {thisMs.qb_invoice_number ? (
              <button
                onClick={pushToQuickBooks}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                title={`Synced to QuickBooks as ${thisMs.qb_invoice_number}. Click to re-sync.`}
              >
                <CheckBadgeIcon className="h-4 w-4" />
                QB · {thisMs.qb_invoice_number}
              </button>
            ) : (
              <button
                onClick={pushToQuickBooks}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                title="Create a QuickBooks invoice from this draw"
              >
                <CloudArrowUpIcon className="h-4 w-4" />
                Push to QuickBooks
              </button>
            )}
            <button
              onClick={emailToClient}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              title="Open your email client with the draw request prefilled"
            >
              <EnvelopeIcon className="h-4 w-4" />
              Email to client
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
            >
              <PrinterIcon className="h-4 w-4" />
              Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      {/* Attachments — hidden on print; only the operator sees these on screen. */}
      <div className="mx-auto max-w-5xl px-6 pt-6 print:hidden">
        <DrawAttachmentsSection dealId={id} milestoneId={milestoneId} />
      </div>

      {/* Document */}
      <div className="mx-auto max-w-5xl px-6 py-10 print:px-0 print:py-0">
        <article className="rounded-lg border border-slate-200 bg-white p-10 shadow-sm print:rounded-none print:border-0 print:p-8 print:shadow-none">
          {/* Header */}
          <header className="border-b-2 border-slate-900 pb-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex items-start gap-4">
                {tpl.logo_url && (
                  // Branded header. The logo URL is whatever the GC pasted
                  // in Settings — public URL or data URI both work. Capped
                  // at 64px so a giant PNG doesn't blow up the layout.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tpl.logo_url}
                    alt=""
                    className="h-16 max-w-[180px] object-contain"
                  />
                )}
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    {template === "aia" ? "Application for Payment" : "Invoice"}
                  </h1>
                  <p className="mt-1 text-sm text-slate-600">
                    {template === "aia"
                      ? `Draw Request #${drawNumber} · Invoice #${drawNumber}`
                      : `Invoice #${drawNumber}`}
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-slate-600">
                <div>Date: <span className="font-medium text-slate-900">{date}</span></div>
                <div className="mt-0.5">Project: <span className="font-medium text-slate-900">{deal.name}</span></div>
                {deal.solicitation_number && (
                  <div className="mt-0.5">Job #: <span className="font-mono font-medium text-slate-900">{deal.solicitation_number}</span></div>
                )}
                {tpl.loan_info && (
                  // Lender-specified fields — loan #, borrower, draw # in
                  // the bank's format. Free-form so each org can match
                  // their lender's exact wording. Universal ask across
                  // every construction draw form we surveyed.
                  <div className="mt-1.5 whitespace-pre-line border-t border-slate-200 pt-1.5 text-slate-700">
                    {tpl.loan_info}
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Parties */}
          <section className="mt-6 grid grid-cols-2 gap-8">
            <Party
              label="From (Contractor)"
              name={settings?.company_name || settings?.prepared_by_name || "—"}
              address={settings?.company_address}
              phone={settings?.company_phone}
              email={settings?.company_email}
            />
            <Party
              label="To (Owner)"
              name={deal.account_name || "—"}
              address={deal.ship_to_address}
            />
          </section>

          {/* Project info */}
          {deal.ship_to_address && (
            <section className="mt-6 rounded-md bg-slate-50 px-4 py-3 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Project Address:{" "}
              </span>
              <span className="whitespace-pre-line text-slate-900">{deal.ship_to_address}</span>
            </section>
          )}

          {/* Subs on this phase */}
          {showSubs && thisMs.assigned_subs && thisMs.assigned_subs.length > 0 && (
            <section className="mt-3 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Subs on this phase:{" "}
              </span>
              <span className="text-slate-900">
                {thisMs.assigned_subs
                  .map((id) => subs.find((s) => s.id === id))
                  .filter(Boolean)
                  .map((s) => `${s!.name}${s!.account_number ? ` (${s!.account_number})` : ""}`)
                  .join(", ") || "—"}
              </span>
            </section>
          )}

          {/* Summary box — full AIA G702 9-line format in AIA mode, with
             retainage split when retainage % is configured. Simple mode
             gets a smaller 4-stat snapshot. */}
          {template === "aia" ? (
            <section className="mt-6 overflow-hidden rounded-lg border border-slate-300 bg-white">
              <header className="border-b border-slate-300 bg-slate-50 px-4 py-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Application & Certificate for Payment
                </h2>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Per AIA Document G702
                </p>
              </header>
              <table className="min-w-full text-xs">
                <tbody className="divide-y divide-slate-200">
                  <G702Line n="1" label="Original Contract Sum" value={baseContract} />
                  <G702Line n="2" label="Net Change by Change Orders" value={approvedCoTotal} signed />
                  <G702Line n="3" label="Contract Sum to Date (Line 1 ± 2)" value={contractValue} bold />
                  <G702Line n="4" label="Total Completed & Stored to Date" value={totalApproved} />
                  <G702Line
                    n="5a"
                    label={`Retainage on Completed Work (${retainagePct || 0}% of Line 4)`}
                    value={retainageOnCompleted}
                  />
                  <G702Line
                    n="5b"
                    label="Retainage on Stored Materials"
                    value={retainageOnStored}
                  />
                  <G702Line n="5" label="Total Retainage" value={totalRetainage} bold />
                  <G702Line
                    n="6"
                    label="Total Earned Less Retainage (Line 4 − 5)"
                    value={totalEarnedLessRetainage}
                    bold
                  />
                  <G702Line
                    n="7"
                    label="Less Previous Certificates for Payment"
                    value={previouslyPaid}
                  />
                  <G702Line
                    n="8"
                    label="CURRENT PAYMENT DUE (Line 6 − 7)"
                    value={currentPaymentDue}
                    accent
                  />
                  <G702Line
                    n="9"
                    label="Balance to Finish Including Retainage"
                    value={balanceToFinishWithRetainage}
                  />
                </tbody>
              </table>
              <footer className="border-t border-slate-300 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">
                Project: {completionPercent.toFixed(1)}% complete · This phase: {thisMs.name} ·
                Status: {MILESTONE_STATUS_LABELS[thisMs.status]}
              </footer>
            </section>
          ) : (
            <section className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm sm:grid-cols-4">
              <SummaryStat label="Contract Total" value={fmtMoney(contractValue)} />
              <SummaryStat label="Previously Paid" value={fmtMoney(previouslyPaid)} />
              <SummaryStat label="This Invoice" value={fmtMoney(thisRequest)} accent />
              <SummaryStat label="Balance After" value={fmtMoney(remaining)} />
            </section>
          )}

          {/* Approved Change Orders summary — included if any. AIA only;
             simple invoice rolls COs into the contract total instead.
             Org-level toggle can suppress this even on AIA. */}
          {template === "aia" && showCO && changeOrders.filter((c) => c.status === "approved").length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                Approved Change Orders
              </h2>
              <table className="mt-3 min-w-full text-xs">
                <thead className="border-y border-slate-300 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                  <tr>
                    <th className="px-2 py-2 text-left">CO #</th>
                    <th className="px-2 py-2 text-left">Description</th>
                    <th className="px-2 py-2 text-right">Schedule Δ</th>
                    <th className="px-2 py-2 text-right">Amount Δ</th>
                    <th className="px-2 py-2 text-left">Approved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {changeOrders
                    .filter((c) => c.status === "approved")
                    .map((co) => (
                      <tr key={co.id}>
                        <td className="px-2 py-1.5 font-mono">{co.number}</td>
                        <td className="px-2 py-1.5">{co.title}</td>
                        <td className="px-2 py-1.5 text-right">
                          {co.schedule_impact_days !== 0
                            ? `${co.schedule_impact_days > 0 ? "+" : ""}${co.schedule_impact_days}d`
                            : "—"}
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${co.amount_delta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {co.amount_delta >= 0 ? "+" : "−"}{fmtMoney(Math.abs(co.amount_delta))}
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-slate-500">
                          {co.approval_signature || "—"}
                          {co.approved_at && ` · ${new Date(co.approved_at).toLocaleDateString()}`}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Schedule of Values — AIA mode only, plus org toggle.
             The simple template renders a single-row table after this. */}
          {template === "aia" && showSOV && (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Schedule of Values
            </h2>
            <table className="mt-3 min-w-full text-xs">
              <thead className="border-y-2 border-slate-900 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                <tr>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Phase / Description</th>
                  <th className="px-2 py-2 text-right">Scheduled Value</th>
                  <th className="px-2 py-2 text-right">% of Contract</th>
                  <th className="px-2 py-2 text-right">Work Completed</th>
                  <th className="px-2 py-2 text-right">% Complete</th>
                  <th className="px-2 py-2 text-right">Balance to Finish</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {ordered.map((m, i) => {
                  const isThis = m.id === milestoneId;
                  const phaseDone = m.status === "approved" || m.status === "released";
                  const phasePending = m.status === "in_progress" || m.status === "awaiting_approval";
                  const completedAmount = phaseDone || isThis ? m.amount : 0;
                  const phasePercent = m.amount > 0 ? (completedAmount / m.amount) * 100 : 0;
                  const phaseRemaining = m.amount - completedAmount;

                  return (
                    <tr
                      key={m.id}
                      className={isThis ? "bg-sky-50" : phaseDone ? "" : "text-slate-500"}
                    >
                      <td className="px-2 py-1.5">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <span className={`font-medium ${isThis ? "text-sky-900" : "text-slate-900"}`}>
                          {m.name}
                        </span>
                        {isThis && (
                          <span className="ml-2 rounded-full bg-sky-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                            This Draw
                          </span>
                        )}
                        {phasePending && !isThis && (
                          <span className="ml-2 text-[10px] text-sky-700">In progress</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(m.amount)}</td>
                      <td className="px-2 py-1.5 text-right">{m.percentage}%</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(completedAmount)}</td>
                      <td className="px-2 py-1.5 text-right">{phasePercent.toFixed(0)}%</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(phaseRemaining)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 bg-slate-50 text-xs font-bold uppercase tracking-wider">
                  <td colSpan={2} className="px-2 py-2">Totals</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(contractValue)}</td>
                  <td className="px-2 py-2 text-right">100%</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(totalApproved)}</td>
                  <td className="px-2 py-2 text-right">{completionPercent.toFixed(1)}%</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(remaining)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
          )}

          {/* Simple invoice body — one line per draw with the amount due. */}
          {template === "simple" && (
            <section className="mt-8">
              <table className="min-w-full text-sm">
                <thead className="border-y-2 border-slate-900 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">
                        {thisMs.name}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        Draw #{drawNumber} · {thisMs.percentage}% of contract
                        {previouslyPaid > 0 && ` · Project ${completionPercent.toFixed(0)}% complete`}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {fmtMoney(thisRequest)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300 text-xs text-slate-600">
                    <td className="px-3 py-1.5 text-right">Contract total</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(contractValue)}</td>
                  </tr>
                  {previouslyPaid > 0 && (
                    <tr className="text-xs text-slate-600">
                      <td className="px-3 py-1.5 text-right">Previously paid</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        −{fmtMoney(previouslyPaid)}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-slate-900 text-sm font-bold uppercase tracking-wider">
                    <td className="px-3 py-2 text-right">Amount due</td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-700">
                      {fmtMoney(thisRequest)}
                    </td>
                  </tr>
                  <tr className="text-xs text-slate-500">
                    <td className="px-3 py-1 text-right">Balance after this draw</td>
                    <td className="px-3 py-1 text-right tabular-nums">{fmtMoney(remaining)}</td>
                  </tr>
                </tfoot>
              </table>

              {(settings?.company_name || settings?.prepared_by_name) && (
                <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Make checks payable to
                  </div>
                  <div className="font-semibold text-slate-900">
                    {settings.company_name || settings.prepared_by_name}
                  </div>
                  {settings.company_address && (
                    <div className="mt-0.5 whitespace-pre-line">{settings.company_address}</div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Certifications — full dual block for AIA, single approval
             line for the simple template. Custom certification text from
             OrgSettings overrides the boilerplate when present.
             Owner signature block can be suppressed org-wide via toggle. */}
          {template === "aia" ? (
            <section className={`mt-10 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-700 ${showOwnerSig ? "grid grid-cols-2 gap-8" : ""}`}>
              <div>
                <p className="font-semibold uppercase tracking-wider text-slate-900">
                  Contractor&apos;s Certification
                </p>
                <p className="mt-1.5 whitespace-pre-line">
                  {tpl.certification_text ||
                    `The undersigned Contractor certifies that to the best of the Contractor's knowledge, information, and belief, the Work covered by this Application for Payment has been completed in accordance with the Contract Documents, that all amounts have been paid by the Contractor for Work for which previous Certificates for Payment were issued, and that current payment shown herein is now due.`}
                </p>
                <SignatureBlock label="Contractor" name={settings?.prepared_by_name || settings?.company_name} />
                {showNotary && <NotaryBlock />}
              </div>
              {showOwnerSig && (
                <div>
                  <p className="font-semibold uppercase tracking-wider text-slate-900">
                    Owner&apos;s Approval
                  </p>
                  <p className="mt-1.5">
                    The undersigned Owner has reviewed the Work covered by this Application for
                    Payment and certifies that the Work has been performed in accordance with the
                    Contract Documents and authorizes the lender to release funds in the amount
                    certified above.
                  </p>
                  <SignatureBlock
                    label="Owner"
                    name={deal.account_name}
                    signature={thisMs.approval_signature}
                    signedAt={thisMs.approved_at}
                  />
                </div>
              )}
            </section>
          ) : (
            <section className="mt-10 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-700">
              <p className="whitespace-pre-line">
                {tpl.payment_terms || "Payment due on receipt. Thank you for your business."}
              </p>
              {showOwnerSig && (
                <div className="mt-4 grid grid-cols-2 gap-8">
                  <SignatureBlock
                    label="Owner Approval"
                    name={deal.account_name}
                    signature={thisMs.approval_signature}
                    signedAt={thisMs.approved_at}
                  />
                </div>
              )}
            </section>
          )}

          {/* Footer */}
          <footer className="mt-8 border-t border-slate-100 pt-3 text-center text-[10px] text-slate-400">
            Generated {date}
            {settings?.company_name && ` · ${settings.company_name}`}
            {" · "}
            {template === "aia" ? `Application for Payment, Draw #${drawNumber}` : `Invoice #${drawNumber}`}
          </footer>
        </article>
      </div>

      <PrintStyles />
    </div>
  );
}

function Party({
  label,
  name,
  address,
  phone,
  email,
}: {
  label: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{name}</div>
      {address && (
        <div className="mt-0.5 whitespace-pre-line text-xs text-slate-600">{address}</div>
      )}
      {(phone || email) && (
        <div className="mt-1 text-[11px] text-slate-500">
          {phone}
          {phone && email && " · "}
          {email}
        </div>
      )}
    </div>
  );
}

function G702Line({
  n,
  label,
  value,
  signed,
  bold,
  accent,
}: {
  n: string;
  label: string;
  value: number;
  signed?: boolean;
  bold?: boolean;
  accent?: boolean;
}) {
  // One row of the official AIA G702 9-line summary. Number column +
  // label + right-aligned dollar amount. `signed` shows ± for the
  // change-order delta; `bold` emphasizes the major subtotals
  // (Lines 3, 5, 6); `accent` colors Line 8 (Current Payment Due).
  const formatted = signed
    ? `${value >= 0 ? "+" : "−"}${fmtMoney(Math.abs(value))}`
    : fmtMoney(value);
  return (
    <tr className={accent ? "bg-sky-50" : undefined}>
      <td className="w-10 px-3 py-1.5 text-center font-mono text-[11px] text-slate-500">
        {n}
      </td>
      <td
        className={`px-3 py-1.5 ${
          bold || accent ? "font-semibold" : ""
        } ${accent ? "text-sky-900" : "text-slate-700"}`}
      >
        {label}
      </td>
      <td
        className={`px-3 py-1.5 text-right tabular-nums ${
          bold || accent ? "font-bold" : ""
        } ${accent ? "text-sky-700" : "text-slate-900"}`}
      >
        {formatted}
      </td>
    </tr>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${accent ? "text-sky-700" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function SignatureBlock({
  label,
  name,
  signature,
  signedAt,
}: {
  label: string;
  name?: string;
  signature?: string;
  signedAt?: string;
}) {
  // If we captured an e-signature, render it on the line; otherwise show
  // an empty line for ink. The label below stays the same so the printed
  // doc looks right either way.
  return (
    <div className="mt-6">
      <div
        className="flex items-end justify-between border-b border-slate-400 pb-1"
        style={{ minHeight: "2.25rem" }}
      >
        {signature && (
          <span
            className="italic text-slate-900"
            style={{ fontFamily: "Brush Script MT, cursive", fontSize: "1.5rem" }}
          >
            /s/ {signature}
          </span>
        )}
        {signedAt && (
          <span className="text-[10px] text-slate-500">
            Signed {new Date(signedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
        {label} · {name || "Signature"} · Date
      </div>
    </div>
  );
}

function NotaryBlock() {
  // Standard "subscribed and sworn" jurat. State / County / Day blanks
  // are ink-only — the notary fills them in at signing. Banks and
  // title companies rely on this block to treat the pay app as a
  // sworn statement (separate from the contractor's signature line
  // above). The actual seal goes in the box on the right.
  return (
    <div className="mt-6 border border-slate-300 p-3 text-[10px] leading-relaxed text-slate-700">
      <div className="font-semibold uppercase tracking-wider text-slate-900">
        Notary Acknowledgement
      </div>
      <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-3">
        <div>
          <p>
            State of <span className="inline-block min-w-[6rem] border-b border-slate-400">&nbsp;</span>,
            County of <span className="inline-block min-w-[6rem] border-b border-slate-400">&nbsp;</span>
          </p>
          <p className="mt-1.5">
            Subscribed and sworn to before me this{" "}
            <span className="inline-block min-w-[2.5rem] border-b border-slate-400">&nbsp;</span>{" "}
            day of{" "}
            <span className="inline-block min-w-[6rem] border-b border-slate-400">&nbsp;</span>,{" "}
            20<span className="inline-block min-w-[2rem] border-b border-slate-400">&nbsp;</span>.
          </p>
          <p className="mt-3">
            Notary Public:{" "}
            <span className="inline-block min-w-[10rem] border-b border-slate-400">&nbsp;</span>
          </p>
          <p className="mt-1">
            My commission expires:{" "}
            <span className="inline-block min-w-[6rem] border-b border-slate-400">&nbsp;</span>
          </p>
        </div>
        <div className="flex items-center justify-center border border-dashed border-slate-300 px-3 py-2 text-center text-[9px] uppercase tracking-wider text-slate-400">
          Notary
          <br />
          Seal
        </div>
      </div>
    </div>
  );
}

function PrintStyles() {
  // Inline page setup for print: A4/Letter, no margin, force-color so amber
  // accents survive the print engine's color stripping.
  return (
    <style>{`
      @media print {
        @page { size: Letter; margin: 0.5in; }
        html, body { background: white !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `}</style>
  );
}
