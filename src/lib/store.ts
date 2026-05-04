// LocalStorage-backed CRUD with realistic seed data.
//
// Single-tenant for now (all records use org_ref="demo"). When auth +
// Firestore land later, swap the impls of read/write/list to hit Firestore
// while keeping the type signatures the same — pages won't need changes.
//
// Seed data exists so the demo looks like a working VAR's pipeline on
// first load. Realistic enough to be plausible, fake enough that no real
// company is referenced.

"use client";

import {
  Deal,
  Account,
  Contact,
  Distributor,
  OrgSettings,
  Attachment,
  newId,
} from "@/types";

// ── seed data ────────────────────────────────────────────────────

const ORG = "demo";

function isoDaysAgo(d: number): string {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString();
}

const SEED_ACCOUNTS: Account[] = [
  {
    id: "acc_dsa",
    name: "Department of Sample Administration",
    type: "federal",
    contract_vehicles: ["GSA Schedule 70", "MAS IT"],
    ship_to_addresses: [
      "1500 Sample Plaza Drive, Suite 200\nSpringfield, VA 22150",
    ],
    payment_terms: "Net 30",
    notes: "",
    org_ref: ORG,
  },
  {
    id: "acc_va",
    name: "Veterans Affairs Field Office",
    type: "federal",
    contract_vehicles: ["VA T4NG", "MAS IT"],
    ship_to_addresses: [
      "810 Vermont Ave NW\nWashington, DC 20420",
    ],
    payment_terms: "Net 30",
    notes: "",
    org_ref: ORG,
  },
  {
    id: "acc_ftc",
    name: "Federal Trade Commission",
    type: "federal",
    contract_vehicles: ["GSA MAS IT"],
    ship_to_addresses: [
      "600 Pennsylvania Ave NW\nWashington, DC 20580",
    ],
    payment_terms: "Net 45",
    notes: "",
    org_ref: ORG,
  },
];

const SEED_DISTRIBUTORS: Distributor[] = [
  {
    id: "dist_scansource",
    name: "ScanSource Federal",
    account_number: "SS-12345",
    address: "6 Logue Court\nGreenville, SC 29615",
    order_poc_name: "Federal Orders Desk",
    notes: "Primary networking/IT distributor",
    org_ref: ORG,
  },
  {
    id: "dist_techdata",
    name: "Tech Data / TD SYNNEX Federal",
    account_number: "TD-67890",
    address: "5350 Tech Data Drive\nClearwater, FL 33760",
    order_poc_name: "Federal Sales Team",
    notes: "Backup distributor for Dell, HP",
    org_ref: ORG,
  },
];

const SEED_CONTACTS: Contact[] = [
  {
    id: "ct_dsa_jordan",
    name: "Jordan Sample",
    email: "jsample@dsa.gov",
    phone: "(703) 555-0142",
    title: "IT Operations Manager",
    linked_type: "account",
    linked_ref: "acc_dsa",
    linked_name: "Department of Sample Administration",
    is_primary: true,
    org_ref: ORG,
  },
  {
    id: "ct_dsa_robin",
    name: "Robin Example",
    email: "rexample@dsa.gov",
    phone: "(703) 555-0144",
    title: "Contracting Officer",
    linked_type: "account",
    linked_ref: "acc_dsa",
    linked_name: "Department of Sample Administration",
    is_primary: false,
    org_ref: ORG,
  },
  {
    id: "ct_va_cori",
    name: "Cori Whittaker",
    email: "cori.whittaker@va.gov",
    phone: "(202) 555-7711",
    title: "Network Operations Lead",
    linked_type: "account",
    linked_ref: "acc_va",
    linked_name: "Veterans Affairs Field Office",
    is_primary: true,
    org_ref: ORG,
  },
];

const SEED_DEALS: Deal[] = [
  {
    id: "deal_dsa_switch_refresh",
    name: "DSA — Switch Refresh (Q2)",
    stage: "awarded",
    deal_type: "quotation",
    manufacturer: "Cisco",
    account_ref: "acc_dsa",
    account_name: "Department of Sample Administration",
    poc_ref: "ct_dsa_jordan",
    poc_name: "Jordan Sample",
    distributor_ref: "dist_scansource",
    distributor_name: "ScanSource Federal",
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
    org_ref: ORG,
    created_at: isoDaysAgo(28),
    updated_at: isoDaysAgo(2),
  },
  {
    id: "deal_va_wifi_expansion",
    name: "VA Field — Wi-Fi 6 expansion (3 sites)",
    stage: "quoted",
    deal_type: "quotation",
    manufacturer: "Cisco",
    account_ref: "acc_va",
    account_name: "Veterans Affairs Field Office",
    poc_ref: "ct_va_cori",
    poc_name: "Cori Whittaker",
    distributor_ref: "dist_scansource",
    distributor_name: "ScanSource Federal",
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
    org_ref: ORG,
    created_at: isoDaysAgo(14),
    updated_at: isoDaysAgo(3),
  },
  {
    id: "deal_ftc_router_replace",
    name: "FTC HQ — Edge router replacement",
    stage: "vendor_sourcing",
    deal_type: "quotation",
    manufacturer: "Cisco",
    account_ref: "acc_ftc",
    account_name: "Federal Trade Commission",
    distributor_ref: "dist_scansource",
    distributor_name: "ScanSource Federal",
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
    org_ref: ORG,
    created_at: isoDaysAgo(5),
    updated_at: isoDaysAgo(1),
  },
  {
    id: "deal_dsa_video_endpoints",
    name: "DSA — Video endpoint refresh",
    stage: "rfq",
    deal_type: "budgetary",
    manufacturer: "Cisco",
    account_ref: "acc_dsa",
    account_name: "Department of Sample Administration",
    poc_ref: "ct_dsa_jordan",
    poc_name: "Jordan Sample",
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
    org_ref: ORG,
    created_at: isoDaysAgo(2),
    updated_at: isoDaysAgo(2),
  },
  {
    id: "deal_va_tacacs",
    name: "VA Field — TACACS+ migration",
    stage: "po_sent",
    deal_type: "quotation",
    manufacturer: "Cisco",
    account_ref: "acc_va",
    account_name: "Veterans Affairs Field Office",
    poc_ref: "ct_va_cori",
    poc_name: "Cori Whittaker",
    distributor_ref: "dist_scansource",
    distributor_name: "ScanSource Federal",
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
    org_ref: ORG,
    created_at: isoDaysAgo(60),
    updated_at: isoDaysAgo(7),
  },
  {
    id: "deal_dsa_phone_refresh",
    name: "DSA — Desk phone refresh (regional)",
    stage: "partially_shipped",
    deal_type: "quotation",
    manufacturer: "Cisco",
    account_ref: "acc_dsa",
    account_name: "Department of Sample Administration",
    poc_ref: "ct_dsa_jordan",
    poc_name: "Jordan Sample",
    distributor_ref: "dist_scansource",
    distributor_name: "ScanSource Federal",
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
    org_ref: ORG,
    created_at: isoDaysAgo(95),
    updated_at: isoDaysAgo(4),
  },
  {
    id: "deal_legacy_closed",
    name: "DSA — UPS / power refresh",
    stage: "closed_won",
    deal_type: "quotation",
    manufacturer: "APC",
    account_ref: "acc_dsa",
    account_name: "Department of Sample Administration",
    distributor_ref: "dist_techdata",
    distributor_name: "Tech Data / TD SYNNEX Federal",
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
    org_ref: ORG,
    created_at: isoDaysAgo(150),
    updated_at: isoDaysAgo(90),
  },
  {
    id: "deal_lost_smartnet",
    name: "FTC — Smartnet renewal RFQ",
    stage: "closed_lost",
    deal_type: "quotation",
    manufacturer: "Cisco",
    account_ref: "acc_ftc",
    account_name: "Federal Trade Commission",
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
    org_ref: ORG,
    created_at: isoDaysAgo(45),
    updated_at: isoDaysAgo(10),
  },
];

const SEED_SETTINGS: OrgSettings = {
  org_ref: ORG,
  company_name: "Acme Federal Solutions",
  company_address: "1500 Sample Plaza Drive, Suite 200\nSpringfield, VA 22150",
  company_phone: "(703) 555-0100",
  company_email: "contracts@acmefed.example",
  cage_code: "9XYZ1",
  duns: "012345678",
  sam_id: "ACMEFED9XYZ1",
  default_blanket_discount_percent: 50,
  default_markup_percent: 10,
  default_manufacturer: "Cisco",
  prepared_by_name: "Sales Engineering",
  prepared_by_phone: "(703) 555-0100",
};

// ── localStorage layer ───────────────────────────────────────────

const PREFIX = "varweb:demo:";

function read<T>(key: string, seed: T): T {
  if (typeof window === "undefined") return seed; // SSR
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw) as T;
  } catch {
    return seed;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage full / disabled — ignore
  }
}

// ── public API ───────────────────────────────────────────────────

export function listDeals(): Deal[] {
  return read("deals", SEED_DEALS);
}
export function getDeal(id: string): Deal | undefined {
  return listDeals().find((d) => d.id === id);
}
export function saveDeal(deal: Deal): void {
  const all = listDeals();
  const idx = all.findIndex((d) => d.id === deal.id);
  if (idx >= 0) all[idx] = deal;
  else all.push(deal);
  write("deals", all);
}
export function deleteDeal(id: string): void {
  write("deals", listDeals().filter((d) => d.id !== id));
}

export function listAccounts(): Account[] { return read("accounts", SEED_ACCOUNTS); }
export function getAccount(id: string): Account | undefined { return listAccounts().find((a) => a.id === id); }
export function saveAccount(a: Account): void {
  const all = listAccounts();
  const idx = all.findIndex((x) => x.id === a.id);
  if (idx >= 0) all[idx] = a; else all.push(a);
  write("accounts", all);
}
export function deleteAccount(id: string): void { write("accounts", listAccounts().filter((a) => a.id !== id)); }

export function listContacts(): Contact[] { return read("contacts", SEED_CONTACTS); }
export function saveContact(c: Contact): void {
  const all = listContacts();
  const idx = all.findIndex((x) => x.id === c.id);
  if (idx >= 0) all[idx] = c; else all.push(c);
  write("contacts", all);
}
export function deleteContact(id: string): void { write("contacts", listContacts().filter((c) => c.id !== id)); }

export function listDistributors(): Distributor[] { return read("distributors", SEED_DISTRIBUTORS); }
export function saveDistributor(d: Distributor): void {
  const all = listDistributors();
  const idx = all.findIndex((x) => x.id === d.id);
  if (idx >= 0) all[idx] = d; else all.push(d);
  write("distributors", all);
}
export function deleteDistributor(id: string): void { write("distributors", listDistributors().filter((d) => d.id !== id)); }

export function getSettings(): OrgSettings { return read("settings", SEED_SETTINGS); }
export function saveSettings(s: OrgSettings): void { write("settings", s); }

export function listAttachments(dealRef: string): Attachment[] {
  const all = read<Attachment[]>("attachments", []);
  return all.filter((a) => a.deal_ref === dealRef);
}
export function saveAttachment(a: Attachment): void {
  const all = read<Attachment[]>("attachments", []);
  all.push(a);
  write("attachments", all);
}
export function deleteAttachment(id: string): void {
  const all = read<Attachment[]>("attachments", []);
  write("attachments", all.filter((a) => a.id !== id));
}

export { newId, ORG };
