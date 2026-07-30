// Cost Forecast panel E2E — TEMPORARY. Seeds quote lines + a categorized
// invoice, drives the finances page, and verifies the computed numbers.
import { chromium } from "playwright";
import {
  cleanup, ensureTestUser, seedDeal, seedFinance,
  TEST_EMAIL, TEST_PASSWORD,
} from "./harness.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3001";
let pass = 0, fail = 0;
const out = [];
const check = (name, cond, detail = "") => {
  if (cond) { pass++; out.push(`  ✅ ${name}`); }
  else { fail++; out.push(`  ❌ ${name} ${detail}`); }
};

await cleanup();
const u = await ensureTestUser();
const { deal } = await seedDeal(u.org_ref);
const { expected } = await seedFinance(u.org_ref, deal);

const browser = await chromium.launch();
const page = await (await browser.newContext({ serviceWorkers: "block" })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.stack || String(e)));

const go = async (url) => { await page.goto(url, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1400); };

try {
  // login
  for (let i = 0; i < 3 && !page.url().includes("/deals"); i++) {
    await go(`${BASE}/login`);
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/deals", { timeout: 15000 }).catch(() => {});
  }
  check("logged in", page.url().includes("/deals"), page.url());

  await go(`${BASE}/deals/${deal.id}/finances`);
  const panel = page.locator("section").filter({ hasText: "Cost Forecast" }).first();
  await panel.waitFor({ timeout: 8000 });
  // Wait for the async loads to resolve (panel leaves the "Loading…" state).
  await panel.getByText(/Est\. cost/).waitFor({ timeout: 8000 }).catch(() => {});
  const text = (await panel.innerText()).replace(/\s+/g, " ");
  out.push("  panel: " + text.slice(0, 260));

  const has = (re) => re.test(text);
  check("Est. cost $100,000", has(/Est\. cost \$100,000/i), text.match(/Est\. cost \$[\d,]+/i)?.[0]);
  check("Actual to date $88,000", has(/Actual to date \$88,000/i), text.match(/Actual to date \$[\d,]+/i)?.[0]);
  check("Projected cost $108,000", has(/Projected cost \$108,000/i), text.match(/Projected cost \$[\d,]+/i)?.[0]);
  check("Margin at completion 13.6%", has(/13\.6%/), "expected 13.6%");
  check("estimate margin 20.0% shown", has(/20\.0%/), "expected est 20.0%");
  check("FRAMING row present", has(/FRAMING/i));
  check("framing variance +$8,000 (+10%)", has(/\+\$8,000.*\+10%|\+\$8,000 \(\+10%\)/), "expected +$8,000 (+10%)");
  check("over-budget shown red/+", has(/\+\$8,000/));
  check("no page errors", errs.length === 0, errs[0]?.slice(0, 160));
} catch (e) {
  out.push("‼️ threw: " + e.message);
  await page.screenshot({ path: "scripts/e2e/forecast-fail.png" }).catch(() => {});
  fail++;
} finally {
  await browser.close();
}

console.log(out.join("\n"));
console.log(`\nexpected: ${JSON.stringify(expected)}`);
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
