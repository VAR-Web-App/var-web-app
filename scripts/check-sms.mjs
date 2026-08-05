// List recent inbound SMS docs for an org so we can confirm ingest.
//   node scripts/check-sms.mjs <ownerEmail>
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
  const line = raw.split(/\r?\n/).find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_KEY="));
  const val = line.slice("FIREBASE_SERVICE_ACCOUNT_KEY=".length);
  const pick = (k) => (val.match(new RegExp(`"${k}":\\s*"([^"]+)"`)) || [])[1];
  return {
    projectId: pick("project_id"),
    clientEmail: pick("client_email"),
    privateKey: (pick("private_key") || "").replace(/\\n/g, "\n"),
  };
}
if (!getApps().length) initializeApp({ credential: cert(loadServiceAccount()) });
const db = getFirestore();
const auth = getAuth();

const ownerEmail = process.argv[2] || "collinjmaddox@gmail.com";
const orgRef = (await auth.getUserByEmail(ownerEmail)).uid;

const snap = await db
  .collection("email_messages")
  .where("org_ref", "==", orgRef)
  .where("source", "==", "sms")
  .get();

console.log(`SMS messages for ${ownerEmail}: ${snap.size}`);
const rows = snap.docs
  .map((d) => d.data())
  .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
for (const m of rows) {
  console.log(
    `  ${m.received_at}  from=${m.from_phone}  deal=${m.deal_ref || "UNASSIGNED"}  media=${m.has_attachments ? "yes" : "no"}  "${(m.body_text || "").slice(0, 60)}"`,
  );
  console.log(`      ai_summary: ${m.ai_summary || "(none)"}`);
  if (m.ai_action_items?.length)
    console.log(`      ai_action_items: ${JSON.stringify(m.ai_action_items)}`);
}
process.exit(0);
