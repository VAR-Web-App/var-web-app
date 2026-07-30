import { chromium } from "playwright";
import { cleanup, ensureTestUser, seedDeal, TEST_EMAIL, TEST_PASSWORD } from "./harness.mjs";
const BASE = process.env.BASE_URL || "http://localhost:3000";
await cleanup();
const u = await ensureTestUser();
const { deal } = await seedDeal(u.org_ref);
const b = await chromium.launch();
const p = await (await b.newContext({ serviceWorkers: "block", viewport: { width: 1000, height: 900 } })).newPage();
const go = async (url) => { await p.goto(url, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1400); };
for (let i = 0; i < 3 && !p.url().includes("/deals"); i++) {
  await go(`${BASE}/login`);
  await p.locator('input[type="email"]').fill(TEST_EMAIL);
  await p.locator('input[type="password"]').fill(TEST_PASSWORD);
  await p.locator('button[type="submit"]').click();
  await p.waitForURL("**/deals", { timeout: 15000 }).catch(() => {});
}
await go(`${BASE}/deals/${deal.id}/quote`);
await p.getByRole("button", { name: /Add from catalog/i }).click();
await p.getByPlaceholder(/Search materials/i).fill("stud");
await p.waitForTimeout(500);
await p.locator("div.max-w-2xl").screenshot({ path: "scripts/e2e/materials.png" }).catch(async () => { await p.screenshot({ path: "scripts/e2e/materials.png" }); });
console.log("shot saved");
await b.close();
await cleanup();
console.log("cleaned");
process.exit(0);
