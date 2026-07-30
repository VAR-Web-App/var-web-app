import { chromium } from "playwright";
import { cleanup, ensureTestUser, db, TEST_EMAIL, TEST_PASSWORD } from "./harness.mjs";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const now = () => new Date().toISOString();

await cleanup();
const u = await ensureTestUser();
const org = u.org_ref;
const mkSub = async (name) => { const r = db.collection("distributors").doc(); await r.set({ id: r.id, name, account_number: "T", address: "", notes: "", org_ref: org, e2e_test: true }); return r.id; };
const A = await mkSub("Hill Country Framing"), B = await mkSub("Cano Concrete");
const mkDeal = async (name, addr) => { const r = db.collection("deals").doc(); await r.set({ id: r.id, org_ref: org, name, stage: "In Progress", project_type: "Custom Home", ship_to_address: addr, due_date: "2026-08-01", e2e_test: true, created_at: now(), updated_at: now() }); return r.id; };
const d1 = await mkDeal("Maddox", "1600 Amphitheatre Parkway, Mountain View, CA 94043"), d2 = await mkDeal("Reyes", "");
const mkM = async (dr, n, st, s, e, subs, ex = {}) => { const r = db.collection("project_milestones").doc(); await r.set({ id: r.id, deal_ref: dr, org_ref: org, name: n, description: "", order: 1, percentage: 20, amount: 50000, status: st, planned_start_date: s, planned_end_date: e, assigned_subs: subs, notes: "", e2e_test: true, created_at: now(), updated_at: now(), ...ex }); };
await mkM(d1, "Framing", "pending", "2026-08-11", "2026-08-25", [A]);
await mkM(d2, "Framing", "pending", "2026-08-11", "2026-08-25", [A]);
await mkM(d1, "Foundation", "approved", "2026-06-01", "2026-06-10", [B], { approved_at: "2026-06-08T10:00:00Z" });
await mkM(d1, "Slab pour", "approved", "2026-06-15", "2026-06-20", [B], { approved_at: "2026-06-25T10:00:00Z" });
const soon = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
await mkM(d1, "Roofing", "pending", soon(3), soon(5), [A]);

const b = await chromium.launch();
const p = await (await b.newContext({ serviceWorkers: "block", viewport: { width: 1200, height: 1000 } })).newPage();
const go = async (url) => { await p.goto(url, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1400); };
for (let i = 0; i < 3 && !p.url().includes("/deals"); i++) {
  await go(`${BASE}/login`);
  await p.locator('input[type="email"]').fill(TEST_EMAIL);
  await p.locator('input[type="password"]').fill(TEST_PASSWORD);
  await p.locator('button[type="submit"]').click();
  await p.waitForURL("**/deals", { timeout: 15000 }).catch(() => {});
}
await go(`${BASE}/schedule`);
await p.getByText(/double-booked/i).first().waitFor({ timeout: 10000 }).catch(() => {});
await p.getByText(/Checking forecasts/i).waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
const grid = p.locator("div").filter({ hasText: "Conflicts" }).locator("..").locator("div.grid").first();
await grid.screenshot({ path: "scripts/e2e/scheduling.png" }).catch(async () => {
  await p.screenshot({ path: "scripts/e2e/scheduling.png" });
});
console.log("shot saved");
await b.close();
await cleanup();
console.log("cleaned");
process.exit(0);
