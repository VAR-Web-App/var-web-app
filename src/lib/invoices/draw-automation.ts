// Draw Automation
//
// Aggregate invoices for a milestone period → generate a draw packet
// summary that the GC can send to the client (or bank).
//
// Flow: matched invoices → filter by milestone → aggregate → summary
// → (future: email/portal delivery + client signature)

import type { Invoice, Payment } from "@/types";
import type { ProjectMilestone } from "@/types/builder";

export interface DrawPacketLine {
  vendor_name: string;
  invoice_number?: string;
  invoice_date?: string;
  amount: number;
  invoice_id: string;
}

export interface DrawPacket {
  milestone_id: string;
  milestone_name: string;
  draw_amount: number;
  /** Sum of matched invoices for this milestone. */
  invoiced_total: number;
  /** Individual invoice lines in the packet. */
  lines: DrawPacketLine[];
  /** Total payments already recorded against this milestone. */
  paid_to_date: number;
  /** Remaining: draw_amount - paid_to_date. */
  remaining: number;
  generated_at: string;
}

/**
 * Generate a draw packet for a given milestone by aggregating all
 * invoices matched to that milestone.
 */
export function generateDrawPacket(
  milestone: ProjectMilestone,
  invoices: Invoice[],
  payments: Payment[],
): DrawPacket {
  const milestoneInvoices = invoices.filter(
    (inv) => inv.milestone_ref === milestone.id && inv.status !== "pending",
  );

  const lines: DrawPacketLine[] = milestoneInvoices.map((inv) => ({
    vendor_name: inv.vendor_name,
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    amount: inv.total,
    invoice_id: inv.id,
  }));

  const invoicedTotal = lines.reduce((s, l) => s + l.amount, 0);

  const milestonePayments = payments.filter(
    (p) => p.milestone_ref === milestone.id && p.direction === "out",
  );
  const paidToDate = milestonePayments.reduce((s, p) => s + p.amount, 0);

  return {
    milestone_id: milestone.id,
    milestone_name: milestone.name,
    draw_amount: milestone.amount,
    invoiced_total: invoicedTotal,
    lines,
    paid_to_date: paidToDate,
    remaining: milestone.amount - paidToDate,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Generate draw packets for ALL milestones that have matched invoices.
 * Useful for a project-level draw summary view.
 */
export function generateAllDrawPackets(
  milestones: ProjectMilestone[],
  invoices: Invoice[],
  payments: Payment[],
): DrawPacket[] {
  return milestones
    .filter((m) => invoices.some((inv) => inv.milestone_ref === m.id))
    .map((m) => generateDrawPacket(m, invoices, payments))
    .sort((a, b) => {
      const mA = milestones.find((m) => m.id === a.milestone_id);
      const mB = milestones.find((m) => m.id === b.milestone_id);
      return (mA?.order ?? 0) - (mB?.order ?? 0);
    });
}

/**
 * Format a draw packet as a plain-text summary suitable for email
 * or PDF generation.
 */
export function formatDrawPacketText(packet: DrawPacket): string {
  const fmtMoney = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const lines = [
    `DRAW REQUEST — ${packet.milestone_name}`,
    `Draw Amount: ${fmtMoney(packet.draw_amount)}`,
    ``,
    `INVOICES (${packet.lines.length}):`,
    ...packet.lines.map(
      (l) =>
        `  ${l.vendor_name}${l.invoice_number ? ` #${l.invoice_number}` : ""}${l.invoice_date ? ` (${l.invoice_date})` : ""} — ${fmtMoney(l.amount)}`,
    ),
    ``,
    `Invoiced Total: ${fmtMoney(packet.invoiced_total)}`,
    `Paid to Date: ${fmtMoney(packet.paid_to_date)}`,
    `Remaining: ${fmtMoney(packet.remaining)}`,
    ``,
    `Generated: ${new Date(packet.generated_at).toLocaleDateString()}`,
  ];

  return lines.join("\n");
}
