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
  { key: "vendor_sourcing", label: "Estimating", color: "bg-sky-100 text-sky-800" },
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

// ── Builder phase milestones (for draw schedule + Gantt) ─────────
// Default % splits roughly mirror AIA G702-style residential draws.
// Default durations are mid-range residential custom-home rules of thumb
// (USA 2026, mid-grade finishes). Customizable per project; these are
// the template starting point.

export interface PhaseMilestoneTemplate {
  key: string;
  label: string;
  default_percent: number;
  default_duration_days: number;
  description: string;
}

export const DEFAULT_BUILDER_MILESTONES: PhaseMilestoneTemplate[] = [
  { key: "deposit", label: "Deposit / Mobilization", default_percent: 5, default_duration_days: 7, description: "Contract signing + permits + site prep" },
  { key: "foundation", label: "Foundation Complete", default_percent: 10, default_duration_days: 21, description: "Excavation, footings, foundation walls poured" },
  { key: "framing", label: "Framing Complete", default_percent: 20, default_duration_days: 42, description: "Frame up, sheathing, roof structure" },
  { key: "dried_in", label: "Dried-In", default_percent: 10, default_duration_days: 14, description: "Roof, windows, exterior doors installed" },
  { key: "mep_rough", label: "MEP Rough-In", default_percent: 15, default_duration_days: 21, description: "Plumbing, electrical, HVAC rough complete + inspected" },
  { key: "drywall", label: "Drywall & Insulation", default_percent: 10, default_duration_days: 21, description: "Insulation, drywall hung + finished" },
  { key: "finishes", label: "Finishes", default_percent: 20, default_duration_days: 56, description: "Trim, paint, flooring, cabinets, fixtures" },
  { key: "punch", label: "Punch List", default_percent: 5, default_duration_days: 14, description: "Final inspections, punch list complete, CO issued" },
  { key: "warranty", label: "Warranty Period", default_percent: 5, default_duration_days: 30, description: "30-day post-occupancy walkthrough" },
];

// ── Project execution: milestones + photos ───────────────────────
// Translated from ProjectPulse's MilestoneRecord schema. Status flow
// matches PP exactly so the same draw-release semantics apply:
//   pending → in_progress → awaiting_approval → approved → released
// Disputed branches off awaiting_approval if the client rejects the
// completion claim. The amount/percentage drive draw schedule billing.

export type MilestoneStatus =
  | "pending"
  | "in_progress"
  | "awaiting_approval"
  | "approved"
  | "released"
  | "disputed";

export interface ProjectMilestone {
  id: string;
  deal_ref: string;
  org_ref: string;
  name: string;
  description: string;
  /** Order in the schedule (smaller = earlier). */
  order: number;
  /** Percent of contract value this draw represents (0–100). */
  percentage: number;
  /** Dollar amount derived from percentage × contract value at creation. */
  amount: number;
  status: MilestoneStatus;
  /** Planned start date (ISO date string YYYY-MM-DD). Drives the Gantt. */
  planned_start_date?: string;
  /** Planned end date (ISO date string YYYY-MM-DD). Drives the Gantt. */
  planned_end_date?: string;
  /** Distributor IDs (subs) working this phase. Drives the cross-project
   *  /schedule view and surfaces on milestone rows + draw requests. */
  assigned_subs?: string[];
  /** QuickBooks Online invoice ID after manual or auto sync. Demo mode
   *  populates this with a mock value; production fills it from the
   *  QBO API response. */
  qb_invoice_id?: string;
  /** Human-readable QB invoice number ("INV-1042"). Surfaces in UI. */
  qb_invoice_number?: string;
  /** ISO timestamp of the last successful QB sync. */
  qb_synced_at?: string;
  /** Dedup keys for the T-7 / T-2 / T-1 reminder cron. Each stores the
   *  planned_start_date the corresponding reminder was last sent for
   *  — when the start date changes, the value goes stale and the
   *  reminder fires again for the new date. */
  t7_reminded_for_start?: string;
  t2_reminded_for_start?: string;
  t1_reminded_for_start?: string;
  /** When work on this phase began (in_progress flip). */
  started_at?: string;
  /** When the GC marked the phase complete (awaiting client approval). */
  marked_complete_at?: string;
  /** When the client approved the completion (releases payment). */
  approved_at?: string;
  /** Typed-name e-signature captured on portal approval. E-SIGN/UETA
   *  compliance: name + intent (the checkbox in the modal) + record
   *  retention is sufficient for legally binding electronic signature
   *  on draw approvals. */
  approval_signature?: string;
  /** When the payment cleared. */
  released_at?: string;
  released_amount?: number;
  dispute_reason?: string;
  notes: string;
  /** ISO string. */
  created_at: string;
  updated_at: string;
}

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  awaiting_approval: "Awaiting Approval",
  approved: "Approved",
  released: "Paid",
  disputed: "Disputed",
};

export const MILESTONE_STATUS_STYLES: Record<MilestoneStatus, string> = {
  pending: "bg-slate-100 text-slate-700 ring-slate-200",
  in_progress: "bg-sky-100 text-sky-800 ring-sky-200",
  awaiting_approval: "bg-amber-100 text-amber-800 ring-amber-200",
  approved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  released: "bg-emerald-600 text-white ring-emerald-700",
  disputed: "bg-red-100 text-red-800 ring-red-200",
};

// ── Sub schedule link (public, no-login) ─────────────────────────
// A no-login page a sub opens from their schedule text — lives at the
// top-level sub_schedule_links/{token} doc, public-read, gated only by
// the unguessable token (same pattern as ClientSignLink). The builder
// writes a fresh snapshot of the sub's assignments whenever they're
// assigned or rescheduled; the page renders purely from this snapshot.

export interface SubScheduleAssignment {
  /** Stable ref back to the source ProjectMilestone — required so sub
   *  actions (acknowledge, flag conflict) can target the right doc. */
  milestone_ref?: string;
  project_name: string;
  project_address?: string;
  phase_name: string;
  status: MilestoneStatus;
  start_date?: string;
  end_date?: string;
  /** Echoed from the latest SubAcknowledgment so the portal can render
   *  "you confirmed this" without a second query. Server (admin SDK)
   *  writes this back on /api/sub/acknowledge. */
  acknowledgment?: {
    status: "confirmed" | "conflict";
    reason?: string;
    /** ISO timestamp of when the sub clicked the button. */
    created_at: string;
  };
}

// ── Sub acknowledgments ──────────────────────────────────────────
// One per sub-per-milestone-per-action. Written only by the server
// (admin SDK) after the public /api/sub/acknowledge endpoint verifies
// the token. Multiple records per (sub, milestone) are fine — they
// form an audit trail (e.g. confirmed → later flagged conflict). The
// GC reads these to surface ack state on each milestone row.

export interface SubAcknowledgment {
  id: string;
  org_ref: string;
  deal_ref: string;
  milestone_ref: string;
  sub_ref: string;
  /** The token the sub used; recorded for audit, not used as auth. */
  token: string;
  status: "confirmed" | "conflict";
  reason?: string;
  /** Snapshot of the milestone's planned_start_date at ack time, so a
   *  later date change shows up clearly ("ack'd for a different date"). */
  for_start_date?: string;
  created_at: string;
}

export interface SubScheduleLink {
  /** Random unguessable token; also the doc ID. */
  token: string;
  sub_ref: string;
  org_ref: string;
  sub_name: string;
  builder_name: string;
  assignments: SubScheduleAssignment[];
  /** ISO timestamp of the last snapshot refresh. */
  updated_at: string;
}

export interface ProjectPhoto {
  id: string;
  deal_ref: string;
  org_ref: string;
  /** Permanent Storage download URL when uploaded via Firebase Storage,
   *  or an in-browser object URL on legacy/demo records. */
  url: string;
  /** Phase the photo documents (e.g. "Foundation", "Framing"). */
  phase: string;
  caption: string;
  /** Upload size in bytes (for display only). */
  size: number;
  uploaded_at: string;
  /** Storage object path; when set, deletePhoto also removes the file. */
  storage_path?: string;
}

/** The phases used to organize photos + schedule blocks. Mirrors the
 *  default milestone phases above so the timeline / gallery / draw
 *  schedule all share the same vocabulary. */
export const PROJECT_PHASES = [
  "Site Work",
  "Foundation",
  "Framing",
  "Dried-In",
  "MEP Rough-In",
  "Drywall & Insulation",
  "Finishes",
  "Punch List",
  "Warranty",
] as const;

export type ProjectPhase = (typeof PROJECT_PHASES)[number];

// ── Sub RFQs (request for quote) ─────────────────────────────────
// One RFQ = one scope of work sent to N subs. Each invitee tracks
// independently (sent → opened → responded → selected/passed). For
// the demo we mock the email send; in production this is a Resend
// or SendGrid call with reply-tracking.

export type RFQStatus = "draft" | "sent" | "comparing" | "awarded" | "closed";

export type RFQInviteeStatus = "sent" | "responded" | "selected" | "passed";

export interface RFQInvitee {
  /** Sub/Supplier ID (from the distributors collection — repurposed). */
  sub_ref: string;
  sub_name: string;
  email?: string;
  status: RFQInviteeStatus;
  bid_amount?: number;
  bid_notes?: string;
  responded_at?: string;
  /** ISO timestamp of the SMS invite (or email mock). Used to show
   *  "sent X days ago" and to gate re-send. */
  notified_at?: string;
}

// ── Change Orders ────────────────────────────────────────────────
// During construction, scope changes happen ("homeowner wants to add a
// window in the master bath"). Each change order documents the scope,
// the cost delta (positive = add, negative = credit), schedule impact,
// and gets signed by the homeowner. Approved COs adjust the contract
// value and surface on the proposal + draw request documents.

export type ChangeOrderStatus = "draft" | "sent" | "approved" | "rejected";

export type ChangeOrderReason =
  | "client_request"
  | "design_revision"
  | "site_conditions"
  | "weather"
  | "material_change"
  | "other";

export const CHANGE_ORDER_REASON_LABELS: Record<ChangeOrderReason, string> = {
  client_request: "Client request",
  design_revision: "Design revision",
  site_conditions: "Unforeseen site conditions",
  weather: "Weather-related",
  material_change: "Material substitution",
  other: "Other",
};

export const CHANGE_ORDER_STATUS_LABELS: Record<ChangeOrderStatus, string> = {
  draft: "Draft",
  sent: "Pending Client Approval",
  approved: "Approved",
  rejected: "Rejected",
};

export const CHANGE_ORDER_STATUS_STYLES: Record<ChangeOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  // 'sent' = pending client approval — amber matches the milestone
  // 'awaiting approval' state so the user learns one color = one
  // action ("you need to do something").
  sent: "bg-amber-100 text-amber-800 ring-amber-200",
  approved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  rejected: "bg-red-100 text-red-800 ring-red-200",
};

export interface ProjectChangeOrder {
  id: string;
  deal_ref: string;
  org_ref: string;
  /** Sequential CO number ("CO-001", "CO-002"). Set on creation. */
  number: string;
  /** Brief title shown in lists. */
  title: string;
  /** Full scope description sent to the client. */
  description: string;
  /** Cost change in dollars. Positive = added cost, negative = credit. */
  amount_delta: number;
  /** Days added (or removed if negative) to the project schedule. */
  schedule_impact_days: number;
  reason: ChangeOrderReason;
  status: ChangeOrderStatus;
  approved_at?: string;
  /** Typed-name e-signature captured on portal approval. */
  approval_signature?: string;
  rejection_reason?: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRFQ {
  id: string;
  deal_ref: string;
  org_ref: string;
  /** Short title for the RFQ list ("Plumbing rough-in", "Roofing"). */
  scope_title: string;
  /** Full scope description sent to subs. */
  scope_description: string;
  /** Phase this RFQ is for (used for grouping). */
  phase: ProjectPhase;
  status: RFQStatus;
  invitees: RFQInvitee[];
  /** Internal notes (not sent to subs). */
  notes: string;
  sent_at?: string;
  awarded_to_sub_ref?: string;
  /** Set when the GC pushes the winning bid into the estimate as a line
   *  item. Hides the 'Add to estimate' button on the RFQ row and shows
   *  a 'Pushed' indicator instead so they don't accidentally duplicate. */
  pushed_to_estimate_at?: string;
  created_at: string;
  updated_at: string;
}

export const RFQ_STATUS_LABELS: Record<RFQStatus, string> = {
  draft: "Draft",
  sent: "Out for bid",
  comparing: "Comparing bids",
  awarded: "Awarded",
  closed: "Closed",
};

export const RFQ_STATUS_STYLES: Record<RFQStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  // 'sent' = out for bid; waiting on subs to respond. Amber = waiting.
  sent: "bg-amber-100 text-amber-800 ring-amber-200",
  // 'comparing' = bids in, GC reviewing. Sky brand = active GC work.
  comparing: "bg-sky-100 text-sky-800 ring-sky-200",
  awarded: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  closed: "bg-slate-100 text-slate-500 ring-slate-200",
};

// ── Selections ──────────────────────────────────────────────────
// A selection = a non-change-order choice/spec. Rolling (pre & during
// build). Curated options with cost deltas via allowance — over-allowance
// picks auto-spawn a linked change order.

export const SELECTION_CATEGORIES = [
  "countertops",
  "cabinets",
  "flooring",
  "paint",
  "brick",
  "fixtures",
  "fireplace",
  "appliances",
  "tile",
  "hardware",
  "lighting",
  "roofing",
  "windows",
  "doors",
  "other",
] as const;

export type SelectionCategory = (typeof SELECTION_CATEGORIES)[number];

export const SELECTION_CATEGORY_LABELS: Record<SelectionCategory, string> = {
  countertops: "Countertops",
  cabinets: "Cabinets",
  flooring: "Flooring",
  paint: "Paint",
  brick: "Brick / Stone",
  fixtures: "Fixtures",
  fireplace: "Fireplace",
  appliances: "Appliances",
  tile: "Tile",
  hardware: "Hardware",
  lighting: "Lighting",
  roofing: "Roofing",
  windows: "Windows",
  doors: "Doors",
  other: "Other",
};

export type SelectionStatus =
  | "draft"            // GC is building options
  | "sent"             // sent to client for picking
  | "client_picked"    // client chose, awaiting GC confirmation
  | "approved"         // locked in (within allowance)
  | "over_allowance";  // approved but spawned a linked CO

export const SELECTION_STATUS_LABELS: Record<SelectionStatus, string> = {
  draft: "Draft",
  sent: "Pending Client Pick",
  client_picked: "Client Picked",
  approved: "Approved",
  over_allowance: "Approved (Over Allowance)",
};

export const SELECTION_STATUS_STYLES: Record<SelectionStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  sent: "bg-amber-100 text-amber-800 ring-amber-200",
  client_picked: "bg-sky-100 text-sky-800 ring-sky-200",
  approved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  over_allowance: "bg-orange-100 text-orange-800 ring-orange-200",
};

export interface SelectionOption {
  id: string;
  label: string;
  description: string;
  image_url?: string;
  /** Absolute cost for this option. */
  cost: number;
  is_default?: boolean;
}

// ── Designer link (public, no-login selections editor) ───────────
// A no-login page a designer/interior-decorator opens from a link the
// builder shares. Lives at designer_links/{token}, public-read, gated
// only by the unguessable token (same pattern as SubScheduleLink). One
// link per project; grants the designer the ability to curate selection
// OPTIONS (label/description/image/cost) and add draft selections for
// that project. All reads/writes to the auth-gated project_selections
// collection are mediated server-side through /api/designer/* (admin
// SDK) after the token is verified. The designer never signs in and
// never touches status/approval fields — those stay in the GC + client
// flow. Reusable: the same designer can hold links for many projects.

export interface DesignerLink {
  /** Random unguessable token; also the doc ID. */
  token: string;
  org_ref: string;
  deal_ref: string;
  project_name: string;
  builder_name: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectSelection {
  id: string;
  deal_ref: string;
  org_ref: string;
  /** Sequential number "SEL-001". */
  number: string;
  category: SelectionCategory;
  title: string;
  description: string;
  /** Budget the GC allocated for this selection. */
  allowance: number;
  /** Curated options the client can pick from. */
  options: SelectionOption[];
  /** ID of the option the client picked. */
  selected_option_id?: string;
  status: SelectionStatus;
  /** Soft deadline for the client to decide (ISO date). */
  needed_by?: string;
  /** Auto-spawned CO ref when over-allowance pick is approved. */
  linked_change_order_id?: string;
  approval_signature?: string;
  approved_at?: string;
  notes: string;
  created_at: string;
  updated_at: string;
}
