// Generic BOM (bill of materials) extractor. Walks a Textract-detected
// table and produces structured line items.
//
// Vocabulary-agnostic — works for federal award BOMs, distributor quotes,
// vendor POs, anything with a header row containing item/description/
// part/qty/extended-style columns. Per-customer vocabulary tuning happens
// in higher layers that wrap this.

import type { Block } from "@aws-sdk/client-textract";
import { findTableByHeader, extractTableRows, type TableMatch } from "./tables";
import { parseNumber } from "./blocks";
import {
  checkRowArithmetic,
  type ParseError,
  type ParseWarning,
} from "./validation";
import type { BomConfig, BomFieldName } from "./templates/types";

export interface BomLine {
  item_number: string;
  description: string;
  part_number: string;
  qty: number;
  unit_price: number;
  extended_price: number;
  /** Raw cells captured for any unrecognized columns — preserved so the
   *  user can see them in the review UI even if we don't know what they mean. */
  extra_fields: Record<string, string>;
}

interface CompiledRule {
  pattern: RegExp;
  field: BomFieldName;
}

function compileRules(config: BomConfig): CompiledRule[] {
  return config.columnRules.map((r) => ({
    pattern: new RegExp(r.pattern, "i"),
    field: r.field,
  }));
}

function classifyHeader(text: string, rules: CompiledRule[]): BomFieldName {
  const t = text.trim();
  for (const { pattern, field } of rules) {
    if (pattern.test(t)) return field;
  }
  return "ignore";
}

export interface ExtractBomResult {
  lines: BomLine[];
  errors: ParseError[];
  warnings: ParseWarning[];
  /** The table match used — null if no table matched. Useful for debugging. */
  matched: TableMatch | null;
}

export function extractBom(
  blocks: Block[],
  byId: Map<string, Block>,
  config: BomConfig,
): ExtractBomResult {
  const errors: ParseError[] = [];
  const warnings: ParseWarning[] = [];
  const rules = compileRules(config);

  const matched = findTableByHeader(
    blocks,
    byId,
    config.headerKeywords,
    config.minHeaderMatches,
  );

  if (!matched) {
    errors.push({
      message: `Could not find a BOM table. Expected a table with headers matching at least ${config.minHeaderMatches} of: ${config.headerKeywords.join(", ")}.`,
    });
    return { lines: [], errors, warnings, matched: null };
  }

  // Build column → field map from the header row
  const colToField = new Map<number, BomFieldName>();
  const colToHeader = new Map<number, string>();
  for (const h of matched.headerCells) {
    colToField.set(h.col, classifyHeader(h.text, rules));
    colToHeader.set(h.col, h.text);
  }

  const rows = extractTableRows(matched, byId);
  const lines: BomLine[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Skip rows that are mostly empty (likely separators) or look like totals
    const allText = [...row.values()].join("").toLowerCase();
    if (/^total|subtotal|grand ?total/i.test(allText.trim())) continue;
    const populated = [...row.values()].filter((v) => v.trim()).length;
    if (populated < 3) continue;

    const get = (field: BomFieldName): string => {
      for (const [col, f] of colToField) {
        if (f === field) return row.get(col) ?? "";
      }
      return "";
    };

    const itemNumber = get("item_number");
    // Skip rows where item number is missing or non-numeric — those tend to
    // be section headers or totals that survived the populated-cell check.
    if (!itemNumber || !/^\d+$/.test(itemNumber.trim())) continue;

    const description = get("description");
    const partNumber = get("part_number");
    const qty = parseNumber(get("qty")) ?? 0;
    const unitPrice = parseNumber(get("unit_price")) ?? 0;
    const extendedPrice = parseNumber(get("extended_price")) ?? 0;

    if (!partNumber && qty > 0) {
      errors.push({
        message: `Item ${itemNumber} has qty ${qty} but no Part Number`,
        row_index: lines.length,
      });
      continue;
    }

    const arithmetic = checkRowArithmetic({
      qty,
      unit_price: unitPrice,
      extended_price: extendedPrice,
      row_index: lines.length,
      row_label: `Item ${itemNumber}`,
      tolerance: config.arithmeticToleranceCents,
    });
    if (arithmetic) warnings.push(arithmetic);

    // Capture any unrecognized columns so the review UI can show them
    const extra: Record<string, string> = {};
    for (const [col, f] of colToField) {
      if (f === "ignore") {
        const header = colToHeader.get(col) ?? `col_${col}`;
        const value = row.get(col) ?? "";
        if (value.trim()) extra[header] = value;
      }
    }

    lines.push({
      item_number: itemNumber,
      description,
      part_number: partNumber,
      qty,
      unit_price: unitPrice,
      extended_price: extendedPrice,
      extra_fields: extra,
    });
  }

  return { lines, errors, warnings, matched };
}
