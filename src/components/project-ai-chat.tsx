"use client";

import { useEffect, useRef, useState } from "react";
import {
  SparklesIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Deal, Distributor, QuoteLine } from "@/types";
import { ProjectMilestone, ProjectPhoto } from "@/types/builder";
import {
  listMilestones,
  listQuoteLines,
  listPhotos,
  listDistributors,
} from "@/lib/store";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "Where's our margin coming from?",
  "When does framing finish?",
  "How much have we billed the client so far?",
  "What's the status of MEP rough-in?",
];

export default function ProjectAIChat({ deal }: { deal: Deal }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist conversation per deal across page reloads.
  const storageKey = `chat:${deal.id}`;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [storageKey]);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore quota errors
    }
  }, [messages, storageKey]);

  // Auto-scroll to latest.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      // Pull live project context for grounding.
      const [milestones, quoteLines, photos, subs] = await Promise.all([
        listMilestones(deal.id),
        listQuoteLines(deal.id),
        listPhotos(deal.id),
        listDistributors(deal.org_ref),
      ]);
      const context = buildContext(deal, milestones, quoteLines, photos, subs);

      const res = await fetch("/api/project-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, context }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      setMessages([...nextMessages, { role: "assistant", content: json.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Roll back the optimistic user message so they can retry.
      setMessages(messages);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function reset() {
    if (messages.length === 0) return;
    if (!confirm("Clear the conversation?")) return;
    setMessages([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <SparklesIcon className="h-4 w-4 text-sky-600" />
          <h2 className="text-sm font-semibold text-slate-900">Ask the project AI</h2>
          <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sky-800">
            Beta
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={reset}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
            title="Clear conversation"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="max-h-[420px] min-h-[180px] overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <EmptyState onPick={(q) => send(q)} />
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.content} />
            ))}
            {sending && <Bubble role="assistant" text="…" pending />}
          </div>
        )}
      </div>

      {error && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="border-t border-slate-200 px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about this project — costs, schedule, status…"
            rows={1}
            className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <button
            onClick={() => send(input)}
            disabled={sending || !input.trim()}
            className="inline-flex items-center justify-center rounded-md bg-sky-600 p-2 text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
            title="Send"
            aria-label="Send"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-400">
          Grounded in this project&apos;s data. Verify before relying on numbers.
        </p>
      </div>
    </section>
  );
}

function Bubble({
  role,
  text,
  pending,
}: {
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-sky-600 px-3 py-2 text-sm text-white">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-sky-100">
        <SparklesIcon className="h-3.5 w-3.5 text-sky-700" />
      </div>
      <div className={`max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-sm text-slate-800 ${pending ? "animate-pulse" : ""}`}>
        {pending ? <DotPulse /> : <pre className="whitespace-pre-wrap font-sans">{text}</pre>}
      </div>
    </div>
  );
}

function DotPulse() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="space-y-3 py-2 text-center">
      <p className="text-xs text-slate-500">
        Ask anything about this project. Try one of these:
      </p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function buildContext(
  deal: Deal,
  milestones: ProjectMilestone[],
  quoteLines: QuoteLine[],
  photos: ProjectPhoto[],
  subs: Distributor[]
) {
  const photo_counts_by_phase: Record<string, number> = {};
  for (const p of photos) {
    photo_counts_by_phase[p.phase] = (photo_counts_by_phase[p.phase] || 0) + 1;
  }
  const subById = new Map(subs.map((s) => [s.id, s]));
  return {
    deal: {
      id: deal.id,
      name: deal.name,
      stage: deal.stage,
      deal_type: deal.deal_type,
      manufacturer: deal.manufacturer,
      account_name: deal.account_name,
      ship_to_address: deal.ship_to_address,
      solicitation_number: deal.solicitation_number,
      customer_po: deal.customer_po,
      total_quote_value: deal.total_quote_value,
      total_cost: deal.total_cost,
      award_total: deal.award_total,
      margin_percent: deal.margin_percent,
      notes: deal.notes,
      due_date: deal.due_date,
      award_date: deal.award_date,
    },
    milestones: milestones.map((m) => ({
      name: m.name,
      description: m.description,
      status: m.status,
      percentage: m.percentage,
      amount: m.amount,
      planned_start_date: m.planned_start_date,
      planned_end_date: m.planned_end_date,
      started_at: m.started_at,
      marked_complete_at: m.marked_complete_at,
      approved_at: m.approved_at,
      released_at: m.released_at,
      assigned_subs: (m.assigned_subs || []).map((id) => {
        const s = subById.get(id);
        return s ? `${s.name}${s.account_number ? ` (${s.account_number})` : ""}` : id;
      }),
    })),
    quote_lines: quoteLines.map((l) => ({
      line_number: l.line_number,
      product_code: l.product_code,
      description: l.description,
      qty: l.qty,
      cost_unit_price: l.cost_unit_price,
      cost_extended: l.cost_extended,
      customer_unit_price: l.customer_unit_price,
      customer_extended: l.customer_extended,
      margin_percent: l.margin_percent,
      markup_percent: l.markup_percent,
    })),
    photo_counts_by_phase,
  };
}
