// POST /api/email/digest — triage a forwarded email with Claude.
//
// The AI half of the "Email Digester" add-on, built on the same generic
// extractor the invoice parser uses. Given a pasted email + the builder's
// active projects, it returns which project the email belongs to, a short
// summary, action items, and a draft reply. (Auto-inbox sync via Gmail OAuth
// is the future ingestion half; paste works today with zero setup.)

import { NextRequest, NextResponse } from "next/server";
import { extractMetadataWithLlm } from "@/lib/parsers/llm-metadata";

export const runtime = "nodejs";

export interface EmailDigest {
  matched_project_id?: string | null;
  matched_project_name?: string | null;
  confidence?: "high" | "medium" | "low";
  summary?: string;
  action_items?: string[];
  suggested_reply?: string;
}

interface Body {
  email?: string;
  projects?: { id: string; name: string; client?: string }[];
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const email = body.email?.trim();
  if (!email) {
    return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Email digester not configured (missing ANTHROPIC_API_KEY)." },
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
    const digest = await extractMetadataWithLlm<EmailDigest>({
      systemPrompt:
        "You triage forwarded emails for a custom-home builder's back office. You return ONLY a JSON object — no prose, no markdown fences.",
      fieldsPrompt: `Read the forwarded email and produce a triage digest.

Active projects (match the email to ONE by client name, address, or project name; use null if none clearly fit):
${list}

Return a JSON object with these fields:
- matched_project_id: the id of the best-matching project, or null
- matched_project_name: that project's name, or null
- confidence: "high", "medium", or "low"
- summary: a 1-2 sentence plain-language summary of what the email is about
- action_items: array of short imperative strings the builder should act on (empty array if none)
- suggested_reply: a short, professional plain-text draft reply the builder could send`,
      documentText: email,
      maxTokens: 1500,
    });
    return NextResponse.json({ ok: true, digest });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "digest_failed" },
      { status: 502 },
    );
  }
}
