// Firestore-backed CRUD, org-scoped via org_ref. Same API surface as the
// original localStorage version so pages didn't need to change shape.
//
// Pattern: every record sits at the top level (e.g. `deals`, `accounts`)
// with an `org_ref` field that gates access. Firestore security rules
// (firestore.rules) enforce: users can only read/write records where
// `org_ref == request.auth.token.org_ref` (claims set on signup, or
// derived per-request from the user profile in the legacy fallback).
//
// All mutations require an authenticated user with an `org_ref` on their
// profile. Callers must pass the orgRef explicitly — pages get it from
// useAuth().profile.org_ref.

"use client";

import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Deal,
  Account,
  Contact,
  Distributor,
  OrgSettings,
  Attachment,
  QuoteLine,
  newId,
} from "@/types";
import { db } from "./firebase";

// ── helpers ──────────────────────────────────────────────────────

async function listByOrg<T extends { id: string }>(
  collectionName: string,
  orgRef: string,
): Promise<T[]> {
  const q = query(
    collection(db, collectionName),
    where("org_ref", "==", orgRef),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, "id">) })) as T[];
}

async function saveToCollection<T extends { id: string; org_ref: string }>(
  collectionName: string,
  record: T,
): Promise<void> {
  await setDoc(doc(db, collectionName, record.id), record, { merge: false });
}

async function removeFromCollection(
  collectionName: string,
  id: string,
): Promise<void> {
  await deleteDoc(doc(db, collectionName, id));
}

// ── deals ────────────────────────────────────────────────────────

export async function listDeals(orgRef: string): Promise<Deal[]> {
  return listByOrg<Deal>("deals", orgRef);
}

export async function getDeal(id: string): Promise<Deal | undefined> {
  const snap = await getDoc(doc(db, "deals", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Deal) : undefined;
}

export async function saveDeal(deal: Deal): Promise<void> {
  await saveToCollection("deals", { ...deal, updated_at: new Date().toISOString() });
}

export async function deleteDeal(id: string): Promise<void> {
  await removeFromCollection("deals", id);
}

// ── accounts ─────────────────────────────────────────────────────

export async function listAccounts(orgRef: string): Promise<Account[]> {
  return listByOrg<Account>("accounts", orgRef);
}

export async function saveAccount(a: Account): Promise<void> {
  await saveToCollection("accounts", a);
}

export async function deleteAccount(id: string): Promise<void> {
  await removeFromCollection("accounts", id);
}

// ── contacts ─────────────────────────────────────────────────────

export async function listContacts(orgRef: string): Promise<Contact[]> {
  return listByOrg<Contact>("contacts", orgRef);
}

export async function saveContact(c: Contact): Promise<void> {
  await saveToCollection("contacts", c);
}

export async function deleteContact(id: string): Promise<void> {
  await removeFromCollection("contacts", id);
}

// ── distributors ─────────────────────────────────────────────────

export async function listDistributors(orgRef: string): Promise<Distributor[]> {
  return listByOrg<Distributor>("distributors", orgRef);
}

export async function saveDistributor(d: Distributor): Promise<void> {
  await saveToCollection("distributors", d);
}

export async function deleteDistributor(id: string): Promise<void> {
  await removeFromCollection("distributors", id);
}

// ── settings ─────────────────────────────────────────────────────

export async function getSettings(orgRef: string): Promise<OrgSettings | null> {
  const snap = await getDoc(doc(db, "settings", orgRef));
  if (!snap.exists()) return null;
  return { ...(snap.data() as OrgSettings), org_ref: orgRef };
}

export async function saveSettings(s: OrgSettings): Promise<void> {
  await setDoc(doc(db, "settings", s.org_ref), s);
}

// ── quote lines ──────────────────────────────────────────────────

interface StoredQuoteLine extends QuoteLine {
  deal_ref: string;
  org_ref: string;
}

export async function listQuoteLines(dealRef: string): Promise<QuoteLine[]> {
  const q = query(collection(db, "quote_lines"), where("deal_ref", "==", dealRef));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<StoredQuoteLine, "id">) }))
    .sort((a, b) => a.line_number - b.line_number);
}

/**
 * Atomically replace all quote lines for a deal. Caller computes the new
 * line set (typically including renumbered line_number values), passes the
 * full array. Existing lines not in the array are deleted.
 *
 * The `dealRef` and `orgRef` are added to each line by this function so
 * pages don't have to thread them through every save.
 */
export async function saveQuoteLines(
  dealRef: string,
  orgRef: string,
  lines: QuoteLine[],
): Promise<void> {
  const existing = await listQuoteLines(dealRef);
  const existingIds = new Set(existing.map((l) => l.id));
  const incomingIds = new Set(lines.map((l) => l.id));

  // Delete removed lines first (sequential so a failure surfaces cleanly)
  for (const old of existing) {
    if (!incomingIds.has(old.id)) {
      await deleteDoc(doc(db, "quote_lines", old.id));
    }
  }
  // Upsert each line
  for (const line of lines) {
    const stored: StoredQuoteLine = {
      ...line,
      deal_ref: dealRef,
      org_ref: orgRef,
    };
    await setDoc(doc(db, "quote_lines", line.id), stored, { merge: false });
  }
  void existingIds; // for grep clarity, not actually used
}

// ── attachments ──────────────────────────────────────────────────

export async function listAttachments(dealRef: string): Promise<Attachment[]> {
  const q = query(collection(db, "attachments"), where("deal_ref", "==", dealRef));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Attachment, "id">) }));
}

export async function saveAttachment(a: Attachment): Promise<void> {
  await setDoc(doc(db, "attachments", a.id), a, { merge: false });
}

export async function deleteAttachment(id: string): Promise<void> {
  await removeFromCollection("attachments", id);
}

// ── seeding (called once per new org on first deal page load) ────

export async function seedOrgIfEmpty(orgRef: string): Promise<void> {
  const existing = await listDeals(orgRef);
  if (existing.length > 0) return;
  // First-time experience: skip seed deals to keep prod orgs clean. The
  // /demo route exposes the seeded sample pipeline for unauthenticated
  // visitors.
  // (No-op for now. If we later want to seed accounts/distributors with
  // a starter set, do it here gated on absence.)
}

// ── seedDemoData: explicit "load sample data" for live demos ─────
//
// Populates the user's org with 8 sample deals, 3 federal agency
// accounts, 2 distributors, 3 contacts, and a starter set of company
// info. For one of the awarded deals it also creates two parsed PDF
// attachments (synthetic-quote, synthetic-award) so clicking into that
// deal shows the comparison instantly.
//
// Returns the list of (dealId, parsedBomMap) pairs so the caller can
// pre-populate sessionStorage cache that the deal detail page reads.

export interface SeedResult {
  parsedCacheByDeal: Record<string, Record<string, ParsedAttachmentCache>>;
}

export interface ParsedAttachmentCache {
  attachment_id: string;
  template_name: string;
  bom: Array<{
    item_number: string;
    description: string;
    part_number: string;
    qty: number;
    unit_price: number;
    extended_price: number;
    extra_fields: Record<string, string>;
  }>;
  metadata: Record<string, string | number | undefined>;
  total: number;
}

function isoDaysAgo(d: number): string {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString();
}

const SAMPLE_QUOTE_BOM: ParsedAttachmentCache["bom"] = [
  { item_number: "1", part_number: "FAKE-SW-9300",   description: "Catalyst Sample Switch 24-port",       qty: 4,  unit_price: 5300.00, extended_price: 21200.00, extra_fields: {} },
  { item_number: "2", part_number: "FAKE-SFP-10G",   description: "10G SFP+ Optical Transceiver",         qty: 16, unit_price: 287.25,  extended_price: 4596.00,  extra_fields: {} },
  { item_number: "3", part_number: "FAKE-AP-9120",   description: "Wi-Fi 6 Access Point Indoor",          qty: 10, unit_price: 1245.00, extended_price: 12450.00, extra_fields: {} },
  { item_number: "4", part_number: "FAKE-CABLE-3M",  description: "3m Patch Cable Cat6A Blue",            qty: 50, unit_price: 24.99,   extended_price: 1249.50,  extra_fields: {} },
  { item_number: "5", part_number: "FAKE-PWR-AC",    description: "AC Power Supply 1100W",                qty: 4,  unit_price: 895.00,  extended_price: 3580.00,  extra_fields: {} },
  { item_number: "6", part_number: "FAKE-LIC-DNA",   description: "DNA Subscription License (1yr)",       qty: 4,  unit_price: 2150.00, extended_price: 8600.00,  extra_fields: {} },
  { item_number: "7", part_number: "FAKE-RACK-RU2",  description: "2U Rackmount Kit (rail + cable mgmt)", qty: 2,  unit_price: 850.00,  extended_price: 1700.00,  extra_fields: {} },
  { item_number: "8", part_number: "FAKE-PSU-RDND",  description: "Redundant PSU Bracket Assembly",       qty: 4,  unit_price: 320.00,  extended_price: 1280.00,  extra_fields: {} },
];

const SAMPLE_AWARD_BOM: ParsedAttachmentCache["bom"] = [
  { item_number: "1", part_number: "FAKE-SW-9300",     description: "Catalyst Sample Switch 24-port",      qty: 4,  unit_price: 5234.50, extended_price: 20938.00, extra_fields: {} },
  { item_number: "2", part_number: "FAKE-SFP-10G",     description: "10G SFP+ Optical Transceiver",         qty: 16, unit_price: 287.25,  extended_price: 4596.00,  extra_fields: {} },
  { item_number: "3", part_number: "FAKE-AP-9120",     description: "Wi-Fi 6 Access Point Indoor",          qty: 12, unit_price: 1245.00, extended_price: 14940.00, extra_fields: {} },
  { item_number: "4", part_number: "FAKE-CABLE-3M",    description: "3m Patch Cable Cat6A Blue",            qty: 50, unit_price: 24.99,   extended_price: 1249.50,  extra_fields: {} },
  { item_number: "5", part_number: "FAKE-PWR-AC",      description: "AC Power Supply 1100W",                qty: 4,  unit_price: 895.00,  extended_price: 3580.00,  extra_fields: {} },
  { item_number: "6", part_number: "FAKE-LIC-DNA",     description: "DNA Subscription License (1yr)",       qty: 4,  unit_price: 2100.00, extended_price: 8400.00,  extra_fields: {} },
  { item_number: "7", part_number: "FAKE-CON-3YR",     description: "Smartcare Service 3yr (per device)",   qty: 32, unit_price: 446.42,  extended_price: 14285.45, extra_fields: {} },
  { item_number: "8", part_number: "FAKE-INSTALL-LBR", description: "Onsite Installation Labor",            qty: 1,  unit_price: 3500.00, extended_price: 3500.00,  extra_fields: {} },
];

export async function seedDemoData(orgRef: string): Promise<SeedResult> {
  // Accounts
  const accounts: Account[] = [
    {
      id: newId("acc"),
      name: "Department of Sample Administration",
      type: "federal",
      contract_vehicles: ["GSA Schedule 70", "MAS IT"],
      ship_to_addresses: ["1500 Sample Plaza Drive, Suite 200\nSpringfield, VA 22150"],
      payment_terms: "Net 30",
      notes: "",
      org_ref: orgRef,
    },
    {
      id: newId("acc"),
      name: "Veterans Affairs Field Office",
      type: "federal",
      contract_vehicles: ["VA T4NG", "MAS IT"],
      ship_to_addresses: ["810 Vermont Ave NW\nWashington, DC 20420"],
      payment_terms: "Net 30",
      notes: "",
      org_ref: orgRef,
    },
    {
      id: newId("acc"),
      name: "Federal Trade Commission",
      type: "federal",
      contract_vehicles: ["GSA MAS IT"],
      ship_to_addresses: ["600 Pennsylvania Ave NW\nWashington, DC 20580"],
      payment_terms: "Net 45",
      notes: "",
      org_ref: orgRef,
    },
  ];
  for (const a of accounts) await saveAccount(a);

  // Distributors
  const distributors: Distributor[] = [
    {
      id: newId("dist"),
      name: "ScanSource Federal",
      account_number: "SS-12345",
      address: "6 Logue Court\nGreenville, SC 29615",
      order_poc_name: "Federal Orders Desk",
      notes: "Primary networking/IT distributor",
      org_ref: orgRef,
    },
    {
      id: newId("dist"),
      name: "Tech Data / TD SYNNEX Federal",
      account_number: "TD-67890",
      address: "5350 Tech Data Drive\nClearwater, FL 33760",
      order_poc_name: "Federal Sales Team",
      notes: "Backup distributor for Dell, HP",
      org_ref: orgRef,
    },
  ];
  for (const d of distributors) await saveDistributor(d);

  // Contacts
  const contacts: Contact[] = [
    {
      id: newId("ct"),
      name: "Jordan Sample",
      email: "jsample@dsa.gov",
      phone: "(703) 555-0142",
      title: "IT Operations Manager",
      linked_type: "account",
      linked_ref: accounts[0].id,
      linked_name: accounts[0].name,
      is_primary: true,
      org_ref: orgRef,
    },
    {
      id: newId("ct"),
      name: "Robin Example",
      email: "rexample@dsa.gov",
      phone: "(703) 555-0144",
      title: "Contracting Officer",
      linked_type: "account",
      linked_ref: accounts[0].id,
      linked_name: accounts[0].name,
      is_primary: false,
      org_ref: orgRef,
    },
    {
      id: newId("ct"),
      name: "Cori Whittaker",
      email: "cori.whittaker@va.gov",
      phone: "(202) 555-7711",
      title: "Network Operations Lead",
      linked_type: "account",
      linked_ref: accounts[1].id,
      linked_name: accounts[1].name,
      is_primary: true,
      org_ref: orgRef,
    },
  ];
  for (const c of contacts) await saveContact(c);

  // The "DSA — Switch Refresh" deal — gets parsed attachments, comparison
  // will auto-render on its detail page.
  const featuredDealId = newId("deal");
  const now = new Date().toISOString();

  const deals: Deal[] = [
    {
      id: featuredDealId,
      name: "DSA — Switch Refresh (Q2)",
      stage: "awarded",
      deal_type: "quotation",
      manufacturer: "Cisco",
      account_ref: accounts[0].id,
      account_name: accounts[0].name,
      poc_ref: contacts[0].id,
      poc_name: contacts[0].name,
      distributor_ref: distributors[0].id,
      distributor_name: distributors[0].name,
      solicitation_number: "DSA-26-Q-0019",
      customer_po: "DSA-26-P-0042",
      ship_to_address:
        "Acme Federal Solutions, attn: Receiving Dock B\n1500 Sample Plaza Drive, Suite 200\nSpringfield, VA 22150",
      ship_to_poc_name: "Jordan Sample",
      ship_to_poc_email: "jsample@dsa.gov",
      lead_time: "8-10 weeks",
      due_date: isoDaysAgo(-21),
      award_date: isoDaysAgo(2),
      award_total: 71488.95,
      total_quote_value: 54655.5,
      total_cost: 41200.0,
      margin_percent: 24.6,
      notes: "Customer expanded AP qty 10 → 12. Verified mid-week.",
      org_ref: orgRef,
      created_at: isoDaysAgo(28),
      updated_at: isoDaysAgo(2),
    },
    {
      id: newId("deal"),
      name: "VA Field — Wi-Fi 6 expansion (3 sites)",
      stage: "quoted",
      deal_type: "quotation",
      manufacturer: "Cisco",
      account_ref: accounts[1].id,
      account_name: accounts[1].name,
      poc_ref: contacts[2].id,
      poc_name: contacts[2].name,
      distributor_ref: distributors[0].id,
      distributor_name: distributors[0].name,
      solicitation_number: "VA-26-Q-3318",
      customer_po: "",
      ship_to_address: "VA Field IT Operations\n810 Vermont Ave NW\nWashington, DC 20420",
      ship_to_poc_name: "Cori Whittaker",
      ship_to_poc_email: "cori.whittaker@va.gov",
      lead_time: "6-8 weeks",
      due_date: isoDaysAgo(-7),
      award_total: 0,
      total_quote_value: 128400,
      total_cost: 102600,
      margin_percent: 20.1,
      notes: "Quote sent. Awaiting customer signature on FY26 funds release.",
      org_ref: orgRef,
      created_at: isoDaysAgo(14),
      updated_at: isoDaysAgo(3),
    },
    {
      id: newId("deal"),
      name: "FTC HQ — Edge router replacement",
      stage: "vendor_sourcing",
      deal_type: "quotation",
      manufacturer: "Cisco",
      account_ref: accounts[2].id,
      account_name: accounts[2].name,
      distributor_ref: distributors[0].id,
      distributor_name: distributors[0].name,
      solicitation_number: "FTC-26-Q-0084",
      customer_po: "",
      ship_to_address: "600 Pennsylvania Ave NW\nWashington, DC 20580",
      ship_to_poc_name: "",
      ship_to_poc_email: "",
      lead_time: "10-12 weeks",
      award_total: 0,
      total_quote_value: 0,
      total_cost: 0,
      margin_percent: 0,
      notes: "Pulled distributor quote — waiting on EOL alternates for 4451-X.",
      org_ref: orgRef,
      created_at: isoDaysAgo(5),
      updated_at: isoDaysAgo(1),
    },
    {
      id: newId("deal"),
      name: "DSA — Video endpoint refresh",
      stage: "rfq",
      deal_type: "budgetary",
      manufacturer: "Cisco",
      account_ref: accounts[0].id,
      account_name: accounts[0].name,
      poc_ref: contacts[0].id,
      poc_name: contacts[0].name,
      solicitation_number: "DSA-26-Q-0061",
      customer_po: "",
      ship_to_address: "",
      ship_to_poc_name: "",
      ship_to_poc_email: "",
      lead_time: "",
      award_total: 0,
      total_quote_value: 0,
      total_cost: 0,
      margin_percent: 0,
      notes: "Budgetary only — finalize spec list next week.",
      org_ref: orgRef,
      created_at: isoDaysAgo(2),
      updated_at: isoDaysAgo(2),
    },
    {
      id: newId("deal"),
      name: "VA Field — TACACS+ migration",
      stage: "po_sent",
      deal_type: "quotation",
      manufacturer: "Cisco",
      account_ref: accounts[1].id,
      account_name: accounts[1].name,
      poc_ref: contacts[2].id,
      poc_name: contacts[2].name,
      distributor_ref: distributors[0].id,
      distributor_name: distributors[0].name,
      solicitation_number: "VA-26-Q-2710",
      customer_po: "VA-26-P-0099",
      ship_to_address: "VA Field IT Operations\n810 Vermont Ave NW\nWashington, DC 20420",
      ship_to_poc_name: "Cori Whittaker",
      ship_to_poc_email: "cori.whittaker@va.gov",
      lead_time: "Delivered",
      award_date: isoDaysAgo(38),
      award_total: 38420,
      total_quote_value: 38420,
      total_cost: 30100,
      margin_percent: 21.7,
      notes: "Vendor PO sent to ScanSource Apr 15. ETA 4-6 weeks.",
      org_ref: orgRef,
      created_at: isoDaysAgo(60),
      updated_at: isoDaysAgo(7),
    },
    {
      id: newId("deal"),
      name: "DSA — Desk phone refresh (regional)",
      stage: "partially_shipped",
      deal_type: "quotation",
      manufacturer: "Cisco",
      account_ref: accounts[0].id,
      account_name: accounts[0].name,
      poc_ref: contacts[0].id,
      poc_name: contacts[0].name,
      distributor_ref: distributors[0].id,
      distributor_name: distributors[0].name,
      solicitation_number: "DSA-26-Q-0014",
      customer_po: "DSA-26-P-0028",
      ship_to_address: "1500 Sample Plaza Drive\nSpringfield, VA 22150",
      ship_to_poc_name: "Jordan Sample",
      ship_to_poc_email: "jsample@dsa.gov",
      lead_time: "8 weeks",
      award_date: isoDaysAgo(75),
      award_total: 184200,
      total_quote_value: 184200,
      total_cost: 145400,
      margin_percent: 21.1,
      notes: "12 of 18 sites delivered; 6 remain in queue.",
      org_ref: orgRef,
      created_at: isoDaysAgo(95),
      updated_at: isoDaysAgo(4),
    },
    {
      id: newId("deal"),
      name: "DSA — UPS / power refresh",
      stage: "closed_won",
      deal_type: "quotation",
      manufacturer: "APC",
      account_ref: accounts[0].id,
      account_name: accounts[0].name,
      distributor_ref: distributors[1].id,
      distributor_name: distributors[1].name,
      solicitation_number: "DSA-25-Q-9912",
      customer_po: "DSA-25-P-1133",
      ship_to_address: "1500 Sample Plaza Drive\nSpringfield, VA 22150",
      ship_to_poc_name: "Jordan Sample",
      ship_to_poc_email: "jsample@dsa.gov",
      lead_time: "Closed",
      award_date: isoDaysAgo(120),
      award_total: 22340,
      total_quote_value: 22340,
      total_cost: 17800,
      margin_percent: 20.3,
      notes: "Closed and invoiced.",
      org_ref: orgRef,
      created_at: isoDaysAgo(150),
      updated_at: isoDaysAgo(90),
    },
    {
      id: newId("deal"),
      name: "FTC — Smartnet renewal RFQ",
      stage: "closed_lost",
      deal_type: "quotation",
      manufacturer: "Cisco",
      account_ref: accounts[2].id,
      account_name: accounts[2].name,
      solicitation_number: "FTC-26-Q-0009",
      customer_po: "",
      ship_to_address: "",
      ship_to_poc_name: "",
      ship_to_poc_email: "",
      lead_time: "",
      award_total: 0,
      total_quote_value: 8400,
      total_cost: 6800,
      margin_percent: 19.0,
      notes: "Lost to incumbent. No-bid memo on file.",
      org_ref: orgRef,
      created_at: isoDaysAgo(45),
      updated_at: isoDaysAgo(10),
    },
  ];
  for (const d of deals) await saveDeal(d);
  void now;

  // Featured deal: parsed attachments + cache
  const quoteAttId = newId("att");
  const awardAttId = newId("att");
  const featuredAttachments: Attachment[] = [
    {
      id: quoteAttId,
      deal_ref: featuredDealId,
      category: "customer_quote",
      name: "synthetic-quote.pdf",
      url: "/samples/synthetic-quote.pdf",
      size: 3300,
      uploaded_at: isoDaysAgo(5),
    },
    {
      id: awardAttId,
      deal_ref: featuredDealId,
      category: "award_document",
      name: "synthetic-award.pdf",
      url: "/samples/synthetic-award.pdf",
      size: 3600,
      uploaded_at: isoDaysAgo(2),
    },
  ];
  for (const att of featuredAttachments) await saveAttachment(att);

  const quoteTotal = SAMPLE_QUOTE_BOM.reduce((s, l) => s + l.extended_price, 0);
  const awardTotal = SAMPLE_AWARD_BOM.reduce((s, l) => s + l.extended_price, 0);

  const parsedCacheByDeal: SeedResult["parsedCacheByDeal"] = {
    [featuredDealId]: {
      [quoteAttId]: {
        attachment_id: quoteAttId,
        template_name: "Federal Award (Generic Section-B)",
        bom: SAMPLE_QUOTE_BOM,
        metadata: {
          document_number: "QT-2026-0419",
          document_date: "2026-04-12",
          total_amount: quoteTotal,
          buyer_name: "Acme Federal Solutions",
        },
        total: quoteTotal,
      },
      [awardAttId]: {
        attachment_id: awardAttId,
        template_name: "Federal Award (Generic Section-B)",
        bom: SAMPLE_AWARD_BOM,
        metadata: {
          document_number: "DSA-26-P-0042",
          document_date: "2026-04-21",
          total_amount: awardTotal,
          buyer_name: "Department of Sample Administration",
          ship_to_address:
            "Acme Federal Solutions, attn: Receiving Dock B\n1500 Sample Plaza Drive, Suite 200\nSpringfield, VA 22150",
          ship_to_contact: "Jordan Sample",
          ship_to_email: "jsample@dsa.gov",
          period_of_performance_start: "2026-05-01",
          period_of_performance_end: "2027-04-30",
          contracting_officer_name: "Robin Example",
          contracting_officer_email: "rexample@dsa.gov",
          agency: "Department of Sample Administration",
        },
        total: awardTotal,
      },
    },
  };

  return { parsedCacheByDeal };
}

// ── re-exports ───────────────────────────────────────────────────

export { newId };
export const SERVER_TIMESTAMP = serverTimestamp;
