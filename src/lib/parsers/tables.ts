// Generic Textract table utilities. Find tables, identify their header row
// by keyword match, and extract per-row cell maps. Field-naming and
// row-validation are caller responsibilities — this layer doesn't know
// what a "BOM" or "invoice" is.

import type { Block } from "@aws-sdk/client-textract";
import { getBlockText } from "./blocks";

export interface TableMatch {
  table: Block;
  /** Row index of the header row (1-based, matches Textract's RowIndex). */
  headerRowIndex: number;
  /** Header cells sorted left-to-right by ColumnIndex. */
  headerCells: { col: number; text: string }[];
}

/**
 * Walk all TABLE blocks and find one whose header row contains at least
 * `minHeaderMatches` of the supplied keywords. Returns null if no table
 * matches — caller decides whether that's an error or a soft case.
 *
 * Keywords are matched case-insensitively against the *concatenated* text
 * of the header row, so "List Price" matches keyword "list" or "price".
 */
export function findTableByHeader(
  blocks: Block[],
  byId: Map<string, Block>,
  keywords: string[],
  minHeaderMatches = 4,
): TableMatch | null {
  for (const block of blocks) {
    if (block.BlockType !== "TABLE") continue;

    const cellIds = block.Relationships?.find((r) => r.Type === "CHILD")?.Ids ?? [];
    const cells: Block[] = [];
    for (const id of cellIds) {
      const c = byId.get(id);
      if (c?.BlockType === "CELL") cells.push(c);
    }
    if (cells.length === 0) continue;

    // Group cells by row
    const rowGroups = new Map<number, Block[]>();
    for (const c of cells) {
      const row = c.RowIndex ?? 0;
      if (!rowGroups.has(row)) rowGroups.set(row, []);
      rowGroups.get(row)!.push(c);
    }

    for (const [rowIdx, rowCells] of rowGroups) {
      const allText = rowCells
        .map((c) => getBlockText(c, byId).toLowerCase())
        .join(" ");
      const matched = keywords.filter((k) => allText.includes(k.toLowerCase()));
      if (matched.length >= minHeaderMatches) {
        const headerCells = rowCells
          .map((c) => ({ col: c.ColumnIndex ?? 0, text: getBlockText(c, byId) }))
          .sort((a, b) => a.col - b.col);
        return { table: block, headerRowIndex: rowIdx, headerCells };
      }
    }
  }
  return null;
}

/**
 * Walk a table's data rows (skipping header and rows above it) and return
 * one Map<columnIndex, cellText> per row. Caller maps column → field via
 * their own `classifyHeader` function.
 */
export function extractTableRows(
  match: TableMatch,
  byId: Map<string, Block>,
): Map<number, string>[] {
  const cellIds = match.table.Relationships?.find((r) => r.Type === "CHILD")?.Ids ?? [];
  const cells: Block[] = [];
  for (const id of cellIds) {
    const c = byId.get(id);
    if (c?.BlockType === "CELL") cells.push(c);
  }

  const rowGroups = new Map<number, Map<number, string>>();
  for (const c of cells) {
    if (c.RowIndex == null || c.ColumnIndex == null) continue;
    if (c.RowIndex <= match.headerRowIndex) continue;
    if (!rowGroups.has(c.RowIndex)) rowGroups.set(c.RowIndex, new Map());
    rowGroups.get(c.RowIndex)!.set(c.ColumnIndex, getBlockText(c, byId));
  }

  return [...rowGroups.keys()]
    .sort((a, b) => a - b)
    .map((rowIdx) => rowGroups.get(rowIdx)!);
}
