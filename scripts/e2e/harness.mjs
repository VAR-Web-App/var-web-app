// E2E test harness — TEMPORARY, delete after testing.
// Loads .env.local, inits firebase-admin, and provides seed + cleanup helpers.
// Everything it creates is tagged e2e_test:true and prefixed so cleanup is safe.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..");

// Pull the service-account credential out of .env.local. Vercel encodes the
// whole JSON as one line with EVERY newline as a literal \n and inner quotes
// left raw — so it parses as neither JSON nor a quoted string. Rather than
// reconstruct the JSON, extract the three fields firebase-admin's cert() needs
// and turn the private key's literal \n back into real newlines.
function loadServiceAccount() {
  const raw = readFileSync(join(REPO, ".env.local"), "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_KEY="));
  if (!line) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not in .env.local");
  const val = line.slice("FIREBASE_SERVICE_ACCOUNT_KEY=".length);
  const pick = (k) => (val.match(new RegExp(`"${k}":\\s*"([^"]+)"`)) || [])[1];
  const projectId = pick("project_id");
  const clientEmail = pick("client_email");
  const privateKey = (pick("private_key") || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Could not extract service-account fields from .env.local");
  }
  return { projectId, clientEmail, privateKey };
}

if (!getApps().length) {
  initializeApp({ credential: cert(loadServiceAccount()) });
}
export const db = getFirestore();
export const adminAuth = getAuth();

export const TEST_TAG = "e2e_test";
export const TEST_EMAIL = "e2e-tester@keystone-e2e.test";
export const TEST_PASSWORD = "E2eTest!" + "2026";
export const TEST_ORG = "e2e-org-keystone";

const now = () => new Date().toISOString();

// Create (or reset) the test auth user + org + profile.
export async function ensureTestUser() {
  let uid;
  try {
    const u = await adminAuth.getUserByEmail(TEST_EMAIL);
    uid = u.uid;
    await adminAuth.updateUser(uid, { password: TEST_PASSWORD });
  } catch {
    const u = await adminAuth.createUser({ email: TEST_EMAIL, password: TEST_PASSWORD, displayName: "E2E Tester" });
    uid = u.uid;
  }
  await db.collection("orgs").doc(TEST_ORG).set({
    id: TEST_ORG, name: "E2E Test Co", owner_uid: uid, e2e_test: true, created_at: now(),
  });
  await db.collection("users").doc(uid).set({
    uid, email: TEST_EMAIL, display_name: "E2E Tester", org_ref: TEST_ORG,
    role: "owner", e2e_test: true, created_at: now(),
  });
  return { uid, org_ref: TEST_ORG };
}

// Seed a deal with a schedule of milestones (for the cascade test).
export async function seedDeal(org_ref) {
  const dealRef = db.collection("deals").doc();
  const deal = {
    id: dealRef.id, org_ref, name: "E2E — Cascade Test House", stage: "In Progress",
    project_type: "Custom Home", due_date: "2026-08-01", e2e_test: true,
    created_at: now(), updated_at: now(),
  };
  await dealRef.set(deal);
  const phases = [
    ["Foundation", 0, "2026-08-01", "2026-08-10", "released", 50000, 25],
    ["Framing", 1, "2026-08-11", "2026-08-25", "pending", 80000, 40],
    ["Roofing", 2, "2026-08-26", "2026-09-05", "pending", 40000, 20],
    ["Drywall", 3, "2026-09-06", "2026-09-20", "pending", 30000, 15],
  ];
  const milestones = [];
  for (const [name, order, s, e, status, amount, percentage] of phases) {
    // App stores milestones in a top-level collection keyed by deal_ref.
    const mRef = db.collection("project_milestones").doc();
    const m = {
      id: mRef.id, deal_ref: dealRef.id, org_ref, name, description: "", order,
      percentage, amount, status, planned_start_date: s, planned_end_date: e,
      assigned_subs: [], notes: "",
      e2e_test: true, created_at: now(), updated_at: now(),
    };
    await mRef.set(m);
    milestones.push(m);
  }
  return { deal, milestones };
}

// Seed quote lines + a categorized invoice for the Cost Forecast panel.
// Framing (cat 40): est cost 80k / client 100k, actual invoiced 88k (10% over).
// Cat 50: est cost 20k / client 25k, nothing invoiced yet.
export async function seedFinance(org_ref, deal) {
  const ql = (line_number, cat_id, cost, customer) => {
    const ref = db.collection("quote_lines").doc();
    return ref.set({
      id: ref.id, deal_ref: deal.id, org_ref, line_number, cat_id,
      product_code: `SEED-${cat_id}`, description: `Seed line ${cat_id}`,
      qty: 1, cost_extended: cost, customer_extended: customer,
      e2e_test: true, created_at: now(), updated_at: now(),
    });
  };
  await ql(1, "40", 80000, 100000);
  await ql(2, "50", 20000, 25000);

  const invRef = db.collection("invoices").doc();
  await invRef.set({
    id: invRef.id, org_ref, deal_ref: deal.id, vendor_name: "E2E Framing Co",
    invoice_number: "FR-100", invoice_date: "2026-07-20", total: 88000,
    line_items: [{ id: "li1", description: "Framing labor+material", extended: 88000, cat_id: "40" }],
    status: "matched", source: "upload",
    e2e_test: true, created_at: now(), updated_at: now(),
  });

  return {
    expected: {
      estimatedCost: 100000, contract: 125000, actualToDate: 88000,
      framingVariance: 8000, framingPct: 10,
      projectedCost: 108000, projectedMargin: 13.6, estimateMargin: 20.0,
    },
  };
}

// Seed a designer link + one draft selection (for the designer portal test).
export async function seedDesignerLink(org_ref, deal) {
  const token = "e2e-token-" + org_ref;
  const link = {
    token, org_ref, deal_ref: deal.id, project_name: deal.name,
    builder_name: "E2E Test Co", e2e_test: true, created_at: now(), updated_at: now(),
  };
  await db.collection("designer_links").doc(token).set(link);
  const selRef = db.collection("project_selections").doc();
  const sel = {
    id: selRef.id, deal_ref: deal.id, org_ref, number: "SEL-001",
    category: "flooring", title: "Main floor flooring", description: "",
    allowance: 8000, options: [], status: "draft", notes: "",
    e2e_test: true, created_at: now(), updated_at: now(),
  };
  await selRef.set(sel);
  return { token, selection: sel };
}

// Delete everything we created. Two passes: (1) docs we tagged e2e_test, and
// (2) UI-created docs (invites/invoices) that can't carry the tag — matched by
// our TEST_ORG so we never touch real data.
export async function cleanup() {
  let deleted = 0;
  const delSnap = async (snap, hasMilestones = false) => {
    for (const d of snap.docs) {
      if (hasMilestones) {
        const subs = await d.ref.collection("milestones").get();
        for (const s of subs.docs) { await s.ref.delete(); deleted++; }
      }
      await d.ref.delete(); deleted++;
    }
  };
  for (const col of ["deals", "project_milestones", "project_selections", "designer_links", "client_portal_links", "project_change_orders", "orgs", "users", "invites", "invoices", "quote_lines", "distributors", "project_rfqs"]) {
    await delSnap(await db.collection(col).where("e2e_test", "==", true).get());
  }
  // UI-written docs, scoped to our test org.
  for (const col of ["invites", "invoices"]) {
    try { await delSnap(await db.collection(col).where("org_ref", "==", TEST_ORG).get()); } catch { /* no such field/index */ }
  }
  try {
    const u = await adminAuth.getUserByEmail(TEST_EMAIL);
    await adminAuth.deleteUser(u.uid); deleted++;
  } catch { /* already gone */ }
  return deleted;
}
