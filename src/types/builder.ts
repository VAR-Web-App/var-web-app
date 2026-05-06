// Builder-app overlay on top of the VAR data model.
//
// Same underlying Deal/Account/Contact records — different stage
// labels, different terminology in the UI, plus builder-specific
// display fields (sqft, contract_value, project_address) that
// surface from the existing Deal record's existing fields.
//
// Runtime cost is zero: no schema migration, no parallel collections.
// Only the labels and route names differ between VAR and Builder
// presentations of the same data.

import type { Deal, DealStage } from "./index";

// ── Stage rebrand ────────────────────────────────────────────────
// Underlying keys are unchanged so the pipeline-move logic in
// deals/page.tsx, store.ts, and compare.ts continue to work.
// We only swap the user-visible labels.

export const BUILDER_STAGE_LABELS: Record<DealStage, string> = {
  rfq: "Lead",
  vendor_sourcing: "Estimating",
  quoted: "Estimate Sent",
  awarded: "Contract Signed",
  po_sent: "Pre-Construction",
  partially_shipped: "In Progress",
  closed_won: "Complete",
  closed_lost: "Lost",
};

export const BUILDER_STAGES: { key: DealStage; label: string; color: string }[] = [
  { key: "rfq", label: "Lead", color: "bg-blue-100 text-blue-800" },
  { key: "vendor_sourcing", label: "Estimating", color: "bg-amber-100 text-amber-800" },
  { key: "quoted", label: "Estimate Sent", color: "bg-yellow-100 text-yellow-800" },
  { key: "awarded", label: "Contract Signed", color: "bg-green-100 text-green-800" },
  { key: "po_sent", label: "Pre-Construction", color: "bg-teal-100 text-teal-800" },
  { key: "partially_shipped", label: "In Progress", color: "bg-orange-100 text-orange-800" },
  { key: "closed_won", label: "Complete", color: "bg-emerald-100 text-emerald-800" },
  { key: "closed_lost", label: "Lost", color: "bg-red-100 text-red-800" },
];

// ── Project view of a Deal ───────────────────────────────────────
// Maps Deal fields to builder-friendly names. Pure presentation —
// the underlying record is still a Deal in storage.

export interface ProjectView {
  id: string;
  name: string;                  // e.g. "Maddox — Country Dream House"
  stage: DealStage;
  stage_label: string;           // builder-rebrand of stage
  client_name: string;           // was: account_name
  client_poc?: string;           // was: poc_name
  project_address: string;       // was: ship_to_address
  job_number: string;            // was: solicitation_number
  customer_po?: string;          // was: customer_po (kept — used for change orders)
  contract_value: number;        // was: total_quote_value (or award_total when contract signed)
  awarded: boolean;              // was: awarded/po_sent/partially_shipped/closed_won
  notes: string;
  due_date?: string;             // expected substantial completion
  award_date?: string;           // contract sign date
  total_cost: number;            // was: total_cost (margin tracking same)
  margin_percent: number;
  org_ref: string;
  created_at: string;
  updated_at: string;
}

export function dealToProjectView(deal: Deal): ProjectView {
  const awarded = ["awarded", "po_sent", "partially_shipped", "closed_won"].includes(deal.stage);
  return {
    id: deal.id,
    name: deal.name,
    stage: deal.stage,
    stage_label: BUILDER_STAGE_LABELS[deal.stage],
    client_name: deal.account_name,
    client_poc: deal.poc_name,
    project_address: deal.ship_to_address,
    job_number: deal.solicitation_number,
    customer_po: deal.customer_po,
    contract_value: awarded ? (deal.award_total || deal.total_quote_value) : deal.total_quote_value,
    awarded,
    notes: deal.notes,
    due_date: deal.due_date,
    award_date: deal.award_date,
    total_cost: deal.total_cost,
    margin_percent: deal.margin_percent,
    org_ref: deal.org_ref,
    created_at: deal.created_at,
    updated_at: deal.updated_at,
  };
}

// ── Builder line-item categories ─────────────────────────────────
// Used in the estimate engine to group quote lines by builder phase.
// The underlying QuoteLine record is unchanged — these labels drive
// the UI grouping and sub-totaling on the project estimate page.

export const BUILDER_LINE_CATEGORIES = [
  "site_work",
  "foundation",
  "framing",
  "mep_rough",
  "drywall",
  "finishes",
  "exterior",
  "soft_costs",
  "subs",
  "other",
] as const;

export type BuilderLineCategory = (typeof BUILDER_LINE_CATEGORIES)[number];

export const BUILDER_LINE_CATEGORY_LABELS: Record<BuilderLineCategory, string> = {
  site_work: "Site Work",
  foundation: "Foundation",
  framing: "Framing",
  mep_rough: "MEP Rough-In",
  drywall: "Drywall & Insulation",
  finishes: "Finishes",
  exterior: "Exterior",
  soft_costs: "Soft Costs",
  subs: "Subcontractors",
  other: "Other",
};

// ── Builder phase milestones (for draw schedule) ─────────────────
// Default % splits roughly mirror AIA G702-style residential draws.
// Customizable per project; these are the template starting point.

export interface PhaseMilestoneTemplate {
  key: string;
  label: string;
  default_percent: number;
  description: string;
}

export const DEFAULT_BUILDER_MILESTONES: PhaseMilestoneTemplate[] = [
  { key: "deposit", label: "Deposit / Mobilization", default_percent: 5, description: "Contract signing + permits + site prep" },
  { key: "foundation", label: "Foundation Complete", default_percent: 10, description: "Excavation, footings, foundation walls poured" },
  { key: "framing", label: "Framing Complete", default_percent: 20, description: "Frame up, sheathing, roof structure" },
  { key: "dried_in", label: "Dried-In", default_percent: 10, description: "Roof, windows, exterior doors installed" },
  { key: "mep_rough", label: "MEP Rough-In", default_percent: 15, description: "Plumbing, electrical, HVAC rough complete + inspected" },
  { key: "drywall", label: "Drywall & Insulation", default_percent: 10, description: "Insulation, drywall hung + finished" },
  { key: "finishes", label: "Finishes", default_percent: 20, description: "Trim, paint, flooring, cabinets, fixtures" },
  { key: "punch", label: "Punch List", default_percent: 5, description: "Final inspections, punch list complete, CO issued" },
  { key: "warranty", label: "Warranty Period", default_percent: 5, description: "30-day post-occupancy walkthrough" },
];
