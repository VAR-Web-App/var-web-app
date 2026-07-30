// Scheduling Intelligence render E2E — seeds a cross-project double-booking +
// sub performance history, drives /schedule, verifies the panel.
import { chromium } from "playwright";
import { cleanup, ensureTestUser, db, TEST_EMAIL, TEST_PASSWORD } from "./harness.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
let pass = 0, fail = 0;
const out = [];
const check = (n, c, d = "") => { if (c) { pass++; out.push(`  ✅ ${n}`); } else { fail++; out.push(`  ❌ ${n} ${d}`); } };
const now = () => new Date().toISOString();

await cleanup();
const u = await ensureTestUser();
const org = u.org_ref;

// two subs
const mkSub = async (name) => {
  const r = db.collection("distributors").doc();
  await r.set({ id: r.id, name, account_number: "T", address: "", notes: "", org_ref: org, e2e_test: true });
  return r.id;
};
const subA = await mkSub("Hill Country Framing");
const subB = await mkSub("Cano Concrete");

// two deals (deal1 has a real address for the weather card)
const mkDeal = async (name, addr) => {
  const r = db.collection("deals").doc();
  await r.set({ id: r.id, org_ref: org, name, stage: "In Progress", project_type: "Custom Home",
    ship_to_address: addr, due_date: "2026-08-01", e2e_test: true, created_at: now(), updated_at: now() });
  return r.id;
};
const d1 = await mkDeal("Maddox", "1600 Amphitheatre Parkway, Mountain View, CA 94043");
const d2 = await mkDeal("Reyes", "");

const mkM = async (deal_ref, name, status, s, e, subs, extra = {}) => {
  const r = db.collection("project_milestones").doc();
  await r.set({ id: r.id, deal_ref, org_ref: org, name, description: "", order: 1, percentage: 20,
    amount: 50000, status, planned_start_date: s, planned_end_date: e, assigned_subs: subs, notes: "",
    e2e_test: true, created_at: now(), updated_at: now(), ...extra });
};
// conflict: subA on Framing in BOTH deals, same dates
await mkM(d1, "Framing", "pending", "2026-08-11", "2026-08-25", [subA]);
await mkM(d2, "Framing", "pending", "2026-08-11", "2026-08-25", [subA]);
// performance: subB — one on-time, one late
await mkM(d1, "Foundation", "approved", "2026-06-01", "2026-06-10", [subB], { approved_at: "2026-06-08T10:00:00Z" });
await mkM(d1, "Slab pour", "approved", "2026-06-15", "2026-06-20", [subB], { approved_at: "2026-06-25T10:00:00Z" });
// weather: an upcoming outdoor phase within the forecast window
const soon = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
await mkM(d1, "Roofing", "pending", soon(3), soon(5), [subA]);

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

  await go(`${BASE}/schedule`);
  // Conflicts + Performance render immediately; give weather a moment to resolve.
  await page.getByText(/double-booked/i).first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.getByText(/Checking forecasts/i).waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  const text = (await page.locator("main, body").first().innerText()).replace(/\s+/g, " ");
  out.push("  page slice: " + (text.match(/Conflicts.*?Sub performance.*?%/)?.[0] || text).slice(0, 240));

  const has = (re) => re.test(text);
  check("Conflicts card present", has(/Conflicts/));
  check("double-booking flagged", has(/Hill Country Framing double-booked/i));
  check("both projects named", has(/Maddox/) && has(/Reyes/));
  check("suggested resolution shown (shift + days)", has(/Shift .*Reyes.*\+15d|\+15d/i), "expected +15d suggestion");
  check("Weather watch card present", has(/Weather watch/));
  check("Sub performance card present", has(/Sub performance/));
  check("Cano Concrete scored", has(/Cano Concrete/));
  check("on-time 50% shown", has(/50%/), "expected 50%");
  check("no page errors", errs.length === 0, errs[0]?.slice(0, 160));
} catch (e) {
  out.push("‼️ threw: " + e.message);
  await page.screenshot({ path: "scripts/e2e/scheduling-fail.png" }).catch(() => {});
  fail++;
} finally {
  await browser.close();
  await cleanup();
}

console.log(out.join("\n"));
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
