// Domain types for the VAR Web App workflow.
//
// Modeled on Avanchor's data shape but stripped of single-customer
// specifics: no customer_kind routing (FDIC/Frequentis), no L/M discount
// codes, no Cisco-specific fields. Multi-manufacturer-friendly out of
// the box.

export type DealStage =
  | "rfq"
  | "vendor_sourcing"
  | "quoted"
  | "awarded"
  | "po_sent"
  | "partially_shipped"
  | "closed_won"
  | "closed_lost";

export const DEAL_STAGES: { key: DealStage; label: string; color: string }[] = [
  { key: "rfq", label: "RFQ", color: "bg-blue-100 text-blue-800" },
  { key: "vendor_sourcing", label: "Vendor Sourcing", color: "bg-purple-100 text-purple-800" },
  { key: "quoted", label: "Quoted", color: "bg-yellow-100 text-yellow-800" },
  { key: "awarded", label: "Awarded", color: "bg-green-100 text-green-800" },
  { key: "po_sent", label: "PO Sent", color: "bg-teal-100 text-teal-800" },
  { key: "partially_shipped", label: "Shipping", color: "bg-orange-100 text-orange-800" },
  { key: "closed_won", label: "Closed Won", color: "bg-emerald-100 text-emerald-800" },
  { key: "closed_lost", label: "Closed Lost", color: "bg-red-100 text-red-800" },
];

export type DealType = "budgetary" | "quotation";

export interface Deal {
  id: string;
  name: string;
  stage: DealStage;
  deal_type: DealType;
  manufacturer: string;
  account_ref?: string;
  account_name: string;
  poc_ref?: string;
  poc_name?: string;
  distributor_ref?: string;
  distributor_name?: string;
  solicitation_number: string;
  /** The customer-issued contract / PO number (e.g. "DSA-26-P-0042"). */
  customer_po: string;
  ship_to_address: string;
  ship_to_poc_name: string;
  ship_to_poc_email: string;
  lead_time: string;
  due_date?: string;        // ISO date strings — easier than Date for localStorage
  award_date?: string;
  award_total: number;
  total_quote_value: number;
  total_cost: number;
  margin_percent: number;
  notes: string;
  org_ref: string;          // multi-tenant placeholder
  created_at: string;
  updated_at: string;
  // Public client-sign token. Generated when the GC clicks 'Email to
  // client' on the proposal page (or 'Copy sign link'). Used as the
  // doc ID in client_sign_links collection so the client can open the
  // proposal at /sign/{token} without logging in.
  client_sign_token?: string;
  // ── Floor plan extraction ───────────────────────────────────────
  // Persists the latest AI extraction so navigating away from the
  // project page and back surfaces the extracted plan (instead of
  // showing an empty upload dropzone). Saved as a JSON blob on the
  // deal doc — typed loosely to avoid circular imports with the
  // FloorPlanExtraction interface in the extractor component.
  floor_plan_extraction?: Record<string, unknown>;
  floor_plan_extracted_at?: string;
  /** Indices into floor_plan_extraction.ambiguity_notes that the GC
   *  has marked as verified / resolved. Persists alongside the
   *  extraction so resolution survives navigation. Reset to []
   *  whenever a new extraction lands. */
  resolved_ambiguity_indices?: number[];
}

export interface QuoteLine {
  id: string;
  line_number: number;
  product_code: string;
  description: string;
  manufacturer: string;
  is_service: boolean;       // generic equivalent of Avanchor's HW/SW vs Support
  qty: number;
  list_price: number;
  discount_percent: number;
  customer_unit_price: number;
  customer_extended: number;
  markup_percent: number;
  cost_unit_price: number;
  cost_extended: number;
  margin_percent: number;
  subscription_term_months: number;
  start_date?: string;
  end_date?: string;
  notes: string;
  manual_override?: boolean;
}

export interface AwardBomLine {
  id: string;
  item_number: string;
  description: string;
  part_number: string;
  qty: number;
  unit_price: number;
  extended_price: number;
  matched_quote_line_id?: string;
  discrepancy_notes: string;
}

// ── Client sign link ─────────────────────────────────────────────
//
// Snapshot of a proposal that a homeowner client can open without
// logging in and sign with a typed name. Lives at the top-level
// client_sign_links/{token} doc. Public read + limited update via
// Firestore rules.
//
// Snapshot semantics: when the GC sends the proposal, the deal's
// estimate + business info are FROZEN into this doc. Later edits to
// the deal don't change what the client sees / signs. The signature,
// when captured, syncs back to the deal on the GC's next project page
// load (auto-advance stage Estimate Sent → Contract Signed).
export interface ClientSignLink {
  /** Random unguessable token; also the doc ID. */
  token: string;
  deal_ref: string;
  org_ref: string;
  /** Snapshot fields rendered on the public proposal. */
  deal_name: string;
  client_name: string;
  client_address?: string;
  business_name: string;
  business_owner_name?: string;
  business_phone?: string;
  business_email?: string;
  business_license?: string;
  contract_amount: number;
  scope_summary?: string;
  /** Estimate line items at send-time, grouped by phase on render. */
  lines: QuoteLine[];
  /** Set when the client signs in-browser. */
  signed_by_name?: string;
  signed_at?: string;
  /** Best-effort device fingerprint for audit. */
  signed_user_agent?: string;
  /** Flips true after the GC's project page picks up the signature and
   *  advances the deal stage. Prevents repeated auto-advances. */
  synced_to_deal?: boolean;
  created_at: string;
}

export interface Account {
  id: string;
  name: string;
  type: "federal" | "state" | "commercial";
  contract_vehicles: string[];
  ship_to_addresses: string[];
  payment_terms: string;
  notes: string;
  org_ref: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  linked_type: "account" | "distributor" | "manufacturer";
  linked_ref: string;
  linked_name: string;
  is_primary: boolean;
  org_ref: string;
}

export interface Distributor {
  id: string;
  name: string;
  account_number: string;
  address: string;
  /** Mobile number for SMS schedule notifications. Stored as entered;
   *  normalized to E.164 at send time. */
  phone?: string;
  /** The sub confirmed they agree to receive schedule text messages.
   *  Gates every SMS send — recorded consent for A2P 10DLC compliance. */
  sms_consent?: boolean;
  /** Stable token for this sub's no-login schedule page (/s/{token}).
   *  Generated on first schedule notification. */
  schedule_token?: string;
  order_poc_ref?: string;
  order_poc_name?: string;
  notes: string;
  org_ref: string;
}

export interface OrgSettings {
  org_ref: string;
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  cage_code: string;
  duns: string;
  sam_id: string;
  default_blanket_discount_percent: number;
  default_markup_percent: number;
  default_manufacturer: string;
  prepared_by_name: string;
  prepared_by_phone: string;
}

export interface Attachment {
  id: string;
  deal_ref: string;
  category:
    // Builder-flavored categories. Older VAR-era values
    // (distributor_quote / customer_quote / award_document / vendor_po /
    // shipping) remain valid for any legacy attachments still in the data
    // layer, but new uploads go into one of these buckets.
    | "plans"
    | "permits"
    | "contract"
    | "sub_bid"
    | "email"
    // Legacy VAR keys — kept in the union so existing data still parses.
    | "distributor_quote"
    | "customer_quote"
    | "award_document"
    | "vendor_po"
    | "shipping"
    | "other";
  name: string;
  /** Object URL or external link. Demo uses object URLs from in-browser uploads. */
  url: string;
  size: number;
  uploaded_at: string;
}

// Builder-side category list, in the order they render on the project page.
// Trimmed of the VAR labels (Distributor Quote / Award Document / Vendor PO
// / Shipping) — those keys still exist on the type for back-compat with
// legacy data, but are never shown in the upload UI.
export const ATTACHMENT_CATEGORIES: Array<{
  key: Attachment["category"];
  label: string;
}> = [
  { key: "plans", label: "Plans & Drawings" },
  { key: "permits", label: "Permits" },
  { key: "contract", label: "Contracts" },
  { key: "sub_bid", label: "Sub Bids" },
  { key: "email", label: "Emails" },
  { key: "other", label: "Other" },
];

// ── helpers ──────────────────────────────────────────────────────

export function calcCustomerPrice(listPrice: number, discountPercent: number): number {
  return listPrice * (1 - discountPercent / 100);
}

export function calcWithMarkup(price: number, markupPercent: number): number {
  return price * (1 + markupPercent / 100);
}

export function newId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
