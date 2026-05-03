// Configuration shape for a document-type template.
//
// A template tells the parser how to recognize and extract a specific
// document format (e.g. "Federal Section-B Award", "ScanSource Quote",
// "Frequentis Purchase Order"). Templates are *data*, not code — adding
// support for a new format is a config file, not a parser rewrite.
//
// v1: templates ship as typed objects in src/lib/parsers/templates/.
// v2: customers upload their own via UI, persisted to Firestore.
// Same shape either way.

/**
 * A logical field name produced by the BOM extractor. Templates map
 * raw header text → these via regex rules.
 */
export type BomFieldName =
  | "item_number"
  | "description"
  | "part_number"
  | "qty"
  | "unit_price"
  | "extended_price"
  | "list_price"
  | "discount"
  | "ignore";

export interface BomColumnRule {
  /** Regex source (without flags). Matched case-insensitively against header text. */
  pattern: string;
  field: BomFieldName;
}

export interface BomConfig {
  /** Keywords used to find the BOM table among many tables in a doc. */
  headerKeywords: string[];
  /** Minimum number of headerKeywords that must match a row to consider it a BOM table header. */
  minHeaderMatches: number;
  /** Regex rules mapping header cell text → logical field. First match wins. */
  columnRules: BomColumnRule[];
  /** Tolerance for per-row arithmetic check (qty × unit ≈ ext). Cents. */
  arithmeticToleranceCents?: number;
}

export interface MetadataField {
  /** Logical field name (the key in the resulting metadata object). */
  name: string;
  /** Plain-language description of what to extract — read by the LLM. */
  prompt: string;
}

export interface MetadataConfig {
  /** Fields the LLM should extract from the document text. */
  fields: MetadataField[];
  /** Optional override for the system prompt. Use the default unless a
   *  template needs unusual instructions (e.g. ignore certain fields,
   *  treat empty as null vs omit, etc.). */
  systemPrompt?: string;
  /** How many pages of LINE-block text to feed the LLM. Most metadata
   *  lives in the first 1-3 pages; padding past 6 inflates token cost
   *  without improving accuracy. */
  maxPages?: number;
}

export interface DetectionConfig {
  /** Keywords that, if all are found in the doc's first-N-pages text,
   *  identify this template. Used during auto-detection. */
  textKeywords?: string[];
  /** Filename glob — useful for testing or when filenames are reliable
   *  (e.g. "*Scansource*Quote*.xlsx"). Optional. */
  filenamePattern?: string;
  /** Detection priority — higher wins when multiple templates match.
   *  Use for cases where a specific template should beat a generic one. */
  priority?: number;
}

export interface ExtractorTemplate {
  /** Stable identifier — used for routing and persistence. lowercase-kebab. */
  id: string;
  /** Human-readable name for UI ("Federal Section-B Award"). */
  name: string;
  /** One-sentence description of when this template applies. */
  description: string;
  /** Document kind — drives display in the UI. */
  kind: "award" | "distributor_quote" | "vendor_po" | "customer_quote" | "shipment" | "other";
  /** How to recognize a document as matching this template. */
  detection: DetectionConfig;
  /** How to extract the BOM table. Optional — some templates (e.g. a
   *  parent-line-only PO) skip the BOM and rely entirely on the LLM. */
  bom?: BomConfig;
  /** How to extract document-level metadata via LLM. */
  metadata: MetadataConfig;
}
