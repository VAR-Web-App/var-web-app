// Email Digester E2E — real Claude call. Seeds a project, pastes a matching
// email, verifies routing + action items + draft reply.
import { chromium } from "playwright";
import { cleanup, ensureTestUser, db, TEST_EMAIL, TEST_PASSWORD } from "./harness.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
let pass = 0, fail = 0;
const out = [];
const check = (n, c, d = "") => { if (c) { pass++; out.push(`  ✅ ${n}`); } else { fail++; out.push(`  ❌ ${n} ${d}`); } };
const now = () => new Date().toISOString();

await cleanup();
const u = await ensureTestUser();
const dealRef = db.collection("deals").doc();
await dealRef.set({
  id: dealRef.id, org_ref: u.org_ref, name: "Maddox Country Dream House",
  account_name: "Brennan Maddox", stage: "In Progress", project_type: "Custom Home",
  e2e_test: true, created_at: now(), updated_at: now(),
});
// a decoy project so matching is non-trivial
const decoy = db.collection("deals").doc();
await decoy.set({ id: decoy.id, org_ref: u.org_ref, name: "Wilson Lake Cabin", account_name: "Tom Wilson", stage: "Lead", e2e_test: true, created_at: now(), updated_at: now() });

const EMAIL = `From: Brennan Maddox <brennan@example.com>
Subject: Country Dream House - a couple things

Hi — following up on the Country Dream House build. Two things:
1) Can we move the kitchen island 6 inches toward the sink? My wife wants more walkway room.
2) We need to lock the master bath tile selection by Friday.
Also, when does framing start? Trying to plan a site visit.
Thanks, Brennan`;

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

  await go(`${BASE}/inbox`);
  await page.getByRole("button", { name: /Digest a forwarded email/i }).click();
  const ta = page.getByPlaceholder(/Paste the full email/i);
  await ta.waitFor({ timeout: 5000 });
  await ta.fill(EMAIL);
  await page.getByRole("button", { name: /Digest email/i }).click();

  // Wait for the LLM result (the "Project:" routing label appears).
  await page.getByText(/^Project:$/).waitFor({ timeout: 30000 });
  const section = page.locator("section").filter({ hasText: "Digest a forwarded email" }).first();
  const text = (await section.innerText()).replace(/\s+/g, " ");
  out.push("  digest: " + text.slice(text.indexOf("Project:"), text.indexOf("Project:") + 220));

  check("routed to the Maddox project", /Maddox/i.test(text) && !/Wilson/i.test(text.slice(text.indexOf("Project:"), text.indexOf("Project:") + 60)), "expected Maddox match");
  check("shows a confidence badge", /\b(high|medium|low)\b/i.test(text));
  check("action items surfaced", /Action items/i.test(text));
  // Draft reply textarea should be populated (input value, not text).
  const replyLen = await page.locator("textarea").evaluateAll((els) => Math.max(0, ...els.map((e) => (e.value || "").length)));
  check("draft reply generated", replyLen > 30, `reply length ${replyLen}`);
  check("no page errors", errs.length === 0, errs[0]?.slice(0, 160));
} catch (e) {
  out.push("‼️ threw: " + e.message);
  await page.screenshot({ path: "scripts/e2e/email-fail.png" }).catch(() => {});
  fail++;
} finally {
  await browser.close();
  await cleanup();
}

console.log(out.join("\n"));
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
