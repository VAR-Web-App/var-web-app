// Materials Catalog E2E — open the quote editor, add a priced material from
// the catalog, verify the line lands in the estimate.
import { chromium } from "playwright";
import { cleanup, ensureTestUser, seedDeal, TEST_EMAIL, TEST_PASSWORD } from "./harness.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
let pass = 0, fail = 0;
const out = [];
const check = (n, c, d = "") => { if (c) { pass++; out.push(`  ✅ ${n}`); } else { fail++; out.push(`  ❌ ${n} ${d}`); } };

await cleanup();
const u = await ensureTestUser();
const { deal } = await seedDeal(u.org_ref);

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

  await go(`${BASE}/deals/${deal.id}/quote`);
  const catalogBtn = page.getByRole("button", { name: /Add from catalog/i });
  await catalogBtn.waitFor({ timeout: 8000 });
  check("'Add from catalog' button present", await catalogBtn.isVisible());
  await catalogBtn.click();

  const search = page.getByPlaceholder(/Search materials/i);
  await search.waitFor({ timeout: 5000 });
  check("catalog modal opened", await search.isVisible());
  await search.fill("insulation");
  await page.waitForTimeout(400);
  const rows = page.locator("li").filter({ has: page.getByRole("button", { name: /^Add$/ }) });
  const n = await rows.count();
  check("search returns priced results", n > 0, `got ${n} rows`);
  // Capture the first result's material name to verify it lands as a line.
  const firstName = (await rows.first().locator("div.font-medium").first().innerText()).trim();
  out.push("  picked: " + firstName);
  await rows.first().getByRole("button", { name: /^Add$/ }).click();
  await page.waitForTimeout(300);
  check("an 'Added' confirmation appears", (await page.getByRole("button", { name: /Added/ }).count()) >= 1);
  check("footer shows a line was added", await page.getByText(/1 line added/i).isVisible().catch(() => false));

  await page.getByRole("button", { name: /^Done$/ }).click();
  await page.waitForTimeout(600);
  // The line's description lives in an <input value=…>, so scan input values.
  const found = await page
    .locator("input")
    .evaluateAll((els, name) => els.some((e) => (e.value || "").includes(name)), firstName.slice(0, 24));
  check("added material appears as an estimate line", found, `value "${firstName}"`);
  check("no page errors", errs.length === 0, errs[0]?.slice(0, 160));
} catch (e) {
  out.push("‼️ threw: " + e.message);
  await page.screenshot({ path: "scripts/e2e/materials-fail.png" }).catch(() => {});
  fail++;
} finally {
  await browser.close();
  await cleanup();
}

console.log(out.join("\n"));
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
