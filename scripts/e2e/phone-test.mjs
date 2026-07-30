// Phone Summarizer E2E — real Claude call. Summarize a transcript, route it,
// and verify "Save to project notes" persists to the deal.
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
  notes: "", e2e_test: true, created_at: now(), updated_at: now(),
});
await db.collection("deals").doc().set({ id: "decoy", org_ref: u.org_ref, name: "Wilson Lake Cabin", account_name: "Tom Wilson", stage: "Lead", e2e_test: true, created_at: now(), updated_at: now() });

const TRANSCRIPT = `Call with Mike (framer) re: Maddox Country Dream House.
Mike: Frame inspection passed this morning. But the roof truss delivery got pushed to Wednesday.
Barry: Does that hit the critical path?
Mike: No, we can keep sheathing the walls Monday and Tuesday. Just need the crane booked for Wednesday afternoon.
Barry: OK. Also the homeowner wants to confirm the porch beam is PSL not LVL.
Mike: Right, I'll price the PSL and send it over by tomorrow.`;

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
  await page.getByRole("button", { name: /Summarize a call/i }).click();
  const ta = page.getByPlaceholder(/Paste the call transcript/i);
  await ta.waitFor({ timeout: 5000 });
  await ta.fill(TRANSCRIPT);
  await page.getByRole("button", { name: /Summarize call/i }).click();

  await page.getByText(/^Project:$/).waitFor({ timeout: 30000 });
  const section = page.locator("section").filter({ hasText: "Summarize a call" }).first();
  const text = (await section.innerText()).replace(/\s+/g, " ");

  check("routed to the Maddox project", /Maddox/i.test(text));
  check("action items surfaced", /Action items/i.test(text));

  // Save to project notes → verify persistence.
  await page.getByRole("button", { name: /Save to project notes/i }).click();
  await page.getByRole("button", { name: /Saved to project notes/i }).waitFor({ timeout: 8000 });
  check("button confirms saved", true);
  await page.waitForTimeout(600);
  const deal = (await db.collection("deals").doc(dealRef.id).get()).data();
  check("call summary appended to deal notes", /\[Call summary/i.test(deal?.notes || ""), `notes: ${(deal?.notes || "").slice(0, 60)}`);
  check("notes mention roof/truss detail", /roof|truss|crane|PSL/i.test(deal?.notes || ""));
  check("no page errors", errs.length === 0, errs[0]?.slice(0, 160));
} catch (e) {
  out.push("‼️ threw: " + e.message);
  await page.screenshot({ path: "scripts/e2e/phone-fail.png" }).catch(() => {});
  fail++;
} finally {
  await browser.close();
  await cleanup();
}

console.log(out.join("\n"));
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
