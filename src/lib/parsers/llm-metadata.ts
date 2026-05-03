// Generic LLM-based metadata extractor. Sends document text to Claude and
// asks for a structured JSON response matching a caller-supplied schema.
//
// LLM is the right tool for "fields that live anywhere on the page in
// natural-language context" — dates, addresses, names, contract numbers.
// Textract is the right tool for tabular data. Use both, not either.

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const DEFAULT_SYSTEM_PROMPT = `You extract structured metadata from business documents.
You return ONLY a JSON object matching the requested schema. No prose, no markdown, no explanation.
If a field is not present in the document, omit it from the JSON (do not return null or empty strings).
Dates must be in ISO format (YYYY-MM-DD).
Dollar amounts must be plain numbers without currency symbols.`;

export interface LlmExtractOptions {
  /** Document text to extract from (typically reconstructed from Textract LINE blocks). */
  documentText: string;
  /** Plain-language description of the fields to extract. Field-by-field works best. */
  fieldsPrompt: string;
  /** Override the system prompt — only needed for non-business-document use cases. */
  systemPrompt?: string;
  /** Anthropic model name. Defaults to Sonnet 4.6 (best price/quality for extraction tasks). */
  model?: string;
  /** Token budget for the response. 2000 covers most extraction tasks. */
  maxTokens?: number;
}

export async function extractMetadataWithLlm<T>(
  options: LlmExtractOptions,
): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const anthropic = new Anthropic({ apiKey });

  const userPrompt = `Extract these fields from the document below:

${options.fieldsPrompt}

Return ONLY a JSON object. Do not wrap in markdown code fences.

DOCUMENT:
${options.documentText}`;

  const response = await anthropic.messages.create({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: options.maxTokens ?? 2000,
    system: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Tolerate models that occasionally wrap the response in a markdown
  // code fence despite the instruction not to. Strip and retry parse.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`LLM returned non-JSON response: ${cleaned.substring(0, 200)}`);
  }
}
