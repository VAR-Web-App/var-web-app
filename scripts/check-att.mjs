import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
function load() {
  const raw = readFileSync(join(REPO, ".env.local"), "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_KEY="));
  const val = line.slice("FIREBASE_SERVICE_ACCOUNT_KEY=".length);
  const pick = (k) => (val.match(new RegExp(`"${k}":\\s*"([^"]+)"`)) || [])[1];
  return { projectId: pick("project_id"), clientEmail: pick("client_email"), privateKey: (pick("private_key") || "").replace(/\\n/g, "\n") };
}
if (!getApps().length) initializeApp({ credential: cert(load()) });
const db = getFirestore();
const dealRef = process.argv[2] || "deal_mpp9ijnf_r1ivn2";
const snap = await db.collection("attachments").where("deal_ref", "==", dealRef).get();
console.log(`Attachments on ${dealRef}: ${snap.size}`);
for (const d of snap.docs) {
  const a = d.data();
  console.log(`  [${a.category}] ${a.name}  ${(a.size / 1024).toFixed(0)}KB  src_msg=${a.source_message_id || "—"}`);
  console.log(`      ${a.url}`);
}
process.exit(0);
