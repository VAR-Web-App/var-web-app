"use client";

// The dispute-proof "paper trail" report for a deal — one print/PDF that ties
// together the tracked Requests (the client's asks + sign-offs), Change Orders
// (priced + e-signed), and the full email Correspondence, in order. Standalone
// print page (no app nav) — "Print / Save as PDF" via the browser, mirroring
// the proposal/draw pages. This is the "disputes can't hurt you" export.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useDeal } from "@/lib/use-deal";
import {
  listEmailMessages,
  listRequests,
  listChangeOrders,
  getSettings,
} from "@/lib/store";
import type {
  EmailMessage,
  ProjectRequest,
  ProjectChangeOrder,
} from "@/types/builder";

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString() : "—");
const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const byAsc = (a: string, b: string) => (a || "").localeCompare(b || "");
const REQ_STATUS: Record<string, string> = {
  open: "Open",
  scheduled: "In progress",
  done: "Done",
  wont_do: "Won't do",
};

export default function PaperTrailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { deal, loaded } = useDeal(id);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [cos, setCos] = useState<ProjectChangeOrder[]>([]);
  const [company, setCompany] = useState("");

  useEffect(() => {
    if (!deal) return;
    listEmailMessages(deal.org_ref)
      .then((all) =>
        setEmails(
          all
            .filter((m) => m.deal_ref === deal.id)
            .sort((a, b) => byAsc(a.received_at, b.received_at)),
        ),
      )
      .catch(() => {});
    listRequests(deal.id)
      .then((r) => setRequests(r.sort((a, b) => byAsc(a.created_at, b.created_at))))
      .catch(() => {});
    listChangeOrders(deal.id)
      .then((c) => setCos(c.sort((a, b) => byAsc(a.number, b.number))))
      .catch(() => {});
    getSettings(deal.org_ref)
      .then((s) => setCompany(s?.company_name || ""))
      .catch(() => {});
  }, [deal]);

  if (!loaded)
    return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (!deal)
    return <div className="p-8 text-sm text-slate-500">Project not found.</div>;

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-slate-900 sm:p-10 print:p-0">
      <style>{`@media print { .no-print { display:none !important } * { -webkit-print-color-adjust:exact; print-color-adjust:exact } } .pt-item { break-inside: avoid }`}</style>

      <div className="no-print mb-6 flex items-center justify-between">
        <Link
          href={`/deals/${deal.id}`}
          className="text-sm text-sky-700 hover:underline"
        >
          ← Back to project
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Print / Save as PDF
        </button>
      </div>

      <header className="border-b-2 border-slate-800 pb-4">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Project Record — Paper Trail
        </p>
        <h1 className="mt-1 text-2xl font-bold">{deal.name}</h1>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <Row k="Client" v={deal.account_name || deal.ship_to_poc_name || "—"} />
          <Row k="Contact" v={deal.ship_to_poc_email || "—"} />
          <Row k="Address" v={(deal.ship_to_address || "").split("\n")[0] || "—"} />
          <Row k="Contract / PO #" v={deal.customer_po || "—"} />
          <Row k="Prepared by" v={company || "—"} />
          <Row k="Generated" v={new Date().toLocaleString()} />
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          {requests.length} request{requests.length === 1 ? "" : "s"} ·{" "}
          {cos.length} change order{cos.length === 1 ? "" : "s"} · {emails.length}{" "}
          email{emails.length === 1 ? "" : "s"}
        </p>
      </header>

      <Section title="Requests & Approvals">
        {requests.length === 0 ? (
          <Empty />
        ) : (
          requests.map((r) => (
            <div key={r.id} className="pt-item border-b border-slate-100 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">{r.title}</span>
                <Badge>{REQ_STATUS[r.status] ?? r.status}</Badge>
              </div>
              {r.body && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {r.body}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Source: {r.source} · Logged {fmtDate(r.created_at)}
                {r.client_signoff
                  ? ` · Signed by ${r.client_signoff.signature} on ${fmtDate(r.client_signoff.signed_at)}`
                  : ""}
              </p>
            </div>
          ))
        )}
      </Section>

      <Section title="Change Orders">
        {cos.length === 0 ? (
          <Empty />
        ) : (
          cos.map((c) => (
            <div key={c.id} className="pt-item border-b border-slate-100 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">
                  {c.number} — {c.title}
                </span>
                <Badge>{c.status}</Badge>
              </div>
              {c.description && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {c.description}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {money(c.amount_delta)}
                {c.schedule_impact_days
                  ? ` · ${c.schedule_impact_days} day impact`
                  : ""}{" "}
                · Reason: {c.reason.replace("_", " ")}
                {c.approval_signature
                  ? ` · Approved by ${c.approval_signature} on ${fmtDate(c.approved_at)}`
                  : ""}
              </p>
            </div>
          ))
        )}
      </Section>

      <Section title="Correspondence">
        {emails.length === 0 ? (
          <Empty />
        ) : (
          emails.map((m) => (
            <div key={m.id} className="pt-item border-b border-slate-100 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">
                  {m.subject || "(no subject)"}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {fmtDate(m.received_at)}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {m.direction === "out"
                  ? "From you"
                  : `From ${m.from || m.from_email}`}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {(m.body_text || m.snippet || "").slice(0, 4000)}
              </p>
            </div>
          ))
        )}
      </Section>

      <footer className="mt-8 border-t border-slate-200 pt-3 text-center text-xs text-slate-400">
        Generated by KeystonePro — {deal.name} — {new Date().toLocaleDateString()}
      </footer>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-500">{k}:</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-800">
        {title}
      </h2>
      {children}
    </section>
  );
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
      {children}
    </span>
  );
}
function Empty() {
  return <p className="text-sm italic text-slate-400">None recorded.</p>;
}
