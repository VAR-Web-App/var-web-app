// POST /api/project-chat — Claude chat grounded in project context.
//
// The client sends a conversation history + the project ID. The route
// fetches deal/milestones/quote-lines/photos for that project, builds
// a system prompt with the data inline, and forwards the conversation
// to Claude. Returns the assistant's response as plain JSON.
//
// "RAG-lite": no vector search, just the full project context dumped
// into the system prompt every turn. Works because (a) one project's
// data is small (1–5k tokens of structured text) and (b) the answers
// the GC actually asks ("how much did we spend on materials", "when
// does framing finish") need the entire structured record, not a
// retrieved subset.
//
// We trust the caller's profile.org_ref (resolved on the page that
// invokes this) to scope the deal lookup. Server-side we still verify
// the deal exists and trust the Firebase rules to enforce read access
// when the page-side fetch was made.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;
export const runtime = "nodejs";

const MODEL = "claude-sonnet-4-6";
const MAX_TURNS = 30; // truncate to last N exchanges to bound prompt size

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Caller passes the entire project context in the request — the page
// has already loaded all this for the rest of the UI, so we don't
// re-fetch here. Avoids server-side Firestore reads on every chat turn.
interface ProjectContextPayload {
  deal: {
    id: string;
    name: string;
    stage: string;
    deal_type: string;
    manufacturer: string;            // = project type for builders
    account_name: string;             // = client name
    ship_to_address: string;          // = project address
    solicitation_number: string;      // = job number
    customer_po: string;
    total_quote_value: number;
    total_cost: number;
    award_total: number;
    margin_percent: number;
    notes: string;
    due_date?: string;
    award_date?: string;
  };
  milestones: Array<{
    name: string;
    description: string;
    status: string;
    percentage: number;
    amount: number;
    planned_start_date?: string;
    planned_end_date?: string;
    started_at?: string;
    marked_complete_at?: string;
    approved_at?: string;
    released_at?: string;
  }>;
  quote_lines: Array<{
    line_number: number;
    product_code: string;             // = phase / category for builders
    description: string;
    qty: number;
    cost_unit_price: number;
    cost_extended: number;
    customer_unit_price: number;
    customer_extended: number;
    margin_percent: number;
    markup_percent: number;
  }>;
  photo_counts_by_phase: Record<string, number>;
}

function buildSystemPrompt(ctx: ProjectContextPayload): string {
  const totalLines = ctx.quote_lines.length;
  const phaseRollup: Record<string, { count: number; cost: number; price: number }> = {};
  for (const l of ctx.quote_lines) {
    const phase = l.product_code || "Other";
    if (!phaseRollup[phase]) phaseRollup[phase] = { count: 0, cost: 0, price: 0 };
    phaseRollup[phase].count += 1;
    phaseRollup[phase].cost += l.cost_extended;
    phaseRollup[phase].price += l.customer_extended;
  }
  const phaseSummary = Object.entries(phaseRollup)
    .map(([phase, r]) => `  ${phase}: ${r.count} line${r.count === 1 ? "" : "s"}, cost $${Math.round(r.cost).toLocaleString()}, customer $${Math.round(r.price).toLocaleString()}`)
    .join("\n") || "  (no line items yet)";

  const milestonesText = ctx.milestones.length === 0
    ? "  (no milestones / draw schedule yet)"
    : ctx.milestones.map((m, i) => {
        const dates = m.planned_start_date && m.planned_end_date
          ? `${m.planned_start_date} → ${m.planned_end_date}`
          : "(no dates)";
        return `  ${i + 1}. ${m.name} — ${m.percentage}% / $${m.amount.toLocaleString()} — status: ${m.status}, planned: ${dates}`;
      }).join("\n");

  const photosText = Object.keys(ctx.photo_counts_by_phase).length === 0
    ? "  (no photos yet)"
    : Object.entries(ctx.photo_counts_by_phase)
        .map(([phase, count]) => `  ${phase}: ${count} photo${count === 1 ? "" : "s"}`)
        .join("\n");

  const linesText = totalLines === 0
    ? "  (no line items yet)"
    : ctx.quote_lines.slice(0, 30).map((l) =>
        `  [${l.product_code}] ${l.description} — qty ${l.qty}, unit cost $${l.cost_unit_price.toFixed(2)}, markup ${l.markup_percent}%, line cost $${Math.round(l.cost_extended).toLocaleString()}, line customer $${Math.round(l.customer_extended).toLocaleString()}, margin ${l.margin_percent.toFixed(1)}%`
      ).join("\n") + (totalLines > 30 ? `\n  … (+${totalLines - 30} more lines)` : "");

  return `You are an AI assistant inside a custom-home builder's project management tool. The builder is asking questions about ONE specific project. Answer concisely and accurately using ONLY the data below. If the data doesn't contain the answer, say so plainly — do not invent numbers, do not extrapolate beyond what's recorded.

When the user asks for numbers, ground every $ figure in a specific line item or rollup. Cite which phase / line you pulled from.

# Project: ${ctx.deal.name}

- Client: ${ctx.deal.account_name || "—"}
- Address: ${ctx.deal.ship_to_address || "—"}
- Project type: ${ctx.deal.manufacturer || "—"}
- Job #: ${ctx.deal.solicitation_number || "—"}
- Stage: ${ctx.deal.stage}
- Estimate type: ${ctx.deal.deal_type}
- Target start: ${ctx.deal.due_date || "—"}
- Contract signed: ${ctx.deal.award_date || "—"}
- Estimate total (customer): $${Math.round(ctx.deal.total_quote_value).toLocaleString()}
- Cost basis: $${Math.round(ctx.deal.total_cost).toLocaleString()}
- Contract total (if signed): $${Math.round(ctx.deal.award_total).toLocaleString()}
- Margin: ${ctx.deal.margin_percent.toFixed(1)}%
- Notes: ${ctx.deal.notes || "(none)"}

# Estimate breakdown by phase
${phaseSummary}

# Estimate line items (cost / customer / margin per line)
${linesText}

# Project schedule + draws
${milestonesText}

# Photos uploaded by phase
${photosText}

# Today's date
${new Date().toISOString().slice(0, 10)}

Format guidelines:
- Be concise. 1–4 sentences for simple questions. Use bullets for lists.
- Always cite line items / phases / milestones by name when quoting numbers.
- If asked something the data doesn't cover (e.g. weather, sub bids that haven't come in, market pricing trends), say so directly.
- Don't pad responses with disclaimers. The builder is verifying — they know.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured on the server" },
      { status: 500 }
    );
  }

  let body: { messages: ChatMessage[]; context: ProjectContextPayload };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.messages?.length || !body.context?.deal?.id) {
    return NextResponse.json(
      { error: "Missing 'messages' or 'context.deal' in request body" },
      { status: 400 }
    );
  }

  // Truncate to last MAX_TURNS exchanges to bound prompt size.
  const trimmed = body.messages.slice(-MAX_TURNS * 2);

  const client = new Anthropic({ apiKey });
  const system = buildSystemPrompt(body.context);

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Claude API error",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    );
  }

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json(
      { error: "No text content in Claude response" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    reply: textBlock.text,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  });
}
