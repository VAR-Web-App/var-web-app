import { chromium } from "playwright";
import { cleanup, ensureTestUser, db, TEST_EMAIL, TEST_PASSWORD, TEST_ORG } from "./harness.mjs";
const BASE = process.env.BASE_URL || "http://localhost:3000";
await cleanup();
await ensureTestUser();
await db.collection("settings").doc(TEST_ORG).set({
  org_ref: TEST_ORG, company_name: "E2E Test Co", company_email: "gc@example.com", company_phone: "",
  notification_prefs: { events: { client_signed: { sms: true } }, quiet_hours: { enabled: true, start: "22:00", end: "07:00" } },
  e2e_test: true,
});
const b = await chromium.launch();
const p = await (await b.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 1200 } })).newPage();
const go = async (url) => { await p.goto(url, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1400); };
for (let i = 0; i < 3 && !p.url().includes("/deals"); i++) {
  await go(`${BASE}/login`);
  await p.locator('input[type="email"]').fill(TEST_EMAIL);
  await p.locator('input[type="password"]').fill(TEST_PASSWORD);
  await p.locator('button[type="submit"]').click();
  await p.waitForURL("**/deals", { timeout: 15000 }).catch(() => {});
}
await go(`${BASE}/settings`);
const card = p.locator("section, div").filter({ hasText: "Notify me when" }).last();
await card.scrollIntoViewIfNeeded().catch(() => {});
await p.getByText(/Notify me when/i).waitFor({ timeout: 8000 }).catch(() => {});
await card.screenshot({ path: "scripts/e2e/notify.png" }).catch(async () => { await p.screenshot({ path: "scripts/e2e/notify.png" }); });
console.log("shot saved");
await b.close();
await db.collection("settings").doc(TEST_ORG).delete().catch(() => {});
await cleanup();
console.log("cleaned");
process.exit(0);
