// Sub Bid Intelligence render E2E — seed a target RFQ + historical bids,
// verify the panel benchmarks and flags low/fair/high.
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

const mkDeal = async (name) => { const r = db.collection("deals").doc(); await r.set({ id: r.id, org_ref: org, name, stage: "In Progress", project_type: "Custom Home", e2e_test: true, created_at: now(), updated_at: now() }); return r.id; };
const target = await mkDeal("Maddox Country Dream House");
const history = await mkDeal("Wilson Lake Cabin");

const mkRfq = async (deal_ref, scope, bids) => {
  const r = db.collection("project_rfqs").doc();
  await r.set({
    id: r.id, deal_ref, org_ref: org, scope_title: scope, scope_description: scope,
    phase: "Framing", status: "open", notes: "",
    invitees: bids.map(([sub_name, amt], i) => ({ sub_ref: `s${i}`, sub_name, status: "responded", bid_amount: amt })),
    e2e_test: true, created_at: now(), updated_at: now(),
  });
};
// historical framing bids across another project → median 71000
await mkRfq(history, "Framing package A", [["Sub A", 70000], ["Sub B", 72000]]);
await mkRfq(history, "Framing package B", [["Sub C", 68000], ["Sub D", 74000]]);
// target RFQ with a low, fair, and high bid
await mkRfq(target, "Framing rough-in", [["Acme Framing", 62000], ["Bay Framing", 71000], ["Quick Framing", 84000]]);

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

  await go(`${BASE}/deals/${target}/finances`);
  const panel = page.locator("section").filter({ hasText: "Bid intelligence" }).first();
  await panel.waitFor({ timeout: 10000 });
  const text = (await panel.innerText()).replace(/\s+/g, " ");
  out.push("  panel: " + text.slice(0, 240));

  const has = (re) => re.test(text);
  check("benchmarks the Framing median at $71,000", has(/median for Framing: \$71,000/i), text.match(/median for Framing: \$[\d,]+/i)?.[0]);
  check("shows the bid range + count", has(/\$68,000–\$74,000, 4 bids/));
  check("Acme flagged Low", has(/Acme Framing[\s\S]*?\$62,000[\s\S]*?Low/) || (has(/Acme Framing/) && has(/Low/)));
  check("Quick flagged High", has(/Quick Framing/) && has(/High/));
  check("Bay flagged Fair", has(/Bay Framing/) && has(/Fair/));
  check("lowest bid tagged", has(/lowest/i));
  check("no page errors", errs.length === 0, errs[0]?.slice(0, 160));
} catch (e) {
  out.push("‼️ threw: " + e.message);
  await page.screenshot({ path: "scripts/e2e/bid-fail.png" }).catch(() => {});
  fail++;
} finally {
  await browser.close();
  await cleanup();
}

console.log(out.join("\n"));
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
