// Built-in template registry.
//
// v1: hard-coded list of TS templates.
// v2: this file fetches per-tenant templates from Firestore + merges
// with built-ins.

import type { ExtractorTemplate } from "./types";
import { FEDERAL_AWARD_TEMPLATE } from "./federal-award";

export const BUILTIN_TEMPLATES: ExtractorTemplate[] = [
  FEDERAL_AWARD_TEMPLATE,
];

/**
 * Pick the best template for a document by running each template's
 * detection rules against the document's first-N-pages text. Higher
 * priority wins when multiple templates match. Returns a fallback to
 * the highest-priority template if nothing matches — better to attempt
 * extraction than to bail entirely.
 */
export function detectTemplate(
  pageText: string,
  templates: ExtractorTemplate[] = BUILTIN_TEMPLATES,
): ExtractorTemplate {
  if (templates.length === 0) {
    throw new Error("No templates registered");
  }

  const lower = pageText.toLowerCase();
  const matches = templates
    .map((t) => {
      const keywords = t.detection.textKeywords ?? [];
      const matched =
        keywords.length === 0
          ? 0
          : keywords.filter((k) => lower.includes(k.toLowerCase())).length;
      const allMatched = keywords.length > 0 && matched === keywords.length;
      return { template: t, allMatched, score: matched };
    })
    .filter((m) => m.allMatched);

  if (matches.length === 0) {
    // No template's keywords all matched. Fall back to the lowest-priority
    // (most generic) template — better to try than to refuse.
    return [...templates].sort(
      (a, b) => (a.detection.priority ?? 0) - (b.detection.priority ?? 0),
    )[0];
  }

  matches.sort(
    (a, b) =>
      (b.template.detection.priority ?? 0) - (a.template.detection.priority ?? 0) ||
      b.score - a.score,
  );
  return matches[0].template;
}

export type { ExtractorTemplate, BomConfig, MetadataConfig, MetadataField, BomFieldName, BomColumnRule, DetectionConfig } from "./types";
