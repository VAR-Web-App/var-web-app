// Replays the captured Telnyx webhook (_debug_telnyx/last) against several
// candidate signature schemes to find which one verifies — or prove the
// public key itself is mismatched.
//   node scripts/debug-telnyx-sig.mjs <publicKeyB64>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicKey, verify as edVerify } from "node:crypto";
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

const pubB64 = process.argv[2] || "CzU0p0rmOUf+TUAByet3IBioZc7VjHetj5wNZ6dJJgU=";
const snap = await db.collection("_debug_telnyx").doc("last").get();
if (!snap.exists) { console.log("no _debug_telnyx/last captured yet"); process.exit(0); }
const { rawBody, sig, ts, at, verified } = snap.data();
console.log(`captured at ${at}  ts=${ts}  sigLen=${sig.length}  bodyLen=${rawBody.length}  route.verified=${verified}`);

function keyFromRaw(b64) {
  const raw = Buffer.from(b64, "base64");
  if (raw.length !== 32) return null;
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}
const key = keyFromRaw(pubB64);
console.log(`pubKey raw bytes = ${Buffer.from(pubB64, "base64").length} (need 32)`);

function tryVerify(label, payload, sigBuf) {
  try {
    const ok = key && edVerify(null, Buffer.from(payload), key, sigBuf);
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    return ok;
  } catch (e) {
    console.log(`  ! ${label}: ${e.message}`);
    return false;
  }
}

const sigB64 = Buffer.from(sig, "base64");
const sigB64url = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
console.log(`\nscheme trials (sig as base64 = ${sigB64.length} bytes):`);
tryVerify("ts|body   (our scheme)", `${ts}|${rawBody}`, sigB64);
tryVerify("body only", rawBody, sigB64);
tryVerify("ts body   (space)", `${ts} ${rawBody}`, sigB64);
tryVerify("ts|body   (sig base64url)", `${ts}|${rawBody}`, sigB64url);
tryVerify("body|ts", `${rawBody}|${ts}`, sigB64);
process.exit(0);
