// Generic block-level utilities for working with Textract output.
// No document-format knowledge — these are primitives that any extractor
// (BOM, invoice, contract clause, etc.) builds on top of.

import type { Block } from "@aws-sdk/client-textract";

export interface BlockIndex {
  byId: Map<string, Block>;
  pageCount: number;
}

export function indexBlocks(blocks: Block[]): BlockIndex {
  const byId = new Map<string, Block>();
  let pageCount = 0;
  for (const b of blocks) {
    if (b.Id) byId.set(b.Id, b);
    if (b.BlockType === "PAGE") pageCount++;
  }
  return { byId, pageCount };
}

/**
 * Get the text of a CELL/LINE block by walking its child WORD blocks.
 * Returns an empty string if the block has no children — never throws.
 */
export function getBlockText(block: Block, byId: Map<string, Block>): string {
  const parts: string[] = [];
  const childIds = block.Relationships?.find((r) => r.Type === "CHILD")?.Ids ?? [];
  for (const id of childIds) {
    const child = byId.get(id);
    if (!child) continue;
    if (child.BlockType === "WORD" && child.Text) {
      parts.push(child.Text);
    }
    // SELECTION_ELEMENT (checkboxes) are intentionally ignored — they
    // belong to FORM extraction, not table cell text.
  }
  return parts.join(" ").trim();
}

/**
 * Reconstruct page-level text from LINE blocks. Useful for feeding to an
 * LLM for context-aware metadata extraction (dates, addresses, names).
 *
 * Pass a `maxPages` cap because most metadata sits on the first 1-3 pages
 * and sending the whole doc inflates LLM token cost without improving
 * accuracy.
 */
export function getPageText(blocks: Block[], maxPages: number): string {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.BlockType !== "LINE") continue;
    if (b.Page != null && b.Page <= maxPages && b.Text) {
      lines.push(b.Text);
    }
  }
  return lines.join("\n");
}

export function parseNumber(s: string | undefined | null): number | null {
  if (s == null) return null;
  const cleaned = String(s).replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
