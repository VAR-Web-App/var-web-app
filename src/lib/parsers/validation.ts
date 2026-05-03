// Generic validation helpers. Used by extractors to flag arithmetic
// inconsistencies (qty × unit ≠ extended) and total mismatches between
// the line items and a document-level total.
//
// Error vs warning split is intentional and load-bearing: errors block
// the import (something's wrong, user must fix); warnings flag a
// discrepancy but let the import proceed (e.g. rounding within a cent).

export interface ParseError {
  message: string;
  field?: string;
  row_index?: number;
}

export interface ParseWarning {
  message: string;
  field?: string;
  row_index?: number;
}

/**
 * Two cents of slack on Textract-read PDFs — scanned docs sometimes round
 * at the OCR layer. Tighter tolerance is fine for XLSX where numbers come
 * through cleanly; pass a smaller value if so.
 */
export const DEFAULT_TOLERANCE_CENTS = 0.02;

export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Verify qty × unit ≈ extended for a single row. Returns a warning if the
 * arithmetic is off by more than tolerance, otherwise null. Returns null
 * when qty or unit price is 0/missing — those rows can't be validated and
 * shouldn't generate noise.
 */
export function checkRowArithmetic(opts: {
  qty: number;
  unit_price: number;
  extended_price: number;
  row_index: number;
  row_label?: string;
  tolerance?: number;
}): ParseWarning | null {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE_CENTS;
  if (opts.qty <= 0 || opts.unit_price <= 0) return null;
  const expected = r2(opts.qty * opts.unit_price);
  if (Math.abs(expected - opts.extended_price) <= tolerance) return null;
  const label = opts.row_label ?? `Row ${opts.row_index + 1}`;
  return {
    message: `${label}: ${opts.qty} × ${opts.unit_price} = ${expected}, file says ${opts.extended_price}`,
    field: "extended_price",
    row_index: opts.row_index,
  };
}

/**
 * Verify the sum of line extendeds matches a document-level total. Returns
 * an error (not a warning) on mismatch — total mismatches mean either the
 * parser missed a row or the source doc has a real arithmetic problem,
 * both of which should block the import until a human looks.
 */
export function checkTotalCrossCheck(
  lineSum: number,
  documentTotal: number | undefined,
  tolerance = 0.01,
): ParseError | ParseWarning | null {
  if (documentTotal == null) {
    return {
      message: "Could not extract document total — skipping cross-check",
    };
  }
  const summed = r2(lineSum);
  if (Math.abs(summed - documentTotal) <= tolerance) return null;
  return {
    message: `Total mismatch: line items sum to ${summed}, document says ${documentTotal} (diff ${r2(summed - documentTotal)})`,
  };
}
