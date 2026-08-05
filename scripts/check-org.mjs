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
if (!getApps().length) initializeApp({ credential: cert(load()) });
const db = getFirestore();
const auth = getAuth();
const email = process.argv[2] || "collinjmaddox@gmail.com";
const u = await auth.getUserByEmail(email);
console.log(`auth uid: ${u.uid}`);
const prof = await db.collection("users").doc(u.uid).get();
console.log(`users/${u.uid}.org_ref = ${prof.data()?.org_ref ?? "(no users doc)"}`);
// Count email_messages by source for the profile org_ref
const orgRef = prof.data()?.org_ref ?? u.uid;
const snap = await db.collection("email_messages").where("org_ref", "==", orgRef).get();
const bySource = {};
for (const d of snap.docs) { const s = d.data().source || "?"; bySource[s] = (bySource[s] || 0) + 1; }
console.log(`email_messages for org_ref ${orgRef}: ${snap.size}`, bySource);
process.exit(0);
