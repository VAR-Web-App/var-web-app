// Wire a Telnyx business number to an org for SMS ingest, and (optionally)
// drop a client phone on one of its deals so an inbound text auto-matches.
//
//   node scripts/wire-sms-number.mjs <ownerEmail> <e164Number> [dealId] [clientPhone]
//
// With no dealId it just sets settings.sms_config.from_number and lists the
// org's deals so you can pick one.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

function loadServiceAccount() {
  const raw = readFileSync(join(REPO, ".env.local"), "utf8");
  const line = raw
    .split(/\r?\n/)
    .find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_KEY="));
  if (!line) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not in .env.local");
  const val = line.slice("FIREBASE_SERVICE_ACCOUNT_KEY=".length);
  const pick = (k) => (val.match(new RegExp(`"${k}":\\s*"([^"]+)"`)) || [])[1];
  const projectId = pick("project_id");
  const clientEmail = pick("client_email");
  const privateKey = (pick("private_key") || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey)
    throw new Error("Could not extract service-account fields from .env.local");
  return { projectId, clientEmail, privateKey };
}

const toE164 = (raw) => {
  const d = String(raw).replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return String(raw).trim();
};

const [ownerEmail, numberArg, dealId, clientPhone] = process.argv.slice(2);
if (!ownerEmail || !numberArg) {
  console.error(
    "usage: node scripts/wire-sms-number.mjs <ownerEmail> <e164Number> [dealId] [clientPhone]",
  );
  process.exit(1);
}
const number = toE164(numberArg);

if (!getApps().length) initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();
const auth = getAuth();

const user = await auth.getUserByEmail(ownerEmail);
const orgRef = user.uid; // single-user orgs: org_ref === uid
console.log(`Org: ${ownerEmail} → org_ref ${orgRef}`);

await db
  .collection("settings")
  .doc(orgRef)
  .set(
    { sms_config: { mode: "dedicated", from_number: number } },
    { merge: true },
  );
console.log(`✓ settings.sms_config.from_number = ${number}`);

if (dealId && clientPhone) {
  const phone = toE164(clientPhone);
  await db
    .collection("deals")
    .doc(dealId)
    .set({ ship_to_poc_phone: phone }, { merge: true });
  console.log(`✓ deal ${dealId} ship_to_poc_phone = ${phone}`);
}

const deals = await db.collection("deals").where("org_ref", "==", orgRef).get();
console.log(`\nDeals in this org (${deals.size}):`);
for (const d of deals.docs) {
  const x = d.data();
  console.log(
    `  ${d.id}  ${x.name || "(unnamed)"}  phone=${x.ship_to_poc_phone || "—"}`,
  );
}
process.exit(0);
