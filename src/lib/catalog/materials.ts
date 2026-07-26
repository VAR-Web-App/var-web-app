// Materials Sourcing Catalog — a flat, searchable SKU list derived from the
// priced line items already inside the assembly catalog. Ships with the app's
// catalog pricing today; a live supplier feed (1build / HD Pro / Lowe's Pro)
// becomes a drop-in replacement for `unitCostUsd` behind the same shape.
//
// Pure — no I/O — so it's trivially testable and importable anywhere.

import { STUB_ASSEMBLIES } from "@/lib/assemblies/stub-catalog";

export interface MaterialItem {
  id: string;
  name: string;
  /** Unit of measure (EA, LF, SHEET, …). */
  uom: string;
  /** Catalog unit cost in USD. */
  unitCostUsd: number;
  /** Broad trade, for filtering. */
  trade: string;
  /** GFE section id this material rolls up to (drives the actuals loop). */
  catId?: string;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

function buildCatalog(): MaterialItem[] {
  const byName = new Map<string, MaterialItem>();
  for (const a of STUB_ASSEMBLIES) {
    for (const m of a.materials) {
      // Skip formula-priced materials (no fixed unit cost to show/add).
      if (!m.unitCostUsd || m.unitCostUsd <= 0) continue;
      const key = m.name.trim().toLowerCase();
      if (byName.has(key)) continue; // first occurrence wins — they're identical SKUs
      byName.set(key, {
        id: slug(m.name),
        name: m.name.trim(),
        uom: m.uom,
        unitCostUsd: m.unitCostUsd,
        trade: a.trade,
        catId: m.catId ?? a.catId,
      });
    }
  }
  return [...byName.values()].sort((x, y) => x.name.localeCompare(y.name));
}

/** The full flattened catalog, built once at module load. */
export const MATERIALS_CATALOG: MaterialItem[] = buildCatalog();

/** Distinct trades present in the catalog (for a filter dropdown). */
export const MATERIAL_TRADES: string[] = [
  ...new Set(MATERIALS_CATALOG.map((m) => m.trade)),
].sort();

/** Search by name/trade, optionally filtered to one trade. */
export function searchMaterials(
  query: string,
  opts: { trade?: string; limit?: number } = {},
): MaterialItem[] {
  const t = query.trim().toLowerCase();
  const limit = opts.limit ?? 100;
  let list = MATERIALS_CATALOG;
  if (opts.trade) list = list.filter((m) => m.trade === opts.trade);
  if (t) {
    list = list.filter(
      (m) =>
        m.name.toLowerCase().includes(t) || m.trade.toLowerCase().includes(t),
    );
  }
  return list.slice(0, limit);
}
