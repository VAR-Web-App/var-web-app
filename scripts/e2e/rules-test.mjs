// Security-rules validation against the DEPLOYED rules, via the client SDK
// (stronger than the emulator — this hits real production rules). Proves the
// two critical holes are closed and legitimate access still works.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, doc, getDoc, getDocs, collection, query, where, updateDoc,
} from "firebase/firestore";
import { ensureTestUser, db as adminDb, TEST_EMAIL, TEST_PASSWORD, TEST_ORG } from "./harness.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = readFileSync(join(REPO, ".env.local"), "utf8");
const g = (k) => (env.split(/\r?\n/).find((l) => l.startsWith(k + "=")) || "").slice(k.length + 1).replace(/^['"]|['"]$/g, "");
const cfg = {
  apiKey: g("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: g("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: g("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: g("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: g("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: g("NEXT_PUBLIC_FIREBASE_APP_ID"),
};

let pass = 0, fail = 0;
const now = () => new Date().toISOString();
const denied = (e) => e?.code === "permission-denied" || /permission|insufficient/i.test(String(e?.message));
const check = (n, ok, d = "") => { if (ok) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${d}`); } };

// Seed a token doc so the get-by-token positive test has something to fetch.
const u = await ensureTestUser();
const token = "e2e-rules-token-" + TEST_ORG;
await adminDb.collection("designer_links").doc(token).set({
  token, org_ref: TEST_ORG, deal_ref: "d1", project_name: "Rules Test", builder_name: "E2E", e2e_test: true, created_at: now(), updated_at: now(),
});
await adminDb.collection("client_sign_links").doc("e2e-sign-" + TEST_ORG).set({
  token: "e2e-sign-" + TEST_ORG, org_ref: TEST_ORG, deal_ref: "d1", client_name: "C", e2e_test: true, created_at: now(),
});

const app = initializeApp(cfg, "rules-test");
const auth = getAuth(app);
const cdb = getFirestore(app);
await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
const uid = auth.currentUser.uid;

console.log("— #2 public LIST enumeration must be BLOCKED —");
for (const col of ["client_sign_links", "sub_schedule_links", "designer_links"]) {
  try {
    // designer_links list is allowed ONLY when scoped to own org; an unscoped
    // list (what an attacker would run to enumerate) must be denied.
    await getDocs(collection(cdb, col));
    check(`unscoped list of ${col} denied`, false, "LIST SUCCEEDED — hole open!");
  } catch (e) { check(`unscoped list of ${col} denied`, denied(e), e?.code); }
}

console.log("\n— get-by-token still WORKS (didn't break token flows) —");
try {
  const snap = await getDoc(doc(cdb, "designer_links", token));
  check("get designer_link by token allowed", snap.exists());
} catch (e) { check("get designer_link by token allowed", false, e?.code); }

console.log("\n— designer own-org scoped list WORKS; cross-org DENIED —");
try {
  await getDocs(query(collection(cdb, "designer_links"), where("org_ref", "==", TEST_ORG)));
  check("own-org designer_links list allowed", true);
} catch (e) { check("own-org designer_links list allowed", false, e?.code); }
try {
  await getDocs(query(collection(cdb, "designer_links"), where("org_ref", "==", "some-other-org")));
  check("cross-org designer_links list denied", false, "SUCCEEDED — leak!");
} catch (e) { check("cross-org designer_links list denied", denied(e), e?.code); }

console.log("\n— #1 org_ref self-assignment must be BLOCKED —");
try {
  await updateDoc(doc(cdb, "users", uid), { org_ref: "victim-org-" + Math.floor(uid.length) });
  check("self-assign org_ref denied", false, "SUCCEEDED — takeover hole open!");
} catch (e) { check("self-assign org_ref denied", denied(e), e?.code); }

console.log("\n— legitimate profile update (org_ref unchanged) still WORKS —");
try {
  await updateDoc(doc(cdb, "users", uid), { display_name: "E2E Tester", updated_at: now() });
  check("profile update (org_ref unchanged) allowed", true);
} catch (e) { check("profile update (org_ref unchanged) allowed", false, e?.code); }

await deleteApp(app);
await adminDb.collection("designer_links").doc(token).delete().catch(() => {});
await adminDb.collection("client_sign_links").doc("e2e-sign-" + TEST_ORG).delete().catch(() => {});
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
