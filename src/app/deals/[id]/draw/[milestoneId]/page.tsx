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
import { ArrowLeftIcon, PrinterIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { Deal, Distributor, OrgSettings } from "@/types";
import { ProjectMilestone, MILESTONE_STATUS_LABELS } from "@/types/builder";
import {
  getDeal,
  getSettings,
  listMilestones,
  listDistributors,
} from "@/lib/store";
import { useAuth } from "@/lib/auth-context";

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
  const [loaded, setLoaded] = useState(false);

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
      const [m, s, subList] = await Promise.all([
        listMilestones(id),
        getSettings(profile!.org_ref),
        listDistributors(profile!.org_ref),
      ]);
      if (!active) return;
      setDeal(d);
      setMilestones(m);
      setSettings(s);
      setSubs(subList);
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

  const contractValue = deal.award_total > 0 ? deal.award_total : deal.total_quote_value;

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
          <div className="flex gap-2">
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
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <PrinterIcon className="h-4 w-4" />
              Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      {/* Document */}
      <div className="mx-auto max-w-5xl px-6 py-10 print:px-0 print:py-0">
        <article className="rounded-lg border border-slate-200 bg-white p-10 shadow-sm print:rounded-none print:border-0 print:p-8 print:shadow-none">
          {/* Header */}
          <header className="border-b-2 border-slate-900 pb-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Application for Payment / Invoice
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Draw Request #{drawNumber} · Invoice #{drawNumber}
                </p>
              </div>
              <div className="text-right text-xs text-slate-600">
                <div>Date: <span className="font-medium text-slate-900">{date}</span></div>
                <div className="mt-0.5">Project: <span className="font-medium text-slate-900">{deal.name}</span></div>
                {deal.solicitation_number && (
                  <div className="mt-0.5">Job #: <span className="font-mono font-medium text-slate-900">{deal.solicitation_number}</span></div>
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
          {thisMs.assigned_subs && thisMs.assigned_subs.length > 0 && (
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

          {/* Summary box (the bank's eyes go here first) */}
          <section className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm sm:grid-cols-4">
            <SummaryStat label="Original Contract Sum" value={fmtMoney(contractValue)} />
            <SummaryStat label="Total Completed To Date" value={fmtMoney(totalApproved)} />
            <SummaryStat label="Less Previous Payments" value={fmtMoney(previouslyPaid)} />
            <SummaryStat
              label="This Draw Request"
              value={fmtMoney(thisRequest - 0)}
              accent
            />
            <SummaryStat label="Project Completion" value={`${completionPercent.toFixed(1)}%`} />
            <SummaryStat
              label="Balance to Finish"
              value={fmtMoney(remaining)}
            />
            <SummaryStat label="Phase" value={thisMs.name} />
            <SummaryStat label="Status" value={MILESTONE_STATUS_LABELS[thisMs.status]} />
          </section>

          {/* Schedule of Values */}
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

          {/* Certifications */}
          <section className="mt-10 grid grid-cols-2 gap-8 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-700">
            <div>
              <p className="font-semibold uppercase tracking-wider text-slate-900">
                Contractor&apos;s Certification
              </p>
              <p className="mt-1.5">
                The undersigned Contractor certifies that to the best of the Contractor&apos;s
                knowledge, information, and belief, the Work covered by this Application for
                Payment has been completed in accordance with the Contract Documents, that all
                amounts have been paid by the Contractor for Work for which previous Certificates
                for Payment were issued, and that current payment shown herein is now due.
              </p>
              <SignatureBlock label="Contractor" name={settings?.prepared_by_name || settings?.company_name} />
            </div>
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
              <SignatureBlock label="Owner" name={deal.account_name} />
            </div>
          </section>

          {/* Footer */}
          <footer className="mt-8 border-t border-slate-100 pt-3 text-center text-[10px] text-slate-400">
            Generated {date}
            {settings?.company_name && ` · ${settings.company_name}`}
            {" · "}
            Application for Payment, Draw #{drawNumber}
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

function SignatureBlock({ label, name }: { label: string; name?: string }) {
  return (
    <div className="mt-6">
      <div className="border-b border-slate-400 pb-1" style={{ minHeight: "2.25rem" }} />
      <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
        {label} · {name || "Signature"} · Date
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
