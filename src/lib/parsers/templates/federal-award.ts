// Generic federal-award template. Handles the common Section-B style
// award PDF: cover sheet with metadata + a tabular BOM with item/part/
// qty/unit/extended columns. Agency-specific quirks (FDIC clauses,
// Frequentis parent-line POs, etc.) are NOT in this template — they
// belong in their own templates that override these defaults.

import type { ExtractorTemplate } from "./types";

export const FEDERAL_AWARD_TEMPLATE: ExtractorTemplate = {
  id: "federal-award-generic",
  name: "Federal Award (Generic Section-B)",
  description:
    "Generic federal contract award with a Section-B style BOM table (item, part #, qty, unit price, extended).",
  kind: "award",
  detection: {
    textKeywords: ["award", "contract"],
    priority: 0,
  },
  bom: {
    headerKeywords: ["item", "description", "part", "qty", "extended"],
    minHeaderMatches: 4,
    columnRules: [
      { pattern: "^item\\b|item ?#|line ?#|line ?item", field: "item_number" },
      { pattern: "^description\\b|^desc\\b", field: "description" },
      { pattern: "^part\\b|part ?#|product ?(code|id|number)|sku|pid", field: "part_number" },
      { pattern: "^qty\\b|quantity", field: "qty" },
      { pattern: "list ?price|msrp", field: "list_price" },
      { pattern: "discount", field: "discount" },
      { pattern: "unit ?price|net ?price|price ?ea|each", field: "unit_price" },
      { pattern: "extended ?(price|amount|total)|ext\\.?\\s*price|line ?total", field: "extended_price" },
    ],
    arithmeticToleranceCents: 0.02,
  },
  metadata: {
    maxPages: 6,
    fields: [
      { name: "document_number", prompt: "The contract number, PO number, or award identifier from the cover page" },
      { name: "document_date", prompt: "ISO date the award/contract was issued" },
      { name: "total_amount", prompt: "The total dollar amount of the award (number, not string)" },
      { name: "buyer_name", prompt: "The buying entity / federal agency name" },
      { name: "buyer_address", prompt: "Buyer billing address (string with newlines preserved)" },
      { name: "ship_to_address", prompt: "Delivery / ship-to address (string with newlines preserved)" },
      { name: "ship_to_contact", prompt: "Full name of the receiving point of contact" },
      { name: "ship_to_email", prompt: "Email of the receiving point of contact" },
      { name: "period_of_performance_start", prompt: "ISO date the performance period begins" },
      { name: "period_of_performance_end", prompt: "ISO date the performance period ends" },
      { name: "contracting_officer_name", prompt: "Full name of the contracting officer" },
      { name: "contracting_officer_email", prompt: "Email of the contracting officer" },
      { name: "agency", prompt: "The federal agency (e.g. \"Department of Sample Administration\")" },
    ],
  },
};
