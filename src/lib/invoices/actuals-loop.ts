// Actuals → Estimating Loop
//
// When an invoice is paid, update the matching GFE template line item's
// unit cost with the actual cost. This closes the feedback loop:
//   invoice paid → actual cost recorded → future estimates use real data.
//
// The loop targets the org's estimate_template in OrgSettings. Each
// invoice line item's cat_id (GFE section ID) drives the match.

import type { Invoice, OrgSettings } from "@/types";
import type { EstimateTemplate } from "@/lib/estimate-template-default";

export interface ActualsUpdate {
  cat_id: string;
  item_name: string;
  old_unit_cost: number | null;
  new_unit_cost: number;
  invoice_vendor: string;
  invoice_number?: string;
}

/**
 * Given a paid invoice with cat_id-tagged line items, compute the
 * updates that should be applied to the org's GFE template.
 *
 * Returns the list of updates (for preview/confirmation UI) and
 * a new copy of the template with costs applied.
 */
export function computeActualsUpdates(
  invoice: Invoice,
  template: EstimateTemplate,
): { updates: ActualsUpdate[]; updatedTemplate: EstimateTemplate } {
  const updates: ActualsUpdate[] = [];

  // Deep-clone the template so we don't mutate the original
  const updatedTemplate: EstimateTemplate = JSON.parse(JSON.stringify(template));

  for (const lineItem of invoice.line_items) {
    if (!lineItem.cat_id) continue;
    if (!lineItem.unit_price && !lineItem.extended) continue;

    // Find the matching section in the template by cat_id
    for (const category of updatedTemplate.categories) {
      for (const section of category.sections) {
        // Match on section ID (e.g. "40" matches section "40")
        // or on item ID (e.g. "40.6" matches item "40.6")
        if (section.id === lineItem.cat_id) {
          // Update the section's first item (or the synthetic single item)
          if (section.items.length > 0) {
            const item = section.items[0];
            const newCost = lineItem.unit_price ?? lineItem.extended;
            updates.push({
              cat_id: lineItem.cat_id,
              item_name: item.name,
              old_unit_cost: item.unit_cost,
              new_unit_cost: newCost,
              invoice_vendor: invoice.vendor_name,
              invoice_number: invoice.invoice_number,
            });
            item.unit_cost = newCost;
          }
        } else {
          // Check individual items
          for (const item of section.items) {
            if (item.id === lineItem.cat_id) {
              const newCost = lineItem.unit_price ?? lineItem.extended;
              updates.push({
                cat_id: lineItem.cat_id,
                item_name: item.name,
                old_unit_cost: item.unit_cost,
                new_unit_cost: newCost,
                invoice_vendor: invoice.vendor_name,
                invoice_number: invoice.invoice_number,
              });
              item.unit_cost = newCost;
            }
          }
        }
      }
    }
  }

  return { updates, updatedTemplate };
}

/**
 * Update quote lines on a deal when an invoice's actuals are applied.
 * Sets price_source to "actuals" on matching lines.
 */
export function markQuoteLinesAsActuals(
  lines: Array<{ cat_id?: string; price_source?: string }>,
  catIds: string[],
): void {
  const catSet = new Set(catIds);
  for (const line of lines) {
    if (line.cat_id && catSet.has(line.cat_id)) {
      line.price_source = "actuals";
    }
  }
}
