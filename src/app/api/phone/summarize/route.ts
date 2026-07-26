// POST /api/phone/summarize — turn a call transcript into project notes.
//
// The AI half of "Phone Call Summarization". Audio→transcript needs a speech
// service (Twilio Voice / Whisper) — that's the future ingestion seam; pasting
// or uploading a transcript works today. Given the transcript + the org's
// projects, Claude routes it, identifies the caller, summarizes, and extracts
// action items the builder can drop into the project log.

import { NextRequest, NextResponse } from "next/server";
import { extractMetadataWithLlm } from "@/lib/parsers/llm-metadata";

export const runtime = "nodejs";

export interface CallSummary {
  matched_project_id?: string | null;
  matched_project_name?: string | null;
  confidence?: "high" | "medium" | "low";
  caller?: string;
  summary?: string;
  action_items?: string[];
}

interface Body {
  transcript?: string;
  projects?: { id: string; name: string; client?: string }[];
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const transcript = body.transcript?.trim();
  if (!transcript) {
    return NextResponse.json({ ok: false, error: "missing_transcript" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Call summarizer not configured (missing ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  const projects = body.projects ?? [];
  const list =
    projects.length > 0
      ? projects
          .map((p) => `- id:${p.id} | ${p.name}${p.client ? ` | client: ${p.client}` : ""}`)
          .join("\n")
      : "(no active projects provided)";

  try {
    const summary = await extractMetadataWithLlm<CallSummary>({
      systemPrompt:
        "You summarize phone-call transcripts for a custom-home builder. You return ONLY a JSON object — no prose, no markdown fences.",
      fieldsPrompt: `Summarize this phone call and prepare it for the project log.

Active projects (match the call to ONE by client name, address, or project name; use null if none clearly fit):
${list}

Return a JSON object with these fields:
- matched_project_id: the id of the best-matching project, or null
- matched_project_name: that project's name, or null
- confidence: "high", "medium", or "low"
- caller: who was on the call (name/role) if identifiable, else omit
- summary: a 2-4 sentence plain-language recap of what was discussed and decided
- action_items: array of short imperative strings the builder should act on (empty array if none)`,
      documentText: transcript,
      maxTokens: 1500,
    });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "summarize_failed" },
      { status: 502 },
    );
  }
}
