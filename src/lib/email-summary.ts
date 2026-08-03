// One-line AI summary of a client email, so the builder can see what they're
// asking without opening it. Reuses the shared LLM helper (the same one behind
// the email digest) on the cheap Haiku model — the email is already matched to
// a deal, so there's no project-guessing to do, just summarize + pull asks.
// Best-effort: any failure returns {} and the email still files fine.

import { extractMetadataWithLlm } from "./parsers/llm-metadata";

const HAIKU = "claude-haiku-4-5-20251001";

export interface EmailSummary {
  summary?: string;
  action_items?: string[];
}

export async function summarizeEmail(
  subject: string,
  text: string,
): Promise<EmailSummary> {
  const body = `Subject: ${subject}\n\n${text}`.slice(0, 6000).trim();
  if (!body) return {};
  try {
    const r = await extractMetadataWithLlm<EmailSummary>({
      documentText: body,
      systemPrompt:
        "You summarize a client's email to their home builder. Return ONLY a JSON object, no prose or markdown. Be concise and concrete.",
      fieldsPrompt: `- summary: ONE plain-language sentence (max ~18 words) of what the client wants or is asking.
- action_items: array of short imperative to-dos for the builder (e.g. "Price the tile swap"). Empty array if none.`,
      model: HAIKU,
      maxTokens: 400,
    });
    return {
      summary: typeof r.summary === "string" ? r.summary : undefined,
      action_items: Array.isArray(r.action_items)
        ? r.action_items.filter((a) => typeof a === "string").slice(0, 5)
        : undefined,
    };
  } catch {
    return {};
  }
}
