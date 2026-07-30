// Seed the E2E test org with FULL sample data and wait for the long client-side
// write chain to finish (the portal link is written near the end). Prints the
// Maddox deal id + portal token for the contractor QA pass.
import { chromium } from "playwright";
import { ensureTestUser, db, TEST_EMAIL, TEST_PASSWORD, TEST_ORG } from "./harness.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
await ensureTestUser();

const browser = await chromium.launch();
const page = await (await browser.newContext({ serviceWorkers: "block" })).newPage();
const go = async (url) => { await page.goto(url, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1400); };
for (let i = 0; i < 3 && !page.url().includes("/deals"); i++) {
  await go(`${BASE}/login`);
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/deals", { timeout: 15000 }).catch(() => {});
}

const trySeed = page.getByRole("button", { name: /Try with sample data/i });
if (await trySeed.isVisible().catch(() => false)) {
  await trySeed.click();
  console.log("clicked Try with sample data");
} else {
  await page.getByRole("button", { name: /Reset to demo data/i }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  // Confirm in the modal (the last matching button).
  const confirm = page.getByRole("button", { name: /Reset to demo data/i }).last();
  await confirm.click().catch(() => {});
  console.log("clicked Reset to demo data + confirm");
}

// Poll until the portal link (near-last write) appears — seed is then complete.
// Keep the browser OPEN so the client-side seed keeps running.
let done = false;
for (let t = 0; t < 30 && !done; t++) {
  await new Promise((r) => setTimeout(r, 5000));
  const portal = (await db.collection("client_portal_links").where("org_ref", "==", TEST_ORG).get()).docs.map((d) => d.id).filter((id) => id.startsWith("demo-portal-"));
  const rfqs = (await db.collection("project_rfqs").where("org_ref", "==", TEST_ORG).get()).size;
  const deals = (await db.collection("deals").where("org_ref", "==", TEST_ORG).get()).size;
  console.log(`t=${(t + 1) * 5}s deals=${deals} rfqs=${rfqs} portal=${portal.length}`);
  if (portal.length > 0) done = true;
}
await browser.close();

const dealsSnap = await db.collection("deals").where("org_ref", "==", TEST_ORG).get();
const maddox = dealsSnap.docs.map((d) => d.data()).find((d) => /Maddox/.test(d.name));
const portalToken = (await db.collection("client_portal_links").where("org_ref", "==", TEST_ORG).get()).docs.map((d) => d.id).find((id) => id.startsWith("demo-portal-"));
console.log("\n" + JSON.stringify({
  complete: done,
  projects: dealsSnap.size,
  maddoxId: maddox?.id ?? null,
  portalToken: portalToken ?? null,
  testEmail: TEST_EMAIL,
  testPassword: TEST_PASSWORD,
}, null, 2));
process.exit(done ? 0 : 1);
