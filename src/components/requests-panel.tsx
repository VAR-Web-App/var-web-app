"use client";

// Per-deal Requests / asks log — the paper trail for ad-hoc client requests
// (the "fireplace nuance during framing, mason executes it months later" case).
// Log the ask, tie it to the phase + sub who'll execute it, track status.
// Distinct from Selections (allowances) and Change Orders (priced/signed).

import { useEffect, useState } from "react";
import {
  ChatBubbleLeftRightIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import Tooltip from "@/components/tooltip";
import Link from "next/link";
import {
  listRequests,
  saveRequest,
  deleteRequest,
  unlinkEmailsFromRequest,
  newId,
  listMilestones,
  listDistributors,
  listChangeOrders,
  saveChangeOrder,
} from "@/lib/store";
import type {
  ProjectRequest,
  RequestStatus,
  RequestSource,
  ProjectMilestone,
} from "@/types/builder";
import type { Deal, Distributor } from "@/types";

const STATUS_LABEL: Record<RequestStatus, string> = {
  open: "Open",
  scheduled: "In progress",
  done: "Done",
  wont_do: "Won't do",
};
const STATUS_STYLE: Record<RequestStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  scheduled: "bg-sky-100 text-sky-800",
  done: "bg-emerald-100 text-emerald-800",
  wont_do: "bg-slate-100 text-slate-500",
};
const SOURCES: RequestSource[] = ["verbal", "email", "text", "call", "portal"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function RequestsPanel({ deal }: { deal: Deal }) {
  const [reqs, setReqs] = useState<ProjectRequest[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [subs, setSubs] = useState<Distributor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState<RequestSource>("verbal");
  const [phaseRef, setPhaseRef] = useState("");
  const [subRef, setSubRef] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [r, m, s] = await Promise.all([
        listRequests(deal.id),
        listMilestones(deal.id).catch(() => []),
        listDistributors(deal.org_ref).catch(() => []),
      ]);
      if (!active) return;
      setReqs(r);
      setMilestones(m);
      setSubs(s);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [deal.id, deal.org_ref]);

  const refresh = async () => setReqs(await listRequests(deal.id));

  async function add() {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    await saveRequest({
      id: newId("req"),
      deal_ref: deal.id,
      org_ref: deal.org_ref,
      title: title.trim(),
      body: body.trim(),
      phase_ref: phaseRef || undefined,
      assigned_sub_ref: subRef || undefined,
      status: "open",
      source,
      created_at: now,
      updated_at: now,
    });
    setTitle("");
    setBody("");
    setSource("verbal");
    setPhaseRef("");
    setSubRef("");
    setAdding(false);
    await refresh();
  }

  async function setStatus(r: ProjectRequest, status: RequestStatus) {
    const now = new Date().toISOString();
    await saveRequest({
      ...r,
      status,
      updated_at: now,
      resolved_at: status === "done" || status === "wont_do" ? now : undefined,
    });
    await refresh();
  }

  async function remove(r: ProjectRequest) {
    setConfirmDeleteId(null);
    await deleteRequest(r.id);
    // Clear the link on the source email so it doesn't show a dead
    // "View request" and can be re-logged.
    await unlinkEmailsFromRequest(r.id, r.org_ref);
    await refresh();
  }

  // Escalate an ask into a priced change order (draft) seeded from the request.
  async function convertToCO(r: ProjectRequest) {
    const cos = await listChangeOrders(deal.id).catch(() => []);
    const used = cos
      .map((c) => parseInt(c.number.replace(/\D/g, ""), 10))
      .filter(Number.isFinite);
    const number = `CO-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
    const now = new Date().toISOString();
    const coId = newId("co");
    await saveChangeOrder({
      id: coId,
      deal_ref: deal.id,
      org_ref: deal.org_ref,
      number,
      title: r.title,
      description: r.body || r.title,
      amount_delta: 0,
      schedule_impact_days: 0,
      reason: "client_request",
      status: "draft",
      notes: `Created from a logged request (${new Date(r.created_at).toLocaleDateString()}).`,
      // Carry the client's original words through so the CO — and its client
      // approval — shows what they actually asked for.
      source_message_id: r.source_message_id,
      source_from: r.source_from,
      source_excerpt: r.source_excerpt,
      source_at: r.source_at,
      created_at: now,
      updated_at: now,
    });
    await saveRequest({ ...r, status: "scheduled", co_ref: coId, updated_at: now });
    setToast(`${number} created (draft) — price & send it on the Finances tab.`);
    setTimeout(() => setToast(null), 3500);
    await refresh();
  }

  // Active asks (open/scheduled) surface first, above resolved ones.
  const ACTIVE = new Set<RequestStatus>(["open", "scheduled"]);
  const sorted = [...reqs].sort((a, b) => {
    const rank = (ACTIVE.has(a.status) ? 0 : 1) - (ACTIVE.has(b.status) ? 0 : 1);
    return rank || (b.created_at || "").localeCompare(a.created_at || "");
  });
  const openCount = reqs.filter((r) => r.status === "open").length;

  const phaseName = (id?: string) => milestones.find((m) => m.id === id)?.name;
  const subName = (id?: string) => subs.find((s) => s.id === id)?.name;
  const selectCls =
    "rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

  return (
    <section
      id="requests"
      className="scroll-mt-20 rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-2">
          <ChatBubbleLeftRightIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Requests &amp; asks</h2>
          {openCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              {openCount} open
            </span>
          )}
        </div>
        <Tooltip label="Log a new client ask on this project" placement="top">
          <button
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Log request
          </button>
        </Tooltip>
      </header>

      {adding && (
        <div className="space-y-3 border-b border-slate-100 bg-slate-50 p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What did they ask for? (e.g. Fireplace flush-mounted, not raised)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            autoFocus
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Details / context…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select value={source} onChange={(e) => setSource(e.target.value as RequestSource)} className={selectCls}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{cap(s)}</option>
              ))}
            </select>
            <select value={phaseRef} onChange={(e) => setPhaseRef(e.target.value)} className={selectCls}>
              <option value="">Phase (optional)</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <select value={subRef} onChange={(e) => setSubRef(e.target.value)} className={selectCls}>
              <option value="">Sub (optional)</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="text-xs font-medium text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            <Tooltip label="Save this ask to the project log" placement="top">
              <button
                onClick={add}
                disabled={!title.trim()}
                className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
              >
                Save request
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {!loaded ? (
        <p className="px-6 py-6 text-sm text-slate-500">Loading…</p>
      ) : reqs.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No requests logged</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Capture what the client asks for during the build — verbal or
            emailed — so it doesn&rsquo;t get lost and you have a paper trail.
            Tie it to the phase + sub who&rsquo;ll execute it.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sorted.map((r) => (
            <li key={r.id} className="px-4 py-3 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className="font-medium text-slate-900">{r.title}</span>
                  </div>
                  {r.body && <p className="mt-0.5 text-xs text-slate-600">{r.body}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {cap(r.source)} · {new Date(r.created_at).toLocaleDateString()}
                    {phaseName(r.phase_ref) ? ` · ${phaseName(r.phase_ref)}` : ""}
                    {subName(r.assigned_sub_ref) ? ` · ${subName(r.assigned_sub_ref)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {r.co_ref ? (
                    <Link
                      href={`/deals/${deal.id}/finances`}
                      className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      View CO →
                    </Link>
                  ) : (
                    ACTIVE.has(r.status) && (
                      <Tooltip
                        label="Turn this ask into a priced change order"
                        placement="top"
                      >
                        <button
                          onClick={() => convertToCO(r)}
                          className="rounded border border-slate-200 px-1.5 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-50"
                        >
                          → CO
                        </button>
                      </Tooltip>
                    )
                  )}
                  <select
                    value={r.status}
                    onChange={(e) => setStatus(r, e.target.value as RequestStatus)}
                    className="rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-600"
                  >
                    {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  {confirmDeleteId === r.id ? (
                    <span className="inline-flex items-center gap-1 text-[11px]">
                      <span className="text-slate-500">Delete?</span>
                      <button
                        onClick={() => void remove(r)}
                        className="rounded bg-red-600 px-1.5 py-0.5 font-medium text-white hover:bg-red-700"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded border border-slate-300 px-1.5 py-0.5 font-medium text-slate-600 hover:bg-slate-50"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <Tooltip label="Delete this request" placement="top">
                      <button
                        onClick={() => setConfirmDeleteId(r.id)}
                        aria-label="Delete request"
                        className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {toast && (
        <div className="border-t border-slate-100 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800">
          {toast}
        </div>
      )}
    </section>
  );
}
