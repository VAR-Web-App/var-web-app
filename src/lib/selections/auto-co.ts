// Auto-create a change order when a selection pick exceeds the allowance.

import type { ProjectSelection, ProjectChangeOrder } from "@/types/builder";
import { saveSelection, saveChangeOrder } from "@/lib/store";

/** Next sequential CO number from existing COs. */
function nextCoNumber(existing: ProjectChangeOrder[]): string {
  if (existing.length === 0) return "CO-001";
  const nums = existing.map((c) => parseInt(c.number.replace(/\D/g, ""), 10) || 0);
  return `CO-${String(Math.max(...nums) + 1).padStart(3, "0")}`;
}

/**
 * Approve a client's selection pick. If the picked option exceeds the
 * allowance, auto-spawn a linked change order for the delta.
 *
 * Returns the updated selection and (optionally) the new CO.
 */
export async function approveSelectionPick(
  selection: ProjectSelection,
  optionId: string,
  signature: string,
  existingCOs: ProjectChangeOrder[],
): Promise<{ selection: ProjectSelection; changeOrder?: ProjectChangeOrder }> {
  const option = selection.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`Option ${optionId} not found on selection ${selection.id}`);

  const now = new Date().toISOString();
  const delta = option.cost - selection.allowance;

  // Update the selection record
  const updated: ProjectSelection = {
    ...selection,
    selected_option_id: optionId,
    approval_signature: signature,
    approved_at: now,
    updated_at: now,
    status: delta > 0 ? "over_allowance" : "approved",
  };

  let changeOrder: ProjectChangeOrder | undefined;

  if (delta > 0) {
    // Auto-spawn a linked CO for the overage
    const coId = crypto.randomUUID();
    changeOrder = {
      id: coId,
      deal_ref: selection.deal_ref,
      org_ref: selection.org_ref,
      number: nextCoNumber(existingCOs),
      title: `Over-allowance: ${selection.title}`,
      description: `Client selected "${option.label}" for ${selection.title}. Over allowance by $${delta.toLocaleString("en-US", { minimumFractionDigits: 2 })}.`,
      amount_delta: delta,
      schedule_impact_days: 0,
      reason: "client_request",
      status: "approved",
      approval_signature: signature,
      approved_at: now,
      notes: `Auto-created from selection ${selection.number}.`,
      created_at: now,
      updated_at: now,
    };

    updated.linked_change_order_id = coId;

    await saveChangeOrder(changeOrder);
  }

  await saveSelection(updated);

  return { selection: updated, changeOrder };
}
