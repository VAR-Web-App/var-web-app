// One-off: set the friendly sender name on already-filed SMS messages whose
// sender matches their deal's client contact. New messages get this at ingest;
// this fixes the ones filed before that change.
//   node scripts/backfill-sms-names.mjs <ownerEmail>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
function load() {
  const raw = readFileSync(join(REPO, ".env.local"), "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_KEY="));
  const val = line.slice("FIREBASE_SERVICE_ACCOUNT_KEY=".length);
  const pick = (k) => (val.match(new RegExp(`"${k}":\\s*"([^"]+)"`)) || [])[1];
  return { projectId: pick("project_id"), clientEmail: pick("client_email"), privateKey: (pick("private_key") || "").replace(/\\n/g, "\n") };
}
const toE164 = (raw) => {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return raw ? String(raw) : "";
};
if (!getApps().length) initializeApp({ credential: cert(load()) });
const db = getFirestore();
const auth = getAuth();
const orgRef = (await auth.getUserByEmail(process.argv[2] || "collinjmaddox@gmail.com")).uid;

const snap = await db.collection("email_messages")
  .where("org_ref", "==", orgRef).where("source", "==", "sms").get();
const dealCache = new Map();
let updated = 0;
for (const doc of snap.docs) {
  const m = doc.data();
  if (m.direction === "out" || !m.deal_ref || !m.from_phone) continue;
  if (!dealCache.has(m.deal_ref)) {
    dealCache.set(m.deal_ref, (await db.collection("deals").doc(m.deal_ref).get()).data());
  }
  const dd = dealCache.get(m.deal_ref);
  if (dd?.ship_to_poc_name && toE164(dd.ship_to_poc_phone) === toE164(m.from_phone)) {
    if (m.from !== dd.ship_to_poc_name) {
      await doc.ref.update({ from: dd.ship_to_poc_name });
      updated++;
      console.log(`  ${doc.id}: from "${m.from}" -> "${dd.ship_to_poc_name}"`);
    }
  }
}
console.log(`updated ${updated} message(s)`);
process.exit(0);
