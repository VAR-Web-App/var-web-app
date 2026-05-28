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
  // ── Plan extraction ─────────────────────────────────────────────
  // Persists the latest AI extraction so navigating away from the
  // project page and back surfaces the extracted plan (instead of
  // showing an empty upload dropzone). Saved as a JSON blob on the
  // deal doc — typed loosely to avoid circular imports with the
  // PlanExtraction interface in the extractor component. Field names
  // stay floor_plan_* for backward-compat with existing Firestore
  // docs; the user-facing surface (component, route, labels) is now
  // "plan" since the extractor accepts floor plans, full build sets,
  // and marketed design plans.
  floor_plan_extraction?: Record<string, unknown>;
  floor_plan_extracted_at?: string;
  /** Indices into floor_plan_extraction.ambiguity_notes that the GC
   *  has marked as verified / resolved. Persists alongside the
   *  extraction so resolution survives navigation. Reset to []
   *  whenever a new extraction lands. */
  resolved_ambiguity_indices?: number[];
  /**
   * Demo-only weather override. When set, the WeatherBanner renders
   * this alert as-is and skips the live Open-Meteo fetch — gives the
   * demo a deterministic "rain / wind / freeze" callout instead of
   * depending on the actual forecast for the project address. Seed
   * data sets this on the anchor project; real projects leave it
   * undefined and use the live API.
   */
  demo_weather_alert?: {
    /** YYYY-MM-DD. Should fall inside a non-completed milestone's
     *  planned window so the banner finds phases to flag. */
    date: string;
    /** Free-text reason — e.g. "Rain likely (85%)", "High wind (32 mph)". */
    reason: string;
  };
  /** Editable parametric assemblies the builder has dropped onto the
   *  estimate. Each instance owns a contiguous block of QuoteLines
   *  (matched via QuoteLine.instance_id) that regenerate live as the
   *  builder tweaks properties during a client conversation. */
  assembly_instances?: import("./assembly").AssemblyInstance[];
  /** Soft-cost layer applied below the line-item subtotal. Builders
   *  add these as percentage (or flat) layers for taxes, contingency
   *  reserve, and general conditions / project overhead. All optional
   *  — zero/undefined means "don't apply this line." */
  soft_costs?: SoftCosts;
  /** Named whole-quote scenarios — "Standard Spec" / "Premium Spec" /
   *  "Budget Spec". Each is a frozen snapshot of the full estimate
   *  state (assembly_instances + quote_lines + soft_costs) that the
   *  builder can switch between at the kitchen table to show the
   *  client side-by-side variations. Edits while a scenario is
   *  active sync back into that scenario's record on save. */
  scenarios?: QuoteScenario[];
  /** ID of the currently active scenario, or undefined when the
   *  builder is editing the base draft (no scenario loaded). */
  active_scenario_id?: string;
}

export interface SoftCosts {
  /** Sales tax percentage applied to the materials subtotal. */
  tax_percent?: number;
  /** Tax applies to: "materials" (cost basis), "all" (full customer
   *  subtotal), or undefined / "materials" by default. */
  tax_basis?: "materials" | "all";
  /** Contingency reserve percentage applied to the cost subtotal —
   *  builder's buffer for change orders / market price swings. */
  contingency_percent?: number;
  /** General Conditions: project overhead (supervision, dumpsters,
   *  port-a-john, etc.). Either a percentage on cost, or a flat
   *  dollar amount — gc_mode picks which. */
  gc_mode?: "percent" | "flat";
  gc_percent?: number;
  gc_amount?: number;
}

/** A named, frozen snapshot of an estimate. Lives on Deal.scenarios.
 *  Switching scenarios loads this record's three fields back into the
 *  Deal's working state; editing while active syncs back here on save. */
export interface QuoteScenario {
  id: string;
  name: string;
  assembly_instances: import("./assembly").AssemblyInstance[];
  quote_lines: QuoteLine[];
  soft_costs?: SoftCosts;
  /** Cached totals so the chip strip shows $ without recomputing. */
  total_quote_value: number;
  total_cost: number;
  margin_percent: number;
  created_at: string;
  updated_at: string;
}

/** Where a line item's pricing came from. Drives the colored provenance
 *  pill rendered in the line items table so the builder can see at a
 *  glance which numbers are real-bid vs. catalog estimates vs. their
 *  own typed-in overrides.
 *
 *  - "bid":     Awarded RFQ — winning sub's bid amount pushed into the
 *               estimate. Most trustworthy: real, local, current.
 *  - "market":  Pulled from a market-data API (currently 1build when
 *               wired). Regional + recent but still an average.
 *  - "catalog": Default stub pricing from our assembly catalog. Useful
 *               for early ballparks; placeholder until "bid" or
 *               "market" fills in.
 *  - "manual":  Builder typed the number directly. Treat as
 *               intentional; never auto-overwrite.
 */
export type PriceSource = "bid" | "market" | "catalog" | "manual";

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
  /** Set when this line was generated from an Assembly instance.
   *  Edits to the instance's properties regenerate every line sharing
   *  this id. Plain ad-hoc lines leave this undefined. */
  instance_id?: string;
  /** Where this line's cost came from. Drives the provenance pill in
   *  the line items table. Optional for back-compat with pre-tagged
   *  records — UI treats absence as "catalog". */
  price_source?: PriceSource;
  /** Barry-template section ID this line rolls up to (e.g. "21" for
   *  FOOTINGS, "40.6" for Exterior Doors). Set when the line came from
   *  the AI plan converter so the estimate respects the builder's
   *  Good Faith Estimate taxonomy. Optional — manual lines and
   *  pre-Barry-taxonomy records leave it undefined. */
  cat_id?: string;
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
  /** Email address — universal fallback when SMS isn't possible
   *  (no consent / no phone / pre-A2P-approval window). Notifications
   *  are sent to both channels when both are available. */
  email?: string;
  /** The sub confirmed they agree to receive schedule text messages.
   *  Gates every SMS send — recorded consent for A2P 10DLC compliance. */
  sms_consent?: boolean;
  /** Stable token for this sub's no-login schedule page (/s/{token}).
   *  Generated on first schedule notification. */
  schedule_token?: string;
  /** Push notification subscriptions for this sub, registered when
   *  they install the PWA and grant notification permission. One
   *  subscription per device. Server-side sends use these in
   *  parallel with SMS / email. */
  push_subscriptions?: PushSubscriptionRecord[];
  order_poc_ref?: string;
  order_poc_name?: string;
  notes: string;
  org_ref: string;
}

/** Web Push subscription stored on a Distributor record (or OrgSettings
 *  for GC-side alerts). Shape matches what PushManager.subscribe()
 *  returns, plus bookkeeping fields. */
export interface PushSubscriptionRecord {
  /** Apple's APNs / Google's FCM endpoint the server POSTs to. */
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  /** ISO timestamp when the subscription was registered. */
  subscribed_at: string;
  /** Friendly device label — auto-derived from UA on subscribe
   *  ("iPhone — Safari"), editable by the GC inline in Settings. */
  device_label?: string;
  /** ISO timestamp of the most recent successful "test push" send.
   *  Lets the GC verify a device still receives pushes without waiting
   *  for a real event. Updated only by /api/push/test on success. */
  last_test_at?: string;
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
  /**
   * Per-org SMS configuration. Lets the platform run Twilio Option A
   * today (one shared platform number) while leaving a clean migration
   * path to Option C (a dedicated phone number per builder) — when an
   * org graduates to a dedicated number, populate `from_number` here
   * and the /api/sms route picks it up over the platform default.
   *
   * `subaccount_*` fields are reserved for the eventual Twilio
   * Subaccount split; they aren't read by the current route.
   */
  sms_config?: {
    /** "platform" = shared number (Option A). "dedicated" = this org has
     *  its own number provisioned (Option C / Phase 2). */
    mode?: "platform" | "dedicated";
    /** E.164 dedicated number for this org. Falls back to TWILIO_FROM_NUMBER. */
    from_number?: string;
    /** A2P 10DLC brand registration status, when this org has its own brand. */
    brand_status?: "pending" | "approved" | "rejected";
    /** Reserved for future Twilio Subaccount split (Phase 3). */
    subaccount_sid?: string;
  };
  /**
   * Web-push subscriptions registered by the GC for org-level alerts
   * (sub bid arrivals, conflict flags, etc.). One entry per device
   * the GC opted in on. Same shape as Distributor.push_subscriptions.
   */
  push_subscriptions?: PushSubscriptionRecord[];
  /**
   * Per-org cost-multiplier overrides on the assembly catalog. The
   * stub catalog ships with national-average pricing; builders tune
   * to their local market via these multipliers without editing
   * formulas. Applied in computeMaterials() — see assemblies/compute.ts.
   *
   * Global multipliers apply to every assembly. Per-assembly entries
   * stack on top (final = base × per_assembly × global).
   *
   * Defaults are 1.0 (no change) when fields are absent.
   */
  cost_overrides?: {
    /** Multiplier on every material unit cost across all assemblies. */
    global_material_multiplier?: number;
    /** Multiplier on every labor unit cost across all assemblies. */
    global_labor_multiplier?: number;
    /** Per-assembly fine-tuning, keyed by assembly id (e.g. "stub-carpet"). */
    per_assembly?: Record<
      string,
      {
        material_multiplier?: number;
        labor_multiplier?: number;
        /** Stock material names (Assembly.materials[].name) to suppress
         *  from compute output. Example: a builder who rolls underlayment
         *  cost into their carpet bid removes the "Carpet + pad + tack
         *  strip" line's pad portion via a per-line removal here. */
        removed_materials?: string[];
        /** Additional materials appended to the assembly's stock list,
         *  scaled either by a fixed base quantity or proportional to an
         *  existing property (e.g. vapor barrier = Floor Area × 1.10). */
        extra_materials?: ExtraMaterial[];
        /** Per-stock-line quantity multipliers, keyed by material name.
         *  1.05 = "add 5% extra material to this line's stock formula
         *  output" — for builders whose actual waste differs from the
         *  catalog's built-in factor (e.g. 12% framing waste instead of
         *  the stock 10%). Doesn't touch the formula itself; just scales
         *  the result. */
        line_overrides?: Record<string, { quantity_factor?: number }>;
      }
    >;
  };
  /**
   * Per-org overrides for the draw-request / invoice template. The
   * draw page ships with two layouts (AIA G702 and Simple Invoice) and
   * a default field set; this lets builders flip the default template,
   * brand it with their logo, add lender-specific fields (loan #,
   * borrower name), edit boilerplate, and opt out of sections they
   * don't need. Missing fields = use the template's built-in default.
   */
  invoice_template?: {
    /** Default template used when a draw page first opens. */
    default_template?: "aia" | "simple";
    /** Logo rendered top-left on the invoice header. Public URL or data URI. */
    logo_url?: string;
    /** Free-text lender block — e.g. "Loan #: 1234567 / Borrower: J. Doe".
     *  Shown in the header next to the date. Lenders frequently want
     *  their loan number on every draw. */
    loan_info?: string;
    /** Free-text payment terms shown at the bottom of the invoice body
     *  (Simple template) or above signatures (AIA template). */
    payment_terms?: string;
    /** Custom contractor's-certification text override. Falls back to
     *  the built-in AIA G702 boilerplate when blank. */
    certification_text?: string;
    /** Section toggles — default ON when absent. Lets a builder hide
     *  pieces their lender doesn't care about. */
    show_change_orders?: boolean;
    show_schedule_of_values?: boolean;
    show_owner_signature?: boolean;
    show_subs_on_phase?: boolean;
    /**
     * Retainage withheld per draw, as a percent (e.g. 10 = 10%). 0 or
     * absent = retainage disabled (current behavior). When set, the AIA
     * template renders the proper 9-line G702 numbering including 5a
     * (Retainage on Completed Work), 5b (Retainage on Stored Materials),
     * and a Total Retainage line, plus a retainage column on the
     * Schedule of Values. The "Current Payment Due" is reduced by this
     * draw's retainage portion. Residential construction lenders
     * typically hold 5-10%, sometimes reducing at 50% complete.
     */
    retainage_percent?: number;
    /**
     * Render the notary "subscribed and sworn" block under the
     * contractor's signature. Some banks (and most title companies)
     * treat the pay application as a sworn statement and require this.
     * Off by default — the contractor still has to actually get it
     * notarized for the seal to mean anything, so we don't add the
     * block unless the builder explicitly enables it.
     */
    show_notary_block?: boolean;
  };
  /**
   * Per-org Good-Faith-Estimate template. Defaults to Barry's
   * 70-section / ~210-item taxonomy (DEFAULT_ESTIMATE_TEMPLATE).
   * Builders edit pricing + add/remove items via the Settings →
   * Estimate Template page. The whole object replaces the default
   * when present; missing fields fall back to the seed.
   */
  estimate_template?: import("@/lib/estimate-template-default").EstimateTemplate;
}

/** Builder-authored material line appended to a stock assembly via
 *  cost_overrides.per_assembly.extra_materials. Quantity is computed
 *  as `base + (scale_property × scale_multiplier)`; static lines set
 *  only base, scaling lines set only scale_property+multiplier. */
export interface ExtraMaterial {
  name: string;
  uom: string;
  /** Static quantity added regardless of property values. Default 0. */
  base_quantity?: number;
  /** Name of an existing assembly property to scale by (e.g. "Floor Area"). */
  scale_property?: string;
  /** Multiplier on the scale property's value. Default 1.0. */
  scale_multiplier?: number;
  /** Per-unit material cost (before global multiplier). */
  unit_cost_usd: number;
  /** Per-unit labor cost (before global multiplier). Default 0. */
  labor_cost_usd?: number;
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
    // Draw-tied attachments — sub/supplier invoices + receipts uploaded
    // against a specific milestone for the draw package.
    | "draw_invoice"
    | "draw_receipt"
    // Legacy VAR keys — kept in the union so existing data still parses.
    | "distributor_quote"
    | "customer_quote"
    | "award_document"
    | "vendor_po"
    | "shipping"
    | "other";
  name: string;
  /** Permanent Storage download URL when uploaded via Firebase Storage,
   *  or an in-browser object URL on legacy/demo records. */
  url: string;
  size: number;
  uploaded_at: string;
  /** Optional foreign key into ProjectMilestone — set on draw_invoice /
   *  draw_receipt uploads so the draw page can show only the docs tied
   *  to that milestone. */
  milestone_ref?: string;
  /** Optional foreign key into ProjectRFQ — set on sub_bid attachments
   *  uploaded by a sub through the public bid portal. Lets the RFQ
   *  panel pull "this sub's bid files" without scanning every record. */
  rfq_ref?: string;
  /** Distributor id of the uploader, set on attachments uploaded by a
   *  sub through the public portal. Scopes per-bid file lists. */
  sub_ref?: string;
  /** Storage object path (e.g. "attachments/deal_abc/att_xyz-name.pdf").
   *  When set, deleteAttachment also removes the Storage object. Absent
   *  on legacy records that never went through the Storage pipeline. */
  storage_path?: string;
}

/**
 * One payment in or out on a project. Outgoing payments go to a sub
 * or supplier (`party_ref` → Distributor); incoming come from the
 * client (typically against a milestone draw release).
 *
 * Method covers the common builder workflows — check (with number),
 * credit card, ACH, cash, or other. Notes captures anything that
 * doesn't fit a column.
 */
export interface Payment {
  id: string;
  deal_ref: string;
  direction: "in" | "out";
  /** Distributor id when direction === "out" and party is a sub/supplier. */
  party_ref?: string;
  /** Display name snapshot — works for both "Cano Concrete" and "Client (Maddox)". */
  party_name: string;
  amount: number;
  method: "check" | "cc" | "ach" | "cash" | "other";
  /** Populated when method === "check". */
  check_number?: string;
  /** Optional FK to the milestone this payment applies to — typically the
   *  draw whose release funded the outgoing sub payment, or the draw
   *  whose release came in from the bank. */
  milestone_ref?: string;
  /** ISO yyyy-mm-dd date the payment was made / received. */
  date: string;
  notes?: string;
  created_at: string;
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
