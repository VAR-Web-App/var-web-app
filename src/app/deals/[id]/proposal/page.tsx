"use client";

// Proposal — the client-facing sales document the builder sends to a
// homeowner BEFORE construction begins. Polished, branded, no cost
// basis or margin visible. Includes scope summary, phase-grouped line
// items with customer pricing only, payment schedule preview from the
// draw milestones, and signature blocks for client + builder
// acceptance.
//
// Architecture mirrors the draw-request page (lender-facing). Same
// browser-native print path — no PDF library needed.

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, PrinterIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { Deal, OrgSettings, QuoteLine } from "@/types";
import { ProjectMilestone } from "@/types/builder";
import {
  getDeal,
  getSettings,
  listMilestones,
  listQuoteLines,
} from "@/lib/store";
import { useAuth } from "@/lib/auth-context";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMoneyRound = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
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
      const [m, ql, s] = await Promise.all([
        listMilestones(id),
        listQuoteLines(id),
        getSettings(profile!.org_ref),
      ]);
      if (!active) return;
      setDeal(d);
      setMilestones(m);
      setLines(ql);
      setSettings(s);
      setLoaded(true);
    }
    void load();
    return () => { active = false; };
  }, [id, profile, router]);

  // Group line items by product_code (which we repurposed as phase
  // category in the builder estimate generator). Keep ordering stable.
  const grouped = useMemo(() => {
    const out: { phase: string; lines: QuoteLine[]; subtotal: number }[] = [];
    const seen = new Map<string, number>();
    for (const l of lines) {
      const phase = l.product_code || "Other";
      let idx = seen.get(phase);
      if (idx === undefined) {
        idx = out.length;
        seen.set(phase, idx);
        out.push({ phase, lines: [], subtotal: 0 });
      }
      out[idx].lines.push(l);
      out[idx].subtotal += l.customer_extended || 0;
    }
    return out;
  }, [lines]);

  if (!deal || !loaded) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-10 text-sm text-slate-500">
        Loading proposal…
      </div>
    );
  }

  const totalCustomer = lines.reduce((s, l) => s + (l.customer_extended || 0), 0);

  const proposalDate = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Proposal validity: typical 30-day expiration window from issue date.
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  const validUntilLabel = validUntil.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function emailToClient() {
    if (!deal) return;
    const subject = `Project Proposal — ${deal.name}`;
    const portalUrl = `${window.location.origin}/deals/${id}/portal`;
    const body = [
      `Hi,`,
      ``,
      `Attached is your proposal for ${deal.name}.`,
      ``,
      `Total contract amount: ${fmtMoneyRound(totalCustomer)}`,
      `Target start: ${deal.due_date || "TBD"}`,
      `Proposal valid until: ${validUntilLabel}`,
      ``,
      `Review your project portal anytime: ${portalUrl}`,
      ``,
      `Reply to this email or call with any questions.`,
      ``,
      `Thanks,`,
      `${settings?.prepared_by_name || settings?.company_name || "Your builder"}`,
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
              title="Open your email client with the proposal prefilled"
            >
              <EnvelopeIcon className="h-4 w-4" />
              Email to client
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
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
          <header className="border-b-2 border-amber-700 pb-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Project Proposal
                </p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                  {deal.name}
                </h1>
                {deal.solicitation_number && (
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    Job #: {deal.solicitation_number}
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-slate-600">
                <div>Date: <span className="font-medium text-slate-900">{proposalDate}</span></div>
                <div className="mt-0.5">Valid until: <span className="font-medium text-slate-900">{validUntilLabel}</span></div>
              </div>
            </div>
          </header>

          {/* Parties */}
          <section className="mt-6 grid grid-cols-2 gap-8">
            <Party
              label="Prepared by"
              name={settings?.company_name || settings?.prepared_by_name || "—"}
              address={settings?.company_address}
              phone={settings?.company_phone}
              email={settings?.company_email}
              license={settings?.cage_code}
            />
            <Party
              label="Prepared for"
              name={deal.account_name || "—"}
              address={deal.ship_to_address}
              email={deal.ship_to_poc_email}
            />
          </section>

          {/* Project address */}
          {deal.ship_to_address && (
            <section className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Project Address:{" "}
              </span>
              <span className="whitespace-pre-line text-slate-900">{deal.ship_to_address}</span>
            </section>
          )}

          {/* Contract summary */}
          <section className="mt-8 rounded-lg border-2 border-amber-700 bg-amber-50 p-6">
            <div className="flex items-baseline justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                  Total Contract Amount
                </p>
                <p className="mt-1 text-4xl font-bold tabular-nums text-slate-900">
                  {fmtMoneyRound(totalCustomer)}
                </p>
              </div>
              <div className="text-right text-xs text-slate-600">
                <div>Project type: <span className="font-medium text-slate-900">{deal.manufacturer || "—"}</span></div>
                {deal.due_date && (
                  <div className="mt-0.5">Target start: <span className="font-medium text-slate-900">{new Date(deal.due_date).toLocaleDateString()}</span></div>
                )}
                <div className="mt-0.5">Line items: <span className="font-medium text-slate-900">{lines.length}</span></div>
              </div>
            </div>
          </section>

          {/* Scope of Work */}
          {grouped.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                Scope of Work
              </h2>
              <div className="mt-3 space-y-5">
                {grouped.map((g) => (
                  <div key={g.phase}>
                    <div className="flex items-baseline justify-between border-b border-slate-200 pb-1.5">
                      <h3 className="text-sm font-semibold text-slate-900">{g.phase}</h3>
                      <span className="text-sm font-semibold tabular-nums text-amber-700">
                        {fmtMoney(g.subtotal)}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                      {g.lines.map((l) => (
                        <li key={l.id} className="flex items-start gap-3">
                          <span className="flex-1">{l.description}</span>
                          <span className="flex-shrink-0 tabular-nums text-slate-500">
                            {l.qty.toLocaleString()} × {fmtMoney(l.customer_unit_price)}
                          </span>
                          <span className="w-24 flex-shrink-0 text-right font-medium tabular-nums text-slate-900">
                            {fmtMoney(l.customer_extended)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-baseline justify-between border-t-2 border-slate-900 pt-3">
                <span className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Total
                </span>
                <span className="text-xl font-bold tabular-nums text-slate-900">
                  {fmtMoney(totalCustomer)}
                </span>
              </div>
            </section>
          ) : (
            <section className="mt-8 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No line items in the estimate yet. Build the estimate before sending the proposal.
            </section>
          )}

          {/* Payment Schedule */}
          {milestones.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                Payment Schedule
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Draws are released as each phase completes. The schedule below approximates the
                billing cadence for your reference.
              </p>
              <table className="mt-3 min-w-full text-xs">
                <thead className="border-y-2 border-slate-900 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                  <tr>
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Phase</th>
                    <th className="px-2 py-2 text-left">When</th>
                    <th className="px-2 py-2 text-right">% of Contract</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {milestones
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((m, i) => (
                      <tr key={m.id}>
                        <td className="px-2 py-1.5">{i + 1}</td>
                        <td className="px-2 py-1.5 font-medium text-slate-900">{m.name}</td>
                        <td className="px-2 py-1.5 text-slate-600">
                          {m.planned_start_date && m.planned_end_date
                            ? `${m.planned_start_date} → ${m.planned_end_date}`
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right">{m.percentage}%</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {fmtMoney(m.amount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 bg-slate-50 text-xs font-bold uppercase tracking-wider">
                    <td colSpan={3} className="px-2 py-2">Total</td>
                    <td className="px-2 py-2 text-right">100%</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {fmtMoney(milestones.reduce((s, m) => s + m.amount, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>
          )}

          {/* Terms */}
          <section className="mt-10 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
            <p className="font-semibold uppercase tracking-wider text-slate-900">
              Standard Terms
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>This proposal is valid for 30 days from the date issued.</li>
              <li>Pricing is based on the scope of work above; changes during construction
                  are documented and billed via written change orders.</li>
              <li>Allowances (where noted) reflect typical mid-grade selections; actual
                  costs may vary based on the homeowner&apos;s final selections.</li>
              <li>Payments follow the Payment Schedule above; each draw is released upon
                  homeowner approval of phase completion.</li>
              <li>A separate written contract incorporating these terms will be executed
                  at acceptance.</li>
            </ul>
          </section>

          {/* Acceptance */}
          <section className="mt-10 grid grid-cols-2 gap-8 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-700">
            <div>
              <p className="font-semibold uppercase tracking-wider text-slate-900">
                Acceptance &amp; Authorization
              </p>
              <p className="mt-1.5">
                By signing below, the Owner accepts this proposal and authorizes the
                Contractor to proceed with the work as described. A written contract
                incorporating these terms will be executed concurrently.
              </p>
              <SignatureBlock label="Owner" name={deal.account_name} />
            </div>
            <div>
              <p className="font-semibold uppercase tracking-wider text-slate-900">
                Contractor
              </p>
              <p className="mt-1.5">
                The Contractor proposes to furnish materials and labor for the Work
                described above for the total contract amount stated.
              </p>
              <SignatureBlock label="Contractor" name={settings?.prepared_by_name || settings?.company_name} />
            </div>
          </section>

          {/* Footer */}
          <footer className="mt-8 border-t border-slate-100 pt-3 text-center text-[10px] text-slate-400">
            {settings?.company_name && `${settings.company_name} · `}
            Proposal generated {proposalDate}
            {settings?.cage_code && ` · License #${settings.cage_code}`}
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
  license,
}: {
  label: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  license?: string;
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
      {license && (
        <div className="mt-0.5 text-[10px] text-slate-400">License #{license}</div>
      )}
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
