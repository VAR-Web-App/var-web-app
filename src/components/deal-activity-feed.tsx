"use client";

// Per-deal activity feed — the "what's happened on this project" timeline
// (the per-project notifications neither this app nor Avanchor had). Derived,
// not stored: it reads the deal's existing records (draws/milestones, change
// orders, payments, requests) and merges them into one chronological feed —
// so it's rich immediately with zero new writes. A localStorage cursor drives
// a "N new" badge since you last looked.

import { useEffect, useMemo, useState } from "react";
import {
  BoltIcon,
  CurrencyDollarIcon,
  ClipboardDocumentCheckIcon,
  ChatBubbleLeftRightIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import {
  listMilestones,
  listChangeOrders,
  listPayments,
  listRequests,
} from "@/lib/store";
import type { Deal } from "@/types";

type EventKind = "draw" | "co" | "payment" | "request";

interface FeedEvent {
  at: string; // ISO
  kind: EventKind;
  text: string;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const ICON: Record<EventKind, React.ComponentType<{ className?: string }>> = {
  draw: CurrencyDollarIcon,
  co: ClipboardDocumentCheckIcon,
  payment: BanknotesIcon,
  request: ChatBubbleLeftRightIcon,
};

export default function DealActivityFeed({ deal }: { deal: Deal }) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const seenKey = `kp_activity_seen_${deal.id}`;
  const [lastSeen, setLastSeen] = useState<string>("");

  useEffect(() => {
    try {
      setLastSeen(localStorage.getItem(seenKey) ?? "");
    } catch {}
  }, [seenKey]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [ms, cos, pays, reqs] = await Promise.all([
        listMilestones(deal.id).catch(() => []),
        listChangeOrders(deal.id).catch(() => []),
        listPayments(deal.id).catch(() => []),
        listRequests(deal.id).catch(() => []),
      ]);
      if (!active) return;
      const ev: FeedEvent[] = [];
      for (const m of ms) {
        if (m.released_at) ev.push({ at: m.released_at, kind: "draw", text: `Draw released — ${m.name} (${money(m.amount)})` });
        else if (m.approved_at) ev.push({ at: m.approved_at, kind: "draw", text: `Draw approved by client — ${m.name}` });
        else if (m.marked_complete_at) ev.push({ at: m.marked_complete_at, kind: "draw", text: `${m.name} marked complete` });
      }
      for (const c of cos) {
        if (c.approved_at) ev.push({ at: c.approved_at, kind: "co", text: `Change order ${c.number} approved (${money(c.amount_delta)})` });
        else if (c.created_at) ev.push({ at: c.created_at, kind: "co", text: `Change order ${c.number} created — ${c.title}` });
      }
      for (const p of pays) {
        const when = p.created_at || `${p.date}T00:00:00.000Z`;
        ev.push({
          at: when,
          kind: "payment",
          text: p.direction === "in"
            ? `Payment received — ${money(p.amount)} from ${p.party_name}`
            : `Paid ${p.party_name} — ${money(p.amount)}`,
        });
      }
      for (const r of reqs) {
        if (r.resolved_at) ev.push({ at: r.resolved_at, kind: "request", text: `Request ${r.status === "done" ? "done" : "closed"} — ${r.title}` });
        else if (r.created_at) ev.push({ at: r.created_at, kind: "request", text: `Request logged — ${r.title}` });
      }
      ev.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
      setEvents(ev.slice(0, 25));
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [deal.id]);

  const newCount = useMemo(
    () => (lastSeen ? events.filter((e) => e.at > lastSeen).length : 0),
    [events, lastSeen],
  );

  function markSeen() {
    const top = events[0]?.at ?? new Date().toISOString();
    try { localStorage.setItem(seenKey, top); } catch {}
    setLastSeen(top);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <BoltIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
          {newCount > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
              {newCount} new
            </span>
          )}
        </div>
        {newCount > 0 && (
          <button onClick={markSeen} className="text-[11px] font-medium text-sky-700 hover:text-sky-900">
            Mark seen
          </button>
        )}
      </header>
      {!loaded ? (
        <p className="px-4 py-5 text-sm text-slate-500">Loading…</p>
      ) : events.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-slate-400">
          No activity yet — draws, change orders, payments, and requests show up here.
        </p>
      ) : (
        <ul className="max-h-96 overflow-y-auto divide-y divide-slate-50">
          {events.map((e, i) => {
            const Icon = ICON[e.kind];
            const isNew = !!lastSeen && e.at > lastSeen;
            return (
              <li key={i} className={`flex items-start gap-2.5 px-4 py-2.5 ${isNew ? "bg-amber-50/50" : ""}`}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="text-xs text-slate-700">{e.text}</p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(e.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
