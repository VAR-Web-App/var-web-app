// BOM-vs-Quote (or any-BOM-vs-any-BOM) comparison logic.
//
// Pure function over two BomLine arrays. The result is the input to the
// comparison UI — caller renders it however it wants.
//
// Match key is the part number (case-insensitive, trimmed). Item numbers
// are intentionally NOT used as the join key — they get renumbered between
// docs all the time. Description is a fallback when part numbers are missing
// on both sides, but in govcon BOMs that's rare.

import type { BomLine } from "./parsers";

export type LineDiff =
  | "match"          // qty + unit + extended all align
  | "price_mismatch" // unit_price differs (and/or extended)
  | "qty_mismatch"   // qty differs (often co-occurs with extended diff)
  | "qty_and_price"; // both qty and unit price differ

export interface MatchedRow {
  part_number: string;
  quote: BomLine;
  award: BomLine;
  diff: LineDiff;
  /** Specific issue messages. Empty array when diff === "match". */
  issues: string[];
}

export interface CompareResult {
  /** Lines whose part_number appears in BOTH quote and award. */
  matched: MatchedRow[];
  /** Lines in the quote but not the award (customer dropped the line). */
  only_in_quote: BomLine[];
  /** Lines in the award but not the quote (customer added — sometimes a mod). */
  only_in_award: BomLine[];
  totals: {
    quote_extended: number;
    award_extended: number;
    /** award - quote. Positive = award is larger. */
    delta: number;
  };
  /** Tally of matched rows by diff state for the summary banner. */
  counts: {
    match: number;
    price_mismatch: number;
    qty_mismatch: number;
    qty_and_price: number;
    only_in_quote: number;
    only_in_award: number;
  };
}

const PRICE_TOLERANCE = 0.005;
const EXT_TOLERANCE = 0.02;

function normalizeKey(part: string): string {
  return part.trim().toLowerCase();
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function classify(quote: BomLine, award: BomLine): { diff: LineDiff; issues: string[] } {
  const issues: string[] = [];
  const qtyDiffers = quote.qty !== award.qty;
  const priceDiffers = Math.abs(quote.unit_price - award.unit_price) > PRICE_TOLERANCE;
  const extDiffers = Math.abs(quote.extended_price - award.extended_price) > EXT_TOLERANCE;

  if (qtyDiffers) {
    issues.push(`qty: quote ${quote.qty} → award ${award.qty}`);
  }
  if (priceDiffers) {
    issues.push(
      `unit price: $${quote.unit_price.toFixed(2)} → $${award.unit_price.toFixed(2)}`,
    );
  }
  if (extDiffers && !qtyDiffers && !priceDiffers) {
    // Pure extended-only mismatch is unusual — flag it explicitly so the
    // user notices (e.g. one side rounded a discount differently).
    issues.push(
      `extended: $${quote.extended_price.toFixed(2)} → $${award.extended_price.toFixed(2)}`,
    );
  }

  let diff: LineDiff = "match";
  if (qtyDiffers && priceDiffers) diff = "qty_and_price";
  else if (qtyDiffers) diff = "qty_mismatch";
  else if (priceDiffers || extDiffers) diff = "price_mismatch";

  return { diff, issues };
}

export function compareBoms(quote: BomLine[], award: BomLine[]): CompareResult {
  // Index quote lines by part number for O(n+m) lookup.
  const quoteByPart = new Map<string, BomLine>();
  for (const line of quote) {
    const key = normalizeKey(line.part_number);
    if (!key) continue; // skip lines with no part number — can't safely match
    quoteByPart.set(key, line);
  }

  const matched: MatchedRow[] = [];
  const onlyInAward: BomLine[] = [];

  for (const awardLine of award) {
    const key = normalizeKey(awardLine.part_number);
    if (!key) {
      onlyInAward.push(awardLine);
      continue;
    }
    const quoteLine = quoteByPart.get(key);
    if (!quoteLine) {
      onlyInAward.push(awardLine);
      continue;
    }
    const { diff, issues } = classify(quoteLine, awardLine);
    matched.push({ part_number: awardLine.part_number, quote: quoteLine, award: awardLine, diff, issues });
    quoteByPart.delete(key);
  }

  const onlyInQuote = [...quoteByPart.values()];

  const counts = {
    match: matched.filter((m) => m.diff === "match").length,
    price_mismatch: matched.filter((m) => m.diff === "price_mismatch").length,
    qty_mismatch: matched.filter((m) => m.diff === "qty_mismatch").length,
    qty_and_price: matched.filter((m) => m.diff === "qty_and_price").length,
    only_in_quote: onlyInQuote.length,
    only_in_award: onlyInAward.length,
  };

  const quoteExtended = r2(quote.reduce((s, l) => s + (l.extended_price || 0), 0));
  const awardExtended = r2(award.reduce((s, l) => s + (l.extended_price || 0), 0));

  return {
    matched,
    only_in_quote: onlyInQuote,
    only_in_award: onlyInAward,
    totals: {
      quote_extended: quoteExtended,
      award_extended: awardExtended,
      delta: r2(awardExtended - quoteExtended),
    },
    counts,
  };
}
