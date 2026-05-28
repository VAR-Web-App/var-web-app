"use client";

import { Fragment, useEffect, useState } from "react";
import {
  PlusIcon,
  ClipboardDocumentListIcon,
  PaperAirplaneIcon,
  TrashIcon,
  XMarkIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { Attachment, Deal, Distributor, QuoteLine, newId } from "@/types";
import {
  ProjectRFQ,
  RFQInvitee,
  RFQ_STATUS_LABELS,
  RFQ_STATUS_STYLES,
  PROJECT_PHASES,
  ProjectPhase,
} from "@/types/builder";
import {
  listRFQs,
  saveRFQ,
  deleteRFQ,
  listQuoteLines,
  saveQuoteLines,
  saveDeal,
  getDeal,
  listDistributors,
  getSettings,
  refreshSubScheduleLink,
  listAttachmentsByRFQ,
} from "@/lib/store";
import {
  composeRfqInviteSms,
  composeRfqAwardSms,
  sendSms,
  toE164,
} from "@/lib/sms";
import {
  composeRfqInviteEmail,
  composeRfqAwardEmail,
  isLikelyEmail,
  sendEmail,
} from "@/lib/email-compose";
import { pushNotifySub } from "@/lib/push-client";
import Tooltip from "@/components/tooltip";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function RFQPanel({ deal }: { deal: Deal }) {
  const [rfqs, setRfqs] = useState<ProjectRFQ[]>([]);
  const [subs, setSubs] = useState<Distributor[]>([]);
  const [builderName, setBuilderName] = useState("");
  const [fromNumberHint, setFromNumberHint] = useState<string | undefined>(
    undefined,
  );
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<ProjectRFQ | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      listRFQs(deal.id),
      listDistributors(deal.org_ref),
      getSettings(deal.org_ref),
    ]).then(([r, s, settings]) => {
      if (!active) return;
      setRfqs(r);
      setSubs(s);
      setBuilderName(settings?.company_name ?? "");
      setFromNumberHint(settings?.sms_config?.from_number);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [deal.id, deal.org_ref]);

  async function onCreate(rfq: ProjectRFQ) {
    await saveRFQ(rfq);
    setRfqs((prev) => [rfq, ...prev]);
    setShowNew(false);
  }

  async function onUpdate(rfq: ProjectRFQ) {
    await saveRFQ(rfq);
    setRfqs((prev) => prev.map((r) => (r.id === rfq.id ? rfq : r)));
    setEditing(null);
  }

  async function onRemove(rfq: ProjectRFQ) {
    if (!confirm(`Delete RFQ "${rfq.scope_title}"?`)) return;
    await deleteRFQ(rfq.id);
    setRfqs((prev) => prev.filter((r) => r.id !== rfq.id));
  }

  /** Push the awarded sub's winning bid into the project estimate as a
   *  new line item. Builder's typed cost = the bid amount; phase pulls
   *  from the RFQ. Stamps pushed_to_estimate_at on the RFQ so the row
   *  shows a 'Pushed' indicator instead of the button on next render —
   *  prevents accidental duplicates. */
  async function onPushToEstimate(rfq: ProjectRFQ) {
    const winning = rfq.invitees.find((i) => i.status === "selected");
    if (!winning || !winning.bid_amount) return;

    // Load current quote lines so we can append.
    const existing = await listQuoteLines(deal.id);
    const cost = winning.bid_amount;
    const markup = 20; // default builder markup; matches addBlankLine
    const customer_unit = cost * (1 + markup / 100);
    const newLine: QuoteLine = {
      id: newId("ql"),
      line_number: existing.length + 1,
      product_code: rfq.phase,
      description: `${rfq.scope_title} — ${winning.sub_name}`,
      manufacturer: "",
      is_service: false,
      qty: 1,
      list_price: cost,
      discount_percent: 0,
      markup_percent: markup,
      cost_unit_price: cost,
      cost_extended: cost,
      customer_unit_price: customer_unit,
      customer_extended: customer_unit,
      margin_percent: markup / (1 + markup / 100),
      subscription_term_months: 0,
      notes: "",
      // Provenance: this line's cost IS the winning sub's awarded bid.
      // Most trustworthy pricing tier — picked up by the green "bid"
      // pill in the line items table.
      price_source: "bid",
    };
    const updated = [...existing, newLine];
    await saveQuoteLines(deal.id, deal.org_ref, updated);

    // Roll deal totals so pipeline cards + draws read the new estimate.
    const customerTotal = updated.reduce((s, l) => s + (l.customer_extended || 0), 0);
    const costTotal = updated.reduce((s, l) => s + (l.cost_extended || 0), 0);
    const margin = customerTotal > 0 ? ((customerTotal - costTotal) / customerTotal) * 100 : 0;
    const freshDeal = await getDeal(deal.id);
    if (freshDeal) {
      await saveDeal({
        ...freshDeal,
        total_quote_value: customerTotal,
        total_cost: costTotal,
        margin_percent: margin,
        updated_at: new Date().toISOString(),
      });
    }

    // Mark the RFQ as pushed.
    const stamped: ProjectRFQ = {
      ...rfq,
      pushed_to_estimate_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await saveRFQ(stamped);
    setRfqs((prev) => prev.map((r) => (r.id === rfq.id ? stamped : r)));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Subcontractor RFQs</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {rfqs.length} bid request{rfqs.length === 1 ? "" : "s"} on this project
          </p>
        </div>
        <Tooltip
          variant="directive"
          label="Send a scope of work to multiple subs at once. They each return a bid; you compare side-by-side and award the winner."
          placement="left"
        >
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            New RFQ
          </button>
        </Tooltip>
      </div>

      {!loaded ? (
        <div className="px-6 py-6 text-sm text-slate-500">Loading RFQs…</div>
      ) : rfqs.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <ClipboardDocumentListIcon className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No bid requests yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Send a scope to multiple subs, compare their bids side by side, lock in your winner.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rfqs.map((r) => (
            <RFQRow
              key={r.id}
              rfq={r}
              onOpen={() => setEditing(r)}
              onRemove={() => onRemove(r)}
              onPushToEstimate={() => onPushToEstimate(r)}
            />
          ))}
        </ul>
      )}

      {showNew && (
        <RFQModal
          deal={deal}
          subs={subs}
          builderName={builderName}
          fromNumberHint={fromNumberHint}
          onSave={onCreate}
          onClose={() => setShowNew(false)}
        />
      )}
      {editing && (
        <RFQModal
          deal={deal}
          subs={subs}
          builderName={builderName}
          fromNumberHint={fromNumberHint}
          existing={editing}
          onSave={onUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function RFQRow({
  rfq,
  onOpen,
  onRemove,
  onPushToEstimate,
}: {
  rfq: ProjectRFQ;
  onOpen: () => void;
  onRemove: () => void;
  onPushToEstimate: () => void;
}) {
  const responded = rfq.invitees.filter((i) => i.status !== "sent").length;
  const winningBid = rfq.invitees.find((i) => i.status === "selected");
  const lowestBid = rfq.invitees
    .filter((i) => i.bid_amount && i.bid_amount > 0)
    .sort((a, b) => (a.bid_amount || 0) - (b.bid_amount || 0))[0];
  const awarded = rfq.status === "awarded" && !!winningBid?.bid_amount;
  const pushed = !!rfq.pushed_to_estimate_at;

  return (
    <li className="flex items-start gap-3 px-6 py-4 hover:bg-slate-50">
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-sm font-medium text-slate-900">{rfq.scope_title}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${RFQ_STATUS_STYLES[rfq.status]}`}>
            {RFQ_STATUS_LABELS[rfq.status]}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {rfq.phase}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">
          {rfq.invitees.length} sub{rfq.invitees.length === 1 ? "" : "s"} · {responded} responded
          {winningBid && winningBid.bid_amount
            ? ` · awarded to ${winningBid.sub_name} at ${fmtMoney(winningBid.bid_amount)}`
            : lowestBid && lowestBid.bid_amount
            ? ` · low bid ${fmtMoney(lowestBid.bid_amount)} (${lowestBid.sub_name})`
            : ""}
        </p>
      </button>
      {awarded && !pushed && (
        <Tooltip
          variant="directive"
          label="Add the winning bid to the project estimate as a line item. Cost = the bid amount; default 20% markup applied to the client price."
          placement="left"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPushToEstimate();
            }}
            className="shrink-0 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100"
          >
            → Estimate
          </button>
        </Tooltip>
      )}
      {awarded && pushed && (
        <span
          className="shrink-0 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
          title={`Added to estimate ${new Date(rfq.pushed_to_estimate_at!).toLocaleDateString()}`}
        >
          <CheckCircleIcon className="h-3 w-3" />
          In estimate
        </span>
      )}
      <button
        onClick={onRemove}
        className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
        title="Delete RFQ"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

export function RFQModal({
  deal,
  subs,
  builderName,
  fromNumberHint,
  existing,
  onSave,
  onClose,
}: {
  deal: Deal;
  subs: Distributor[];
  builderName: string;
  fromNumberHint?: string;
  existing?: ProjectRFQ;
  onSave: (rfq: ProjectRFQ) => void;
  onClose: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [sendReport, setSendReport] = useState<string | null>(null);
  const [title, setTitle] = useState(existing?.scope_title || "");
  const [description, setDescription] = useState(existing?.scope_description || "");
  const [phase, setPhase] = useState<ProjectPhase>(existing?.phase || "Foundation");
  const [invitees, setInvitees] = useState<RFQInvitee[]>(existing?.invitees || []);
  const [notes, setNotes] = useState(existing?.notes || "");
  const [status, setStatus] = useState(existing?.status || "draft");

  // Sub-uploaded bid attachments, indexed by sub_ref. Loaded once on
  // open for existing RFQs; brand-new RFQs (no id yet) have none.
  const [bidFiles, setBidFiles] = useState<Map<string, Attachment[]>>(
    new Map(),
  );
  useEffect(() => {
    if (!existing?.id) return;
    let active = true;
    listAttachmentsByRFQ(existing.id).then((list) => {
      if (!active) return;
      const map = new Map<string, Attachment[]>();
      for (const a of list) {
        if (!a.sub_ref) continue;
        const arr = map.get(a.sub_ref) ?? [];
        arr.push(a);
        map.set(a.sub_ref, arr);
      }
      // Newest first within each bucket.
      for (const arr of map.values()) {
        arr.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
      }
      setBidFiles(map);
    });
    return () => {
      active = false;
    };
  }, [existing?.id]);

  function toggleSub(sub: Distributor) {
    const exists = invitees.find((i) => i.sub_ref === sub.id);
    if (exists) {
      setInvitees(invitees.filter((i) => i.sub_ref !== sub.id));
    } else {
      setInvitees([
        ...invitees,
        { sub_ref: sub.id, sub_name: sub.name, status: "sent" },
      ]);
    }
  }

  function updateInvitee(subRef: string, patch: Partial<RFQInvitee>) {
    setInvitees(invitees.map((i) => i.sub_ref === subRef ? { ...i, ...patch } : i));
  }

  async function save(send: boolean) {
    const now = new Date().toISOString();
    const rfqId = existing?.id || newId("rfq");
    let finalInvitees = invitees;

    // On send: text each newly-invited sub (no prior notified_at) with
    // a link to /s/{token}/bid/{rfqId}. We refresh the sub's schedule
    // token to ensure one exists, then fire SMS via /api/sms. Failures
    // surface in the modal so the GC knows which subs to follow up with.
    if (send) {
      setSending(true);
      const host = typeof window !== "undefined" ? window.location.host : "";
      let sentCount = 0;
      const failures: string[] = [];
      finalInvitees = await Promise.all(
        invitees.map(async (inv) => {
          if (inv.notified_at) return inv;
          const sub = subs.find((s) => s.id === inv.sub_ref);
          if (!sub) {
            failures.push(`${inv.sub_name}: missing distributor`);
            return inv;
          }
          // Multi-channel: try every channel the sub is configured for.
          // SMS gates on consent + valid phone; email gates only on a
          // well-formed address. At least one channel must succeed for
          // notified_at to stamp.
          const phoneOk =
            sub.sms_consent === true && !!toE164(sub.phone ?? "");
          const emailOk = isLikelyEmail(sub.email);
          if (!phoneOk && !emailOk) {
            failures.push(`${inv.sub_name}: no SMS or email on file`);
            return inv;
          }
          try {
            // Ensure the sub has a schedule_token so the bid link works.
            const token = await refreshSubScheduleLink(
              sub.id,
              builderName || "your builder",
            );
            const bidLink = `https://${host}/s/${token}/bid/${rfqId}`;
            const params = {
              builderName,
              projectName: deal.name,
              scopeTitle: title.trim() || "bid request",
              bidLink,
            };
            let anyOk = false;
            if (phoneOk) {
              const to = toE164(sub.phone ?? "");
              const result = await sendSms(
                to!,
                composeRfqInviteSms(params),
                { fromNumberHint },
              );
              if (result.ok) anyOk = true;
            }
            if (emailOk) {
              const result = await sendEmail(
                sub.email!,
                composeRfqInviteEmail(params),
              );
              if (result.ok) anyOk = true;
            }
            // Web push fires alongside SMS + email for any device this
            // sub has registered. Counts toward anyOk so a push-only
            // sub still flips notified_at and isn't re-pinged.
            const pushResult = await pushNotifySub(sub.id, {
              title: `${builderName || "KeystonePro"}: bid request — ${params.scopeTitle}`,
              body: `${params.projectName}`,
              url: bidLink,
              tag: `rfq-invite-${rfqId}`,
            });
            if (pushResult.ok && (pushResult.sent ?? 0) > 0) anyOk = true;
            if (anyOk) {
              sentCount++;
              return { ...inv, notified_at: new Date().toISOString() };
            } else {
              failures.push(`${inv.sub_name}: all channels failed`);
              return inv;
            }
          } catch (e) {
            failures.push(
              `${inv.sub_name}: ${e instanceof Error ? e.message : "error"}`,
            );
            return inv;
          }
        }),
      );
      setSending(false);
      if (failures.length > 0) {
        setSendReport(
          `Texted ${sentCount} of ${invitees.length}. Skipped: ${failures.join("; ")}`,
        );
      } else if (sentCount > 0) {
        setSendReport(`Texted ${sentCount} sub${sentCount === 1 ? "" : "s"}.`);
      }
    }

    const rfq: ProjectRFQ = {
      id: rfqId,
      deal_ref: deal.id,
      org_ref: deal.org_ref,
      scope_title: title.trim() || "Untitled RFQ",
      scope_description: description,
      phase,
      status: send ? (status === "draft" ? "sent" : status) : status,
      invitees: finalInvitees,
      notes,
      sent_at: send && !existing?.sent_at ? now : existing?.sent_at,
      awarded_to_sub_ref: existing?.awarded_to_sub_ref,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    onSave(rfq);
  }

  async function awardTo(subRef: string) {
    setInvitees(
      invitees.map((i) => ({
        ...i,
        status: i.sub_ref === subRef ? "selected" : i.status === "selected" ? "passed" : i.status,
      }))
    );
    setStatus("awarded");

    // Fire-and-forget congrats notification to the winning sub.
    // Mirrors the multi-channel invite send at line ~395: SMS (when
    // we have a consented phone), email, and web push. Failures are
    // logged but never break the award flow — the GC's action stands
    // even if the notification can't reach the sub.
    const sub = subs.find((s) => s.id === subRef);
    const winningBid = invitees.find((i) => i.sub_ref === subRef);
    if (!sub || !winningBid?.bid_amount) return;

    const host = typeof window !== "undefined" ? window.location.host : "";
    const phoneOk = sub.sms_consent === true && !!toE164(sub.phone ?? "");
    const emailOk = isLikelyEmail(sub.email);

    try {
      // Need a schedule token so the portalLink lands them on their
      // sub portal — same approach the invite flow uses.
      const token = await refreshSubScheduleLink(
        sub.id,
        builderName || "your builder",
      );
      const portalLink = host ? `https://${host}/s/${token}` : undefined;
      const params = {
        builderName,
        projectName: deal.name,
        scopeTitle: title.trim() || "your bid",
        bidAmount: winningBid.bid_amount,
        portalLink,
      };

      if (phoneOk) {
        void sendSms(
          toE164(sub.phone ?? "")!,
          composeRfqAwardSms(params),
          { fromNumberHint },
        );
      }
      if (emailOk) {
        void sendEmail(sub.email!, composeRfqAwardEmail(params));
      }
      void pushNotifySub(sub.id, {
        title: `${builderName || "KeystonePro"}: 🎉 You won — ${params.scopeTitle}`,
        body: `${params.projectName} · $${Math.round(params.bidAmount).toLocaleString("en-US")}`,
        url: portalLink || "/",
        tag: `rfq-award-${subRef}`,
      });
    } catch (e) {
      // Award still goes through — notification is best-effort.
      console.warn("[rfq-award] notify failed", e);
    }
  }

  const respondedCount = invitees.filter((i) => i.status !== "sent").length;
  const sortedInvitees = [...invitees].sort((a, b) => {
    // Selected first, then by bid amount, then by name
    if (a.status === "selected" && b.status !== "selected") return -1;
    if (b.status === "selected" && a.status !== "selected") return 1;
    if (a.bid_amount && b.bid_amount) return a.bid_amount - b.bid_amount;
    return a.sub_name.localeCompare(b.sub_name);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="my-8 w-full max-w-3xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">
            {existing ? "Edit RFQ" : "New RFQ"}
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Scope title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Foundation excavation + footings"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Phase</label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value as ProjectPhase)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {PROJECT_PHASES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Scope description (sent to subs)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detailed scope of work, materials, timeline expectations…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Sub picker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Send to subs ({invitees.length} selected)
            </label>
            {subs.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                No subs in your directory yet. Add subs from the Subs &amp; Suppliers page first.
              </p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                {subs.map((s) => {
                  const checked = invitees.some((i) => i.sub_ref === s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 ${checked ? "bg-sky-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSub(s)}
                        className="rounded text-sky-600 focus:ring-sky-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{s.name}</p>
                        {s.account_number && (
                          <p className="truncate text-[11px] text-slate-500">{s.account_number}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Invitee grid (only when there are subs selected and we're editing or post-draft) */}
          {invitees.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Bid responses {respondedCount > 0 && `(${respondedCount} of ${invitees.length})`}
              </label>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2">Sub</th>
                      <th className="px-3 py-2 text-right">Bid amount</th>
                      <th className="px-3 py-2">Notes</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedInvitees.map((inv) => {
                      const files = bidFiles.get(inv.sub_ref) ?? [];
                      const fromPortal = !!inv.responded_at;
                      const rowBg =
                        inv.status === "selected" ? "bg-emerald-50" : "bg-white";
                      return (
                        <Fragment key={inv.sub_ref}>
                          <tr className={rowBg}>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {inv.sub_name}
                              {fromPortal && (
                                <span
                                  title="Bid submitted through the sub portal"
                                  className="ml-1.5 inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider text-sky-700"
                                >
                                  Portal
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                value={inv.bid_amount ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateInvitee(inv.sub_ref, {
                                    bid_amount: v === "" ? undefined : parseFloat(v),
                                    status: v === "" ? "sent" : "responded",
                                    responded_at: v !== "" && !inv.responded_at ? new Date().toISOString() : inv.responded_at,
                                  });
                                }}
                                placeholder="—"
                                className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-xs tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={inv.bid_notes || ""}
                                onChange={(e) => updateInvitee(inv.sub_ref, { bid_notes: e.target.value })}
                                placeholder="Inclusions/exclusions…"
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-[11px]">
                              <span className={`rounded-full px-1.5 py-0.5 ${
                                inv.status === "selected" ? "bg-emerald-100 text-emerald-700" :
                                inv.status === "responded" ? "bg-blue-100 text-blue-700" :
                                inv.status === "passed" ? "bg-slate-100 text-slate-500" :
                                "bg-sky-100 text-sky-700"
                              }`}>
                                {inv.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {inv.status !== "selected" && inv.bid_amount && (
                                <Tooltip
                                  label="Pick this sub as the winner. Unlocks the → Estimate button so you can drop their bid into the project estimate."
                                  placement="left"
                                >
                                  <button
                                    onClick={() => awardTo(inv.sub_ref)}
                                    className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100"
                                  >
                                    Award
                                  </button>
                                </Tooltip>
                              )}
                              {inv.status === "selected" && (
                                <CheckCircleIcon className="ml-auto h-4 w-4 text-emerald-600" />
                              )}
                            </td>
                          </tr>
                          {files.length > 0 && (
                            <tr className={rowBg}>
                              <td
                                colSpan={5}
                                className="px-3 pb-2 pt-0 text-[11px]"
                              >
                                <div className="flex flex-wrap items-center gap-1.5 pl-3">
                                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                                    Files:
                                  </span>
                                  {files.map((f) => (
                                    <a
                                      key={f.id}
                                      href={f.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] text-sky-700 ring-1 ring-slate-200 hover:bg-sky-50"
                                      title={`${(f.size / 1024).toFixed(0)} KB · uploaded ${new Date(f.uploaded_at).toLocaleDateString()}`}
                                    >
                                      📎 {f.name}
                                    </a>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Internal notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Notes only you see…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        {sendReport && (
          <div className="border-t border-slate-200 px-6 py-2 text-[11px] text-slate-600">
            {sendReport}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-3">
          <button
            onClick={onClose}
            disabled={sending}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => save(false)}
            disabled={sending}
            className="rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            onClick={() => save(true)}
            disabled={invitees.length === 0 || !title.trim() || sending}
            className="inline-flex items-center gap-1 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            {sending
              ? "Sending…"
              : existing?.sent_at
                ? "Save"
                : `Send to ${invitees.length} sub${invitees.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
