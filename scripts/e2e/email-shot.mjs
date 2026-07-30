import { chromium } from "playwright";
import { cleanup, ensureTestUser, db, TEST_EMAIL, TEST_PASSWORD } from "./harness.mjs";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const now = () => new Date().toISOString();
await cleanup();
const u = await ensureTestUser();
const d = db.collection("deals").doc();
await d.set({ id: d.id, org_ref: u.org_ref, name: "Maddox Country Dream House", account_name: "Brennan Maddox", stage: "In Progress", project_type: "Custom Home", e2e_test: true, created_at: now(), updated_at: now() });
const EMAIL = `From: Brennan Maddox
Subject: Country Dream House - a couple things

Hi — following up on the Country Dream House. Can we move the kitchen island 6 inches toward the sink? Also we need to lock the master bath tile selection by Friday. And when does framing start? Thanks, Brennan`;
const b = await chromium.launch();
const p = await (await b.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 1200 } })).newPage();
const go = async (url) => { await p.goto(url, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1400); };
for (let i = 0; i < 3 && !p.url().includes("/deals"); i++) { await go(`${BASE}/login`); await p.locator('input[type="email"]').fill(TEST_EMAIL); await p.locator('input[type="password"]').fill(TEST_PASSWORD); await p.locator('button[type="submit"]').click(); await p.waitForURL("**/deals", { timeout: 15000 }).catch(() => {}); }
await go(`${BASE}/inbox`);
await p.getByRole("button", { name: /Digest a forwarded email/i }).click();
await p.getByPlaceholder(/Paste the full email/i).fill(EMAIL);
await p.getByRole("button", { name: /Digest email/i }).click();
await p.getByText(/^Project:$/).waitFor({ timeout: 30000 });
await p.waitForTimeout(500);
await p.locator("section").filter({ hasText: "Digest a forwarded email" }).first().screenshot({ path: "scripts/e2e/email.png" });
console.log("shot saved");
await b.close();
await cleanup();
console.log("cleaned");
process.exit(0);
