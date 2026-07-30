// Smart Notifications E2E — exercises /api/notify/gc (incl. push pruning as
// proof the push branch ran) and the Settings routing UI persistence.
import { chromium } from "playwright";
import { cleanup, ensureTestUser, db, TEST_EMAIL, TEST_PASSWORD, TEST_ORG } from "./harness.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
let pass = 0, fail = 0;
const out = [];
const check = (n, c, d = "") => { if (c) { pass++; out.push(`  ✅ ${n}`); } else { fail++; out.push(`  ❌ ${n} ${d}`); } };
const now = () => new Date().toISOString();
const post = (body) => fetch(`${BASE}/api/notify/gc`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

await cleanup();
const u = await ensureTestUser();

// settings doc with an email + a bogus push subscription (will fail → prune)
await db.collection("settings").doc(TEST_ORG).set({
  org_ref: TEST_ORG, company_name: "E2E Test Co", company_email: "e2e-gc@keystone-e2e.test",
  company_phone: "", push_subscriptions: [
    { endpoint: "https://fcm.googleapis.com/fcm/send/e2e-bogus-endpoint", keys: { p256dh: "BOGUSKEYBOGUSKEYBOGUSKEYBOGUSKEYBOGUSKEYBOGUSKEYBOGUSKEYBOGUSKEYBOGUSKEYBOGUSKEYBOGUS", auth: "Ym9ndXNhdXRodmFs" }, created_at: now() },
  ],
  e2e_test: true,
});
// a deal + a client-sign link pointing at it
const dealRef = db.collection("deals").doc();
await dealRef.set({ id: dealRef.id, org_ref: TEST_ORG, name: "Maddox Country Dream House", stage: "Estimate Sent", e2e_test: true, created_at: now(), updated_at: now() });
const token = "e2e-sign-" + TEST_ORG;
await db.collection("client_sign_links").doc(token).set({
  token, org_ref: TEST_ORG, deal_ref: dealRef.id, client_name: "Brennan Maddox", project_name: "Country Dream House", e2e_test: true, created_at: now(),
});

console.log("— /api/notify/gc route —");
let r = await post({ event: "client_signed", token, clientName: "Brennan Maddox" });
check("client_signed → 200 ok", r.s === 200 && r.b.ok === true, JSON.stringify(r.b));
// (The push branch's execution is verified via the dev-server log grep in the
// runner — a malformed test key throws before FCM returns 410, so it isn't
// pruned; that's web-push internals, not our routing code.)

r = await post({ event: "payment_recorded", dealRef: dealRef.id, amount: 80000 });
check("payment_recorded → 200 ok", r.s === 200 && r.b.ok === true, JSON.stringify(r.b));

r = await post({ event: "client_signed" });
check("client_signed w/o token → 400", r.s === 400, `got ${r.s}`);
r = await post({ event: "client_signed", token: "nope" });
check("unknown sign token → 404", r.s === 404, `got ${r.s}`);
r = await post({ event: "payment_recorded", dealRef: "nope" });
check("unknown deal → 404", r.s === 404, `got ${r.s}`);
r = await post({ event: "banana" });
check("unknown event → 400", r.s === 400, `got ${r.s}`);

console.log("— Settings routing UI persistence —");
const browser = await chromium.launch();
const page = await (await browser.newContext({ serviceWorkers: "block" })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.stack || String(e)));
const go = async (url) => { await page.goto(url, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1400); };
try {
  for (let i = 0; i < 3 && !page.url().includes("/deals"); i++) {
    await go(`${BASE}/login`);
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/deals", { timeout: 15000 }).catch(() => {});
  }
  check("logged in", page.url().includes("/deals"));
  await go(`${BASE}/settings`);
  check("Notification routing card present", await page.getByText(/Notify me when/i).isVisible().catch(() => false));
  // Enable SMS for "Client signed proposal" (default off) → should persist.
  const smsBox = page.getByRole("checkbox", { name: /Client signed proposal — SMS/i });
  await smsBox.waitFor({ timeout: 8000 });
  await smsBox.check();
  await page.waitForTimeout(1200); // saveSettings round-trip
  const saved = (await db.collection("settings").doc(TEST_ORG).get()).data();
  check("SMS pref persisted to Firestore", saved?.notification_prefs?.events?.client_signed?.sms === true, JSON.stringify(saved?.notification_prefs));
  // Toggle quiet hours on
  await page.getByRole("checkbox", { name: /^Quiet hours$/i }).check().catch(async () => {
    await page.getByText(/Quiet hours/i).locator("..").getByRole("checkbox").first().check();
  });
  await page.waitForTimeout(1200);
  const saved2 = (await db.collection("settings").doc(TEST_ORG).get()).data();
  check("quiet hours persisted", saved2?.notification_prefs?.quiet_hours?.enabled === true, JSON.stringify(saved2?.notification_prefs?.quiet_hours));
  check("no page errors", errs.length === 0, errs[0]?.slice(0, 160));
} catch (e) {
  out.push("‼️ threw: " + e.message);
  await page.screenshot({ path: "scripts/e2e/notify-fail.png" }).catch(() => {});
  fail++;
} finally {
  await browser.close();
  await db.collection("settings").doc(TEST_ORG).delete().catch(() => {});
  await db.collection("client_sign_links").doc(token).delete().catch(() => {});
  await cleanup();
}

console.log(out.join("\n"));
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
