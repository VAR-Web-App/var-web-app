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
import { deleteUploadedFile } from "./storage";
import {
  Deal,
  Account,
  ClientSignLink,
  Contact,
  Distributor,
  OrgSettings,
  Attachment,
  Payment,
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

// ── payments ─────────────────────────────────────────────────────

export async function listPayments(dealRef: string): Promise<Payment[]> {
  const q = query(collection(db, "payments"), where("deal_ref", "==", dealRef));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Payment, "id">) }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export async function savePayment(p: Payment): Promise<void> {
  await setDoc(doc(db, "payments", p.id), p, { merge: false });
}

export async function deletePayment(id: string): Promise<void> {
  await removeFromCollection("payments", id);
}

// ── attachments ──────────────────────────────────────────────────

export async function listAttachments(dealRef: string): Promise<Attachment[]> {
  const q = query(collection(db, "attachments"), where("deal_ref", "==", dealRef));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Attachment, "id">) }));
}

/** Sub-uploaded bid files for a single RFQ. Used by the GC's RFQ
 *  comparison view to surface attachments per invitee. */
export async function listAttachmentsByRFQ(
  rfqId: string,
): Promise<Attachment[]> {
  const q = query(
    collection(db, "attachments"),
    where("rfq_ref", "==", rfqId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Attachment, "id">),
  }));
}

export async function saveAttachment(a: Attachment): Promise<void> {
  await setDoc(doc(db, "attachments", a.id), a, { merge: false });
}

export async function deleteAttachment(id: string): Promise<void> {
  // Look up the storage_path before deleting the doc, so we can clean up
  // the Storage object too. Object-not-found is swallowed by the helper.
  const snap = await getDoc(doc(db, "attachments", id));
  const storagePath = snap.exists()
    ? (snap.data() as Attachment).storage_path
    : undefined;
  await removeFromCollection("attachments", id);
  if (storagePath) await deleteUploadedFile(storagePath);
}

// ── project milestones (Builder vertical) ────────────────────────
// One milestone == one draw. Schema in src/types/builder.ts mirrors
// ProjectPulse's MilestoneRecord so behaviors transfer.

import type {
  ProjectMilestone,
  ProjectPhoto,
  SubAcknowledgment,
  SubScheduleLink,
  SubScheduleAssignment,
} from "@/types/builder";

export async function listMilestones(dealRef: string): Promise<ProjectMilestone[]> {
  const q = query(collection(db, "project_milestones"), where("deal_ref", "==", dealRef));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectMilestone, "id">) }));
  return items.sort((a, b) => a.order - b.order);
}

/** Every milestone across every deal in the org. Used by the conflict
 *  detector to spot subs double-booked across multiple projects. */
export async function listAllMilestonesForOrg(
  orgRef: string,
): Promise<ProjectMilestone[]> {
  const q = query(
    collection(db, "project_milestones"),
    where("org_ref", "==", orgRef),
  );
  const snap = await getDocs(q);
  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<ProjectMilestone, "id">) }),
  );
}

export async function saveMilestone(m: ProjectMilestone): Promise<void> {
  await setDoc(doc(db, "project_milestones", m.id), m, { merge: false });
}

export async function saveMilestones(items: ProjectMilestone[]): Promise<void> {
  // Sequential rather than batched — same Firestore approach as
  // saveQuoteLines; keeps the failure mode obvious. Demo volumes are tiny.
  for (const m of items) await saveMilestone(m);
}

export async function deleteMilestone(id: string): Promise<void> {
  await removeFromCollection("project_milestones", id);
}

/** Sub acknowledgments for every milestone on this deal. Server-written
 *  via /api/sub/acknowledge; GC reads here for badge surfacing. Multiple
 *  rows per (milestone, sub) form an audit trail — caller picks latest. */
export async function listSubAcknowledgmentsByDeal(
  dealRef: string,
): Promise<SubAcknowledgment[]> {
  const q = query(
    collection(db, "sub_acknowledgments"),
    where("deal_ref", "==", dealRef),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as SubAcknowledgment);
}

// ── project photos (Builder vertical) ────────────────────────────

export async function listPhotos(dealRef: string): Promise<ProjectPhoto[]> {
  const q = query(collection(db, "project_photos"), where("deal_ref", "==", dealRef));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectPhoto, "id">) }));
  return items.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
}

export async function savePhoto(p: ProjectPhoto): Promise<void> {
  await setDoc(doc(db, "project_photos", p.id), p, { merge: false });
}

export async function deletePhoto(id: string): Promise<void> {
  const snap = await getDoc(doc(db, "project_photos", id));
  const storagePath = snap.exists()
    ? (snap.data() as ProjectPhoto).storage_path
    : undefined;
  await removeFromCollection("project_photos", id);
  if (storagePath) await deleteUploadedFile(storagePath);
}

// ── project RFQs (Builder vertical) ──────────────────────────────

import type { ProjectRFQ, ProjectChangeOrder } from "@/types/builder";

// ── project change orders (Builder vertical) ─────────────────────

export async function listChangeOrders(dealRef: string): Promise<ProjectChangeOrder[]> {
  const q = query(collection(db, "project_change_orders"), where("deal_ref", "==", dealRef));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectChangeOrder, "id">) }));
  return items.sort((a, b) => a.number.localeCompare(b.number));
}

export async function saveChangeOrder(co: ProjectChangeOrder): Promise<void> {
  await setDoc(doc(db, "project_change_orders", co.id), co, { merge: false });
}

export async function deleteChangeOrder(id: string): Promise<void> {
  await removeFromCollection("project_change_orders", id);
}

/** Effective contract value = base contract + sum of approved COs.
 *  Single source of truth for "what's the current contract" used across
 *  the project page, draw requests, proposal, and portal. */
export function effectiveContractValue(
  baseContractValue: number,
  changeOrders: ProjectChangeOrder[]
): number {
  return baseContractValue + changeOrders
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + c.amount_delta, 0);
}

export async function listRFQs(dealRef: string): Promise<ProjectRFQ[]> {
  const q = query(collection(db, "project_rfqs"), where("deal_ref", "==", dealRef));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectRFQ, "id">) }));
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function saveRFQ(r: ProjectRFQ): Promise<void> {
  await setDoc(doc(db, "project_rfqs", r.id), r, { merge: false });
}

// ── client sign links (public-facing proposal acceptance) ───────
//
// Top-level collection client_sign_links/{token}. Doc ID IS the token
// so the client doesn't need auth to read by URL. Firestore rules
// allow public read + a single update writing the signature fields.
// See firestore.rules for the trust boundary.

export async function createClientSignLink(link: ClientSignLink): Promise<void> {
  await setDoc(doc(db, "client_sign_links", link.token), link, { merge: false });
}

export async function getClientSignLink(token: string): Promise<ClientSignLink | undefined> {
  const snap = await getDoc(doc(db, "client_sign_links", token));
  if (!snap.exists()) return undefined;
  return snap.data() as ClientSignLink;
}

export async function signClientSignLink(
  token: string,
  patch: { signed_by_name: string; signed_user_agent?: string }
): Promise<void> {
  const ref = doc(db, "client_sign_links", token);
  const existing = await getDoc(ref);
  if (!existing.exists()) throw new Error("Sign link not found");
  const data = existing.data() as ClientSignLink;
  await setDoc(
    ref,
    {
      ...data,
      signed_by_name: patch.signed_by_name,
      signed_user_agent: patch.signed_user_agent,
      signed_at: new Date().toISOString(),
    },
    { merge: false },
  );
}

export async function markSignLinkSynced(token: string): Promise<void> {
  const ref = doc(db, "client_sign_links", token);
  const existing = await getDoc(ref);
  if (!existing.exists()) return;
  const data = existing.data() as ClientSignLink;
  await setDoc(ref, { ...data, synced_to_deal: true }, { merge: false });
}

export async function deleteRFQ(id: string): Promise<void> {
  await removeFromCollection("project_rfqs", id);
}

// ── sub schedule links (public, no-login sub schedule page) ──────
//
// Top-level sub_schedule_links/{token} doc — public read, gated by the
// unguessable token (see firestore.rules). Stores a denormalized
// snapshot of one sub's assignments so the /s/{token} page renders
// without auth and without reading org-scoped collections.

export async function getSubScheduleLink(
  token: string,
): Promise<SubScheduleLink | undefined> {
  const snap = await getDoc(doc(db, "sub_schedule_links", token));
  return snap.exists() ? (snap.data() as SubScheduleLink) : undefined;
}

/**
 * Recompute and persist a sub's schedule snapshot, returning the stable
 * token for their /s/{token} page. Generates + stores the token on the
 * distributor doc on first call. Re-reads the distributor fresh so a
 * stale caller-side copy can't orphan a second token.
 */
export async function refreshSubScheduleLink(
  subId: string,
  builderName: string,
): Promise<string> {
  const subSnap = await getDoc(doc(db, "distributors", subId));
  if (!subSnap.exists()) throw new Error("Sub not found");
  const sub = { id: subSnap.id, ...(subSnap.data() as Omit<Distributor, "id">) };

  let token = sub.schedule_token;
  if (!token) {
    token = crypto.randomUUID();
    await saveDistributor({ ...sub, schedule_token: token });
  }

  // Snapshot the sub's assignments across every project in the org.
  // Carry forward any acknowledgment from the previous snapshot so a
  // reschedule write doesn't wipe the sub's "confirmed" / "flag" state.
  // Stale acks (date changed since the sub clicked) stay visible — the
  // GC can see for_start_date drift and decide.
  const priorSnap = await getDoc(doc(db, "sub_schedule_links", token));
  const priorAcks = new Map<string, SubScheduleAssignment["acknowledgment"]>();
  if (priorSnap.exists()) {
    const prior = priorSnap.data() as SubScheduleLink;
    for (const a of prior.assignments || []) {
      if (a.milestone_ref && a.acknowledgment) {
        priorAcks.set(a.milestone_ref, a.acknowledgment);
      }
    }
  }

  const deals = await listDeals(sub.org_ref);
  const assignments: SubScheduleAssignment[] = [];
  for (const d of deals) {
    const milestones = await listMilestones(d.id);
    for (const m of milestones) {
      if ((m.assigned_subs || []).includes(subId)) {
        const ack = priorAcks.get(m.id);
        assignments.push({
          milestone_ref: m.id,
          project_name: d.name,
          project_address: d.ship_to_address,
          phase_name: m.name,
          status: m.status,
          start_date: m.planned_start_date,
          end_date: m.planned_end_date,
          ...(ack ? { acknowledgment: ack } : {}),
        });
      }
    }
  }
  assignments.sort((a, b) =>
    (a.start_date || "").localeCompare(b.start_date || ""),
  );

  const link: SubScheduleLink = {
    token,
    sub_ref: subId,
    org_ref: sub.org_ref,
    sub_name: sub.name,
    builder_name: builderName,
    assignments,
    updated_at: new Date().toISOString(),
  };
  await setDoc(doc(db, "sub_schedule_links", token), link, { merge: false });
  return token;
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

  // Seed a sample builder identity so proposals + sign links render with
  // a real company name out of the box (instead of falling back to
  // "Your builder"). The real builder overrides this in Settings.
  const existingSettings = await getSettings(orgRef);
  if (!existingSettings || !existingSettings.company_name) {
    await saveSettings({
      org_ref: orgRef,
      company_name: "Hill Country Custom Homes",
      company_address: "210 Main St, Boerne, TX 78006",
      company_phone: "(830) 555-0142",
      company_email: "office@hillcountrycustomhomes.com",
      cage_code: "TX-CHC-114829",          // → State Contractor License #
      duns: "82-3391047",                  // → EIN
      sam_id: "BOERNE-BL-2026-0093",        // → Local business license #
      default_blanket_discount_percent: 0,
      default_markup_percent: 15,
      default_manufacturer: "Custom Home",
      prepared_by_name: "Dale Whitford",
      prepared_by_phone: "(830) 555-0143",
    });
  }

  return { parsedCacheByDeal };
}

// ── wipeOrgData: blow away every record for an org ───────────────
// Useful for demo prep when stale fixtures need replacing. Wipes deals
// and all child records (quote_lines, attachments, milestones, photos,
// rfqs) plus accounts, contacts, distributors. Settings preserved.
//
// NOT meant for production users — destructive and irreversible.

export async function wipeOrgData(orgRef: string): Promise<void> {
  const allDeals = await listDeals(orgRef);

  // Cascade-delete child records per deal first.
  for (const deal of allDeals) {
    const [lines, atts, milestones, photos] = await Promise.all([
      listQuoteLines(deal.id),
      listAttachments(deal.id),
      listMilestones(deal.id),
      listPhotos(deal.id),
    ]);
    const rfqs = await listRFQs(deal.id);
    for (const l of lines) await removeFromCollection("quote_lines", l.id);
    for (const a of atts) await deleteAttachment(a.id);
    for (const m of milestones) await deleteMilestone(m.id);
    for (const p of photos) await deletePhoto(p.id);
    for (const r of rfqs) await deleteRFQ(r.id);
    await deleteDeal(deal.id);
  }

  // Top-level records.
  const accounts = await listAccounts(orgRef);
  for (const a of accounts) await deleteAccount(a.id);
  const contacts = await listContacts(orgRef);
  for (const c of contacts) await deleteContact(c.id);
  const distributors = await listDistributors(orgRef);
  for (const d of distributors) await deleteDistributor(d.id);
}

export async function resetAndSeedBuilderDemo(orgRef: string): Promise<SeedResult> {
  await wipeOrgData(orgRef);
  return seedBuilderDemoData(orgRef);
}

// ── seedBuilderDemoData: builder-flavored sample data ────────────
// Replaces the federal-IT-VAR sample with custom-home builder
// fixtures: homeowner clients, trade subs, projects across all
// pipeline stages, and a fully-populated 'In Progress' project
// with realistic milestones (some completed, some active, some
// pending) for the photo gallery + Gantt + draw flow demos.

export async function seedBuilderDemoData(orgRef: string): Promise<SeedResult> {
  // ── Clients (homeowners + a developer) ────────────────────────
  const clients: Account[] = [
    {
      id: newId("client"),
      name: "Maddox Family",
      type: "commercial",
      contract_vehicles: ["Architect referral — Smith Designs"],
      ship_to_addresses: ["1428 Lee Rd\nBoerne, TX 78006"],
      payment_terms: "Per draw schedule (construction loan)",
      notes: "Construction loan with First Texas Bank — draws need AIA-style docs.",
      org_ref: orgRef,
    },
    {
      id: newId("client"),
      name: "Hunter Family",
      type: "commercial",
      contract_vehicles: ["Direct inquiry — website"],
      ship_to_addresses: ["3210 Lakeshore Drive\nCanyon Lake, TX 78133"],
      payment_terms: "Per draw schedule",
      notes: "",
      org_ref: orgRef,
    },
    {
      id: newId("client"),
      name: "Wilson Family",
      type: "commercial",
      contract_vehicles: [],
      ship_to_addresses: ["907 Oakwood Ave\nSan Antonio, TX 78212"],
      payment_terms: "50% deposit, 50% completion",
      notes: "Repeat client — built their main house 4 years ago.",
      org_ref: orgRef,
    },
    {
      id: newId("client"),
      name: "Reyes Holdings LLC",
      type: "federal", // mapped to "Developer" in builder UI
      contract_vehicles: ["Spec home build — Cedar Ridge subdivision"],
      ship_to_addresses: ["4231 Cedar Lane\nBoerne, TX 78006"],
      payment_terms: "Net 30 from milestone completion",
      notes: "Developer building 8 spec homes in the subdivision; this is unit 3.",
      org_ref: orgRef,
    },
    {
      id: newId("client"),
      name: "Patel Family",
      type: "commercial",
      contract_vehicles: [],
      ship_to_addresses: ["55 Hillside Drive\nSan Antonio, TX 78258"],
      payment_terms: "Per draw schedule",
      notes: "Kitchen remodel only — completed Mar 2026, in warranty.",
      org_ref: orgRef,
    },
  ];
  for (const c of clients) await saveAccount(c);

  // ── Subs & suppliers ──────────────────────────────────────────
  const subs: Distributor[] = [
    {
      id: newId("sub"),
      name: "Cano Concrete & Foundation",
      account_number: "Foundation",
      address: "210 Industrial Dr\nBoerne, TX 78006",
      order_poc_name: "Mike Cano",
      notes: "Reliable, on time. Best for crawl + slab; not basement.",
      org_ref: orgRef,
    },
    {
      id: newId("sub"),
      name: "Hill Country Framing",
      account_number: "Framing",
      address: "5500 N Loop 1604\nSan Antonio, TX 78248",
      order_poc_name: "Dave Pruitt",
      notes: "Crew of 8. Bids are usually 5-8% higher but quality is best in region.",
      org_ref: orgRef,
    },
    {
      id: newId("sub"),
      name: "Quick-Sparks Electric",
      account_number: "Electrical",
      address: "1820 Crockett St\nBoerne, TX 78006",
      order_poc_name: "Lisa Hernandez",
      notes: "Master electrician + 3 apprentices. Solar pre-wire ready.",
      org_ref: orgRef,
    },
    {
      id: newId("sub"),
      name: "Texas Plumb Pros",
      account_number: "Plumbing",
      address: "411 Main St\nBoerne, TX 78006",
      order_poc_name: "Carlos Reyes",
      notes: "PEX or copper. Tankless install certified.",
      org_ref: orgRef,
    },
    {
      id: newId("sub"),
      name: "Comfort HVAC",
      account_number: "HVAC",
      address: "9100 IH-10 W\nSan Antonio, TX 78230",
      order_poc_name: "Tony Mitchell",
      notes: "Mini-split + ducted. Trane preferred dealer.",
      org_ref: orgRef,
    },
    {
      id: newId("supplier"),
      name: "Boerne Lumber Co.",
      account_number: "Lumber yard",
      address: "1100 Old San Antonio Rd\nBoerne, TX 78006",
      order_poc_name: "Pro Desk",
      notes: "30-day terms. Trim package + millwork specialty.",
      org_ref: orgRef,
    },
  ];
  for (const s of subs) await saveDistributor(s);

  // ── Contacts (homeowners as primary contacts) ─────────────────
  const contacts: Contact[] = [
    {
      id: newId("ct"),
      name: "Brennan Maddox",
      email: "brennan@maddoxfam.com",
      phone: "(210) 555-0142",
      title: "Homeowner",
      linked_type: "account",
      linked_ref: clients[0].id,
      linked_name: clients[0].name,
      is_primary: true,
      org_ref: orgRef,
    },
    {
      id: newId("ct"),
      name: "Jenny Hunter",
      email: "jhunter@example.com",
      phone: "(210) 555-0188",
      title: "Homeowner",
      linked_type: "account",
      linked_ref: clients[1].id,
      linked_name: clients[1].name,
      is_primary: true,
      org_ref: orgRef,
    },
    {
      id: newId("ct"),
      name: "Daniel Reyes",
      email: "dreyes@reyesholdings.com",
      phone: "(210) 555-0210",
      title: "Owner / Developer",
      linked_type: "account",
      linked_ref: clients[3].id,
      linked_name: clients[3].name,
      is_primary: true,
      org_ref: orgRef,
    },
  ];
  for (const ct of contacts) await saveContact(ct);

  // ── Projects across stages ────────────────────────────────────
  // The Maddox project is the demo's anchor — it's mid-build with
  // milestones populated below. Other projects show pipeline variety.
  const maddoxId = newId("deal");

  const projects: Deal[] = [
    {
      id: maddoxId,
      name: "Maddox — Country Dream House",
      stage: "po_sent", // "Pre-Construction" / partially_shipped maps to "In Progress"
      deal_type: "quotation",
      manufacturer: "Custom Home",
      account_ref: clients[0].id,
      account_name: clients[0].name,
      poc_ref: contacts[0].id,
      poc_name: contacts[0].name,
      solicitation_number: "MAD-2026-001",
      customer_po: "First Texas Bank construction loan #CL-29844",
      ship_to_address: "1428 Lee Rd\nBoerne, TX 78006",
      ship_to_poc_name: "Brennan Maddox",
      ship_to_poc_email: "brennan@maddoxfam.com",
      lead_time: "32 weeks",
      due_date: isoDaysAgo(60).slice(0, 10),
      award_date: isoDaysAgo(55),
      award_total: 1450000,
      total_quote_value: 1450000,
      total_cost: 1235000,
      margin_percent: 14.8,
      notes: "Construction loan in place. Bank wants AIA-style draw requests for each milestone.",
      org_ref: orgRef,
      created_at: isoDaysAgo(90),
      updated_at: isoDaysAgo(2),
      // Deterministic weather banner for live demos. Tomorrow's date
      // falls inside the Dried-In (awaiting_approval) and MEP
      // (in_progress) phase windows, so the banner flags both.
      demo_weather_alert: {
        date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        reason: 'Rain (1.4")',
      },
    },
    {
      id: newId("deal"),
      name: "Hunter — Lakefront Custom",
      stage: "vendor_sourcing", // = Estimating
      deal_type: "quotation",
      manufacturer: "Custom Home",
      account_ref: clients[1].id,
      account_name: clients[1].name,
      poc_ref: contacts[1].id,
      poc_name: contacts[1].name,
      solicitation_number: "HUN-2026-002",
      customer_po: "",
      ship_to_address: "3210 Lakeshore Drive\nCanyon Lake, TX 78133",
      ship_to_poc_name: "Jenny Hunter",
      ship_to_poc_email: "jhunter@example.com",
      lead_time: "36 weeks",
      due_date: isoDaysAgo(-90).slice(0, 10),
      award_total: 0,
      total_quote_value: 0,
      total_cost: 0,
      margin_percent: 0,
      notes: "Architect: Smith Designs. Plans being finalized — RFQs go out next week.",
      org_ref: orgRef,
      created_at: isoDaysAgo(14),
      updated_at: isoDaysAgo(2),
    },
    {
      id: newId("deal"),
      name: "Wilson — Master Suite Addition",
      stage: "rfq", // = Lead
      deal_type: "budgetary",
      manufacturer: "Addition",
      account_ref: clients[2].id,
      account_name: clients[2].name,
      solicitation_number: "WIL-2026-003",
      customer_po: "",
      ship_to_address: "907 Oakwood Ave\nSan Antonio, TX 78212",
      ship_to_poc_name: "",
      ship_to_poc_email: "",
      lead_time: "16 weeks",
      due_date: isoDaysAgo(-120).slice(0, 10),
      award_total: 0,
      total_quote_value: 0,
      total_cost: 0,
      margin_percent: 0,
      notes: "Repeat client. Want budgetary number this week — detailed estimate after they sign architect.",
      org_ref: orgRef,
      created_at: isoDaysAgo(3),
      updated_at: isoDaysAgo(1),
    },
    {
      id: newId("deal"),
      name: "Reyes Spec — 4231 Cedar Lane",
      stage: "quoted", // = Estimate Sent
      deal_type: "quotation",
      manufacturer: "Spec Build",
      account_ref: clients[3].id,
      account_name: clients[3].name,
      poc_ref: contacts[2].id,
      poc_name: contacts[2].name,
      solicitation_number: "REY-2026-004",
      customer_po: "",
      ship_to_address: "4231 Cedar Lane\nBoerne, TX 78006",
      ship_to_poc_name: "Daniel Reyes",
      ship_to_poc_email: "dreyes@reyesholdings.com",
      lead_time: "28 weeks",
      due_date: isoDaysAgo(-30).slice(0, 10),
      award_total: 0,
      total_quote_value: 685000,
      total_cost: 590000,
      margin_percent: 13.9,
      notes: "Spec build — Daniel waiting on bank approval before signing.",
      org_ref: orgRef,
      created_at: isoDaysAgo(21),
      updated_at: isoDaysAgo(5),
    },
    {
      id: newId("deal"),
      name: "Webb — Hill Country Cabin",
      stage: "awarded", // = Contract Signed
      deal_type: "quotation",
      manufacturer: "Custom Home",
      account_ref: clients[1].id, // re-using Hunter family slot for simplicity in seed
      account_name: "Webb Family",
      poc_name: "Drew Webb",
      solicitation_number: "WEB-2026-005",
      customer_po: "Hill Country National Bank construction loan #CL-30041",
      ship_to_address: "1980 Ranch Road 12\nWimberley, TX 78676",
      ship_to_poc_name: "Drew Webb",
      ship_to_poc_email: "drew@webbfamily.com",
      lead_time: "24 weeks",
      due_date: isoDaysAgo(-180).slice(0, 10),
      award_date: isoDaysAgo(8),
      award_total: 685000,
      total_quote_value: 685000,
      total_cost: 578000,
      margin_percent: 15.6,
      notes:
        "Signed last week. Permits pending — break ground ~3 weeks out.",
      org_ref: orgRef,
      created_at: isoDaysAgo(35),
      updated_at: isoDaysAgo(2),
    },
    {
      id: newId("deal"),
      name: "Patel — Kitchen Remodel",
      stage: "closed_won", // = Complete
      deal_type: "quotation",
      manufacturer: "Remodel",
      account_ref: clients[4].id,
      account_name: clients[4].name,
      solicitation_number: "PAT-2025-018",
      customer_po: "Personal funds",
      ship_to_address: "55 Hillside Drive\nSan Antonio, TX 78258",
      ship_to_poc_name: "",
      ship_to_poc_email: "",
      lead_time: "Complete",
      due_date: isoDaysAgo(75).slice(0, 10),
      award_date: isoDaysAgo(180),
      award_total: 142000,
      total_quote_value: 142000,
      total_cost: 118500,
      margin_percent: 16.5,
      notes: "In warranty period (30-day post-occupancy walkthrough completed clean).",
      org_ref: orgRef,
      created_at: isoDaysAgo(220),
      updated_at: isoDaysAgo(45),
    },
  ];
  for (const p of projects) await saveDeal(p);

  // ── Maddox milestones (the anchor project gets a fully-populated
  //    schedule + draw history so the demo is rich on click-through).
  const today = new Date();
  const phaseStarts = [-120, -90, -75, -45, -30, -15, 5, 60, 75]; // days from today
  const phaseDurations = [7, 21, 42, 14, 21, 21, 56, 14, 30];
  const phaseStatuses: Array<
    "released" | "approved" | "awaiting_approval" | "in_progress" | "pending"
  > = [
    "released",            // Deposit
    "released",            // Foundation
    "released",            // Framing
    "awaiting_approval",   // Dried-In — work complete, draw in the inbox
    "in_progress",         // MEP (current, started in parallel)
    "pending",             // Drywall
    "pending",             // Finishes
    "pending",             // Punch
    "pending",             // Warranty
  ];

  const milestonePhases = [
    { key: "deposit", label: "Deposit / Mobilization", percent: 5, description: "Contract signing + permits + site prep" },
    { key: "foundation", label: "Foundation Complete", percent: 10, description: "Excavation, footings, foundation walls poured" },
    { key: "framing", label: "Framing Complete", percent: 20, description: "Frame up, sheathing, roof structure" },
    { key: "dried_in", label: "Dried-In", percent: 10, description: "Roof, windows, exterior doors installed" },
    { key: "mep_rough", label: "MEP Rough-In", percent: 15, description: "Plumbing, electrical, HVAC rough complete + inspected" },
    { key: "drywall", label: "Drywall & Insulation", percent: 10, description: "Insulation, drywall hung + finished" },
    { key: "finishes", label: "Finishes", percent: 20, description: "Trim, paint, flooring, cabinets, fixtures" },
    { key: "punch", label: "Punch List", percent: 5, description: "Final inspections, punch list complete, CO issued" },
    { key: "warranty", label: "Warranty Period", percent: 5, description: "30-day post-occupancy walkthrough" },
  ];

  // Sub assignments per phase — pulls from the subs[] array created
  // earlier in this function. Index into subs: 0=Cano Concrete,
  // 1=Hill Country Framing, 2=Quick-Sparks Electric, 3=Texas Plumb Pros,
  // 4=Comfort HVAC, 5=Boerne Lumber Co.
  const phaseSubAssignments: number[][] = [
    [],              // Deposit — no subs (mobilization)
    [0],             // Foundation → Cano Concrete
    [1, 5],          // Framing → Hill Country Framing + Boerne Lumber
    [1],             // Dried-In → Hill Country Framing
    [2, 3, 4],       // MEP → Electric, Plumb, HVAC (all three)
    [1],             // Drywall → Hill Country Framing (drywall crew)
    [5],             // Finishes → Boerne Lumber for trim
    [],              // Punch — no specific sub
    [],              // Warranty
  ];

  for (let i = 0; i < milestonePhases.length; i++) {
    const phase = milestonePhases[i];
    const status = phaseStatuses[i];
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + phaseStarts[i]);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + phaseDurations[i]);

    const amount = Math.round((1450000 * phase.percent) / 100);
    const isoStart = startDate.toISOString().slice(0, 10);
    const isoEnd = endDate.toISOString().slice(0, 10);

    const assignedSubIds = phaseSubAssignments[i].map((idx) => subs[idx].id);

    const m: Parameters<typeof saveMilestone>[0] = {
      id: newId("ms"),
      deal_ref: maddoxId,
      org_ref: orgRef,
      name: phase.label,
      description: phase.description,
      order: i,
      percentage: phase.percent,
      amount,
      status,
      planned_start_date: isoStart,
      planned_end_date: isoEnd,
      assigned_subs: assignedSubIds,
      notes: "",
      created_at: isoDaysAgo(90),
      updated_at: isoDaysAgo(2),
      ...(status === "released" && {
        started_at: isoDaysAgo(-phaseStarts[i] + 5),
        marked_complete_at: isoDaysAgo(-phaseStarts[i] - phaseDurations[i] - 1),
        approved_at: isoDaysAgo(-phaseStarts[i] - phaseDurations[i] - 1),
        released_at: isoDaysAgo(-phaseStarts[i] - phaseDurations[i]),
        released_amount: amount,
      }),
      ...(status === "approved" && {
        started_at: isoDaysAgo(-phaseStarts[i] + 3),
        marked_complete_at: isoDaysAgo(-phaseStarts[i] - phaseDurations[i] + 2),
        approved_at: isoDaysAgo(-phaseStarts[i] - phaseDurations[i]),
      }),
      ...(status === "awaiting_approval" && {
        // GC marked the phase complete a few days ago — homeowner's
        // signature is still pending. Drives the Inbox "draws pending
        // owner approval" row.
        started_at: isoDaysAgo(-phaseStarts[i] + 3),
        marked_complete_at: isoDaysAgo(2),
      }),
      ...(status === "in_progress" && {
        started_at: isoDaysAgo(-phaseStarts[i]),
      }),
    };
    await saveMilestone(m);
  }

  // ── Maddox quote lines ───────────────────────────────────────
  // Seed a realistic estimate so the Quote editor and Finances tabs
  // aren't empty on the demo's anchor project. Lines are grouped by
  // phase (product_code carries the phase name — matches the schema's
  // repurposed field). Numbers add up close to the $1,450,000 award
  // total above; small drift is fine, the Finances tab shows totals
  // recomputed live.
  type SeedLine = {
    phase: string;
    description: string;
    qty: number;
    cost: number;
    markup: number;
  };
  const maddoxLines: SeedLine[] = [
    { phase: "Foundation", description: "Site work + excavation",                 qty: 1, cost: 18500,  markup: 15 },
    { phase: "Foundation", description: "Footings + slab pour",                   qty: 1, cost: 64200,  markup: 15 },
    { phase: "Foundation", description: "Foundation drainage + waterproofing",    qty: 1, cost: 12400,  markup: 15 },
    { phase: "Framing",    description: "Framing labor + materials",              qty: 1, cost: 215000, markup: 14 },
    { phase: "Framing",    description: "Sheathing + roof structure",             qty: 1, cost: 48000,  markup: 14 },
    { phase: "Framing",    description: "Engineered I-joists + LVL beams",        qty: 1, cost: 32400,  markup: 14 },
    { phase: "Dried-In",   description: "Roofing (architectural shingles, 32 sq)", qty: 1, cost: 28600, markup: 16 },
    { phase: "Dried-In",   description: "Windows + exterior doors",               qty: 1, cost: 68500,  markup: 14 },
    { phase: "MEP",        description: "Plumbing rough-in (sub: Texas Plumb Pros)", qty: 1, cost: 42800, markup: 15 },
    { phase: "MEP",        description: "Electrical rough-in (sub: Quick-Sparks)",   qty: 1, cost: 38900, markup: 15 },
    { phase: "MEP",        description: "HVAC system (sub: Comfort HVAC)",        qty: 1, cost: 51200,  markup: 15 },
    { phase: "Drywall",    description: "Insulation + drywall",                   qty: 1, cost: 47500,  markup: 14 },
    { phase: "Finishes",   description: "Trim + millwork package",                qty: 1, cost: 86300,  markup: 16 },
    { phase: "Finishes",   description: "Paint (interior + exterior)",            qty: 1, cost: 28400,  markup: 16 },
    { phase: "Finishes",   description: "Flooring (engineered hardwood + tile)",  qty: 1, cost: 71200,  markup: 17 },
    { phase: "Finishes",   description: "Cabinetry + countertops",                qty: 1, cost: 124000, markup: 18 },
    { phase: "Finishes",   description: "Plumbing fixtures + appliances",         qty: 1, cost: 58400,  markup: 15 },
    { phase: "Finishes",   description: "Lighting + electrical trim-out",         qty: 1, cost: 24800,  markup: 15 },
    { phase: "Finishes",   description: "Exterior: siding, soffit, gutters",      qty: 1, cost: 52600,  markup: 14 },
    { phase: "Punch List", description: "Final inspections + CO + punch labor",   qty: 1, cost: 18900,  markup: 12 },
  ];
  const round = (n: number, dp: number) =>
    Math.round(n * 10 ** dp) / 10 ** dp;
  const maddoxQuoteLines: QuoteLine[] = maddoxLines.map((l, i) => {
    const cost_unit_price = l.cost;
    const cost_extended = cost_unit_price * l.qty;
    const customer_unit_price = round(cost_unit_price * (1 + l.markup / 100), 2);
    const customer_extended = round(customer_unit_price * l.qty, 2);
    const margin = customer_extended > 0
      ? round(((customer_extended - cost_extended) / customer_extended) * 100, 2)
      : 0;
    return {
      id: newId("line"),
      line_number: i + 1,
      product_code: l.phase,
      description: l.description,
      manufacturer: "",
      is_service: false,
      qty: l.qty,
      list_price: cost_unit_price,
      discount_percent: 0,
      customer_unit_price,
      customer_extended,
      markup_percent: l.markup,
      cost_unit_price,
      cost_extended,
      margin_percent: margin,
      subscription_term_months: 0,
      notes: "",
    };
  });
  await saveQuoteLines(maddoxId, orgRef, maddoxQuoteLines);

  // ── Maddox payments ──────────────────────────────────────────
  // A handful of money-in (client draws) and money-out (sub payments)
  // entries so the Finances tab has real numbers in its roll-up tiles.
  const maddoxPayments: Payment[] = [
    {
      id: newId("pay"),
      deal_ref: maddoxId,
      direction: "in",
      party_name: "Maddox Family",
      amount: 72500,
      method: "ach",
      date: isoDaysAgo(118).slice(0, 10),
      notes: "Deposit / mobilization draw (5% of contract)",
      created_at: isoDaysAgo(118),
    },
    {
      id: newId("pay"),
      deal_ref: maddoxId,
      direction: "in",
      party_name: "Maddox Family",
      amount: 145000,
      method: "ach",
      date: isoDaysAgo(72).slice(0, 10),
      notes: "Foundation draw (10%)",
      created_at: isoDaysAgo(72),
    },
    {
      id: newId("pay"),
      deal_ref: maddoxId,
      direction: "in",
      party_name: "Maddox Family",
      amount: 290000,
      method: "ach",
      date: isoDaysAgo(28).slice(0, 10),
      notes: "Framing draw (20%)",
      created_at: isoDaysAgo(28),
    },
    {
      id: newId("pay"),
      deal_ref: maddoxId,
      direction: "out",
      party_ref: subs[0].id, // Cano Concrete
      party_name: subs[0].name,
      amount: 95100,
      method: "check",
      check_number: "1247",
      date: isoDaysAgo(70).slice(0, 10),
      notes: "Foundation work — paid in full",
      created_at: isoDaysAgo(70),
    },
    {
      id: newId("pay"),
      deal_ref: maddoxId,
      direction: "out",
      party_ref: subs[1].id, // Hill Country Framing
      party_name: subs[1].name,
      amount: 175000,
      method: "check",
      check_number: "1253",
      date: isoDaysAgo(24).slice(0, 10),
      notes: "Framing — progress payment (70%)",
      created_at: isoDaysAgo(24),
    },
    {
      id: newId("pay"),
      deal_ref: maddoxId,
      direction: "out",
      party_ref: subs[5].id, // Boerne Lumber Co.
      party_name: subs[5].name,
      amount: 48200,
      method: "ach",
      date: isoDaysAgo(20).slice(0, 10),
      notes: "Framing material package",
      created_at: isoDaysAgo(20),
    },
  ];
  for (const p of maddoxPayments) await savePayment(p);

  // ── Maddox RFQ (one open for flooring) ──────────────────────
  // Two bids in, one outstanding — gives the demo a live RFQ table
  // with the "comparing" state so Barry sees the sub-bid workflow.
  const flooringRfq: ProjectRFQ = {
    id: newId("rfq"),
    deal_ref: maddoxId,
    org_ref: orgRef,
    scope_title: "Flooring — engineered hardwood + tile",
    scope_description:
      "Whole-house engineered hardwood (3,200 sf) plus tile in bathrooms (480 sf). Material spec attached. Schedule: install starts ~6 weeks out.",
    phase: "Finishes",
    status: "comparing",
    invitees: [
      {
        sub_ref: subs[5].id,
        sub_name: subs[5].name,
        status: "responded",
        bid_amount: 68400,
        bid_notes: "Includes underlayment + trim transitions.",
        responded_at: isoDaysAgo(4),
        notified_at: isoDaysAgo(11),
      },
      {
        sub_ref: subs[1].id,
        sub_name: subs[1].name,
        status: "responded",
        bid_amount: 72100,
        bid_notes: "Tile included; can start in 4 weeks.",
        responded_at: isoDaysAgo(2),
        notified_at: isoDaysAgo(11),
      },
    ],
    notes: "Hard deadline: pick winner by next Friday to keep schedule.",
    sent_at: isoDaysAgo(11),
    created_at: isoDaysAgo(11),
    updated_at: isoDaysAgo(2),
  };
  await saveRFQ(flooringRfq);

  // ── Maddox change orders ────────────────────────────────────
  // One approved CO (gives the AIA G702 draw request something to
  // show under the "Approved Change Orders" table) plus one out
  // for signature so the Inbox has a CO row to action.
  const maddoxCOs: ProjectChangeOrder[] = [
    {
      id: newId("co"),
      deal_ref: maddoxId,
      org_ref: orgRef,
      number: "CO-001",
      title: "Add bonus room above garage",
      description:
        "Frame, insulate, drywall, and finish a 14'×24' bonus room above the garage (336 SF). Includes egress window, mini-split connection, and basic trim. Excludes furniture and a/v.",
      amount_delta: 38400,
      schedule_impact_days: 14,
      reason: "client_request",
      status: "approved",
      approved_at: isoDaysAgo(20),
      approval_signature: "Brennan Maddox",
      notes: "Brennan confirmed scope on the kitchen-table walkthrough.",
      created_at: isoDaysAgo(25),
      updated_at: isoDaysAgo(20),
    },
    {
      id: newId("co"),
      deal_ref: maddoxId,
      org_ref: orgRef,
      number: "CO-002",
      title: "Upgrade kitchen island countertop to quartzite",
      description:
        "Substitute Calacatta quartzite for the spec'd granite on the kitchen island (~32 SF). Includes template + install + sealing. Lead time +3 weeks from selection.",
      amount_delta: 4850,
      schedule_impact_days: 3,
      reason: "client_request",
      status: "sent", // pending client approval — surfaces in Inbox
      notes: "Sent for signature 2 days ago.",
      created_at: isoDaysAgo(2),
      updated_at: isoDaysAgo(2),
    },
  ];
  for (const co of maddoxCOs) await saveChangeOrder(co);

  return { parsedCacheByDeal: {} };
}

// ── re-exports ───────────────────────────────────────────────────

export { newId };
export const SERVER_TIMESTAMP = serverTimestamp;
