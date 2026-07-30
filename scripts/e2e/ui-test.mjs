// Playwright UI E2E — TEMPORARY, delete after testing.
// Drives the real app as a logged-in user through the recent additions and
// verifies each against Firestore via the admin SDK.
import { chromium } from "playwright";
import {
  ensureTestUser, seedDeal, seedDesignerLink, cleanup, db,
  TEST_EMAIL, TEST_PASSWORD, TEST_ORG,
} from "./harness.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3001";
let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; results.push(`  ✅ ${name}`); }
  else { fail++; results.push(`  ❌ ${name} ${detail}`); }
}
function section(t) { results.push(`\n— ${t} —`); }

// ---- clean slate + seed ----
await cleanup(); // clear any leftovers from prior runs so checks aren't polluted
const u = await ensureTestUser();
const { deal, milestones } = await seedDeal(u.org_ref);
const { token } = await seedDesignerLink(u.org_ref, deal);
const dealId = deal.id;

const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: "block" });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(e.stack || String(e)));
page.on("dialog", (d) => d.accept()); // auto-accept the cascade confirm()

// Navigate + wait for React hydration (domcontentloaded fires before handlers
// attach; interacting too early does native no-op form posts).
async function go(p, url) {
  await p.goto(url, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1400);
}

try {
  // ================= LOGIN =================
  section("LOGIN");
  let loginErr = "";
  for (let attempt = 0; attempt < 3 && !page.url().includes("/deals"); attempt++) {
    await go(page, `${BASE}/login`);
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click(); // the form submit, not the mode tab
    await page.waitForURL("**/deals", { timeout: 15000 }).catch(() => {});
    loginErr = await page.locator("p.bg-red-50, .text-red-700").first().innerText().catch(() => "");
  }
  check("logged in → reached /deals", page.url().includes("/deals"), `at ${page.url()} ${loginErr}`);

  // ============ QUICK ESTIMATE ============
  section("QUICK ESTIMATE (pre-floorplan questionnaire)");
  await go(page, `${BASE}/quick-estimate`);
  check("page heading renders", await page.getByRole("heading", { name: /quick estimate/i }).isVisible());
  await page.getByRole("button", { name: /calculate ballpark/i }).click();
  const totalText = await page.locator("text=/\\$[0-9][0-9,]+/").first().innerText().catch(() => "");
  const standardTotal = Number(totalText.replace(/[^0-9.]/g, ""));
  check("produces a ballpark total > $0", standardTotal > 0, `got "${totalText}"`);
  check("total is a plausible custom-home number (>$100k)", standardTotal > 100000, `got ${standardTotal}`);
  check("shows the pricing-label caveat", await page.getByText(/Pricing adjustments/i).isVisible());
  check("shows a $/sq ft figure", await page.getByText(/\/sq ft/i).isVisible());
  // Tier multiplier: premium (1.2x) must exceed standard.
  await page.locator("select").filter({ hasText: /Economy|Standard|Premium/ }).last().selectOption("premium");
  await page.getByRole("button", { name: /calculate ballpark/i }).click();
  const premiumText = await page.locator("text=/\\$[0-9][0-9,]+/").first().innerText().catch(() => "");
  const premiumTotal = Number(premiumText.replace(/[^0-9.]/g, ""));
  check("premium tier (1.2x) > standard", premiumTotal > standardTotal, `premium ${premiumTotal} vs standard ${standardTotal}`);

  // ============ RESCHEDULE CASCADE ============
  section("RESCHEDULE CASCADE");
  await go(page, `${BASE}/deals/${dealId}/schedule`);
  const framing = milestones.find((m) => m.name === "Framing");
  const roofing = milestones.find((m) => m.name === "Roofing");
  const drywall = milestones.find((m) => m.name === "Drywall");
  const foundation = milestones.find((m) => m.name === "Foundation");
  // Open the Framing bar's editor and push its END date +7 days (08-25 → 09-01).
  await page.getByRole("button", { name: /Framing/ }).first().click();
  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.first().waitFor({ timeout: 5000 });
  await dateInputs.nth(1).fill("2026-09-01"); // End input → triggers cascade confirm (auto-accepted)
  await page.waitForTimeout(2500); // let saveMilestones round-trip to Firestore

  const readM = async (id) => (await db.collection("project_milestones").doc(id).get()).data();
  const nf = await readM(framing.id), nr = await readM(roofing.id), nd = await readM(drywall.id), nfo = await readM(foundation.id);
  check("moved phase (Framing) end shifted to 2026-09-01", nf.planned_end_date === "2026-09-01", nf.planned_end_date);
  check("downstream Roofing start shifted +7 (08-26→09-02)", nr.planned_start_date === "2026-09-02", nr.planned_start_date);
  check("downstream Roofing end shifted +7 (09-05→09-12)", nr.planned_end_date === "2026-09-12", nr.planned_end_date);
  check("downstream Drywall start shifted +7 (09-06→09-13)", nd.planned_start_date === "2026-09-13", nd.planned_start_date);
  check("upstream/released Foundation left untouched", nfo.planned_start_date === "2026-08-01" && nfo.planned_end_date === "2026-08-10", `${nfo.planned_start_date}..${nfo.planned_end_date}`);

  // ============ INVOICE SAVE & MATCH ============
  section("INVOICE — Save & match to project (the no-op fix)");
  // Stub the AI parse so the test is deterministic and free.
  await page.route("**/api/invoice/parse", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, invoice: {
        vendor_name: "E2E Lumber Co", invoice_number: "INV-E2E-1", invoice_date: "2026-07-05",
        due_date: "2026-08-05", po_number: "PO-1", total: 1234.56,
        line_items: [{ description: "2x4 studs", quantity: 100, unit: "ea", unit_price: 3.5, extended: 350 }],
        confidence: "high",
      },
    }) }));
  await go(page, `${BASE}/deals/${dealId}/finances`);
  await page.getByRole("button", { name: /import invoice/i }).click();
  await page.locator("textarea").fill("Invoice from E2E Lumber Co, total $1,234.56");
  await page.getByRole("button", { name: /parse invoice/i }).click();
  await page.getByText(/Invoice parsed/i).waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: /save & match to project/i }).click();
  // The fix: modal must close (await + onClose), and the invoice must persist.
  await page.getByText(/Invoice parsed/i).waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  const modalClosed = !(await page.getByText(/Invoice parsed/i).isVisible().catch(() => false));
  check("modal closed after save (fix: was fire-and-forget)", modalClosed);
  await page.waitForTimeout(1500);
  const invSnap = await db.collection("invoices").where("deal_ref", "==", dealId).get();
  const inv = invSnap.docs.map((d) => d.data()).find((i) => i.vendor_name === "E2E Lumber Co");
  check("invoice persisted to Firestore", !!inv, `found ${invSnap.size} invoices for deal`);
  check("invoice auto-matched to this deal", inv?.deal_ref === dealId, inv?.deal_ref);
  check("invoice status = matched", inv?.status === "matched", inv?.status);
  await page.screenshot({ path: "scripts/e2e/finances.png" });
  const panelText = await page.locator("section").filter({ hasText: "Invoices" }).first().innerText().catch(() => "");
  const rowVisible = await page.getByText("E2E Lumber Co").first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
  check("invoice row visible in the panel", rowVisible, `panel says: ${panelText.slice(0, 80).replace(/\n/g, " ")}`);

  // ============ TEAM INVITES ============
  section("TEAM INVITES (/settings)");
  await go(page, `${BASE}/settings`);
  const inviteEmail = "e2e-invitee@keystone-e2e.test";
  await page.locator('input[type="email"]').fill(inviteEmail);
  await page.getByRole("button", { name: /send invite/i }).click();
  await page.getByText(/Invite sent/i).waitFor({ timeout: 8000 }).catch(() => {});
  check("UI confirms 'Invite sent'", await page.getByText(/Invite sent/i).isVisible().catch(() => false));
  const invite = (await db.collection("invites").doc(inviteEmail).get()).data();
  check("invite doc created in Firestore", !!invite, "no doc");
  check("invite scoped to test org", invite?.org_ref === TEST_ORG, invite?.org_ref);
  check("invite records inviter", invite?.invited_by === TEST_EMAIL, invite?.invited_by);
  check("invitee shows in pending list", await page.getByText(inviteEmail).isVisible().catch(() => false));

  // ============ DESIGNER PORTAL PAGE (no-login render) ============
  section("DESIGNER PORTAL PAGE (/d/[token])");
  const anon = await browser.newContext({ serviceWorkers: "block" }); // fresh context = not logged in
  const dpage = await anon.newPage();
  await go(dpage, `${BASE}/d/${token}`);
  check("renders project name (no login)", await dpage.getByText(/E2E — Cascade Test House/).isVisible().catch(() => false));
  // The selection title renders inside an <input value=…>, and SEL-001/allowance as text.
  const selTitleVal = await dpage.locator('input[type="text"]').filter({ hasText: "" }).first().inputValue().catch(() => "");
  const selByNumber = await dpage.getByText(/SEL-001/).isVisible().catch(() => false);
  const selByAllowance = await dpage.getByText(/8,000 allowance/).isVisible().catch(() => false);
  check("renders the seeded selection card", selByNumber || selByAllowance || /flooring/i.test(selTitleVal), `num:${selByNumber} allow:${selByAllowance} title:"${selTitleVal}"`);
  await anon.close();
} catch (e) {
  results.push(`\n‼️  suite threw: ${e.message}`);
  await page.screenshot({ path: "scripts/e2e/fail.png" }).catch(() => {});
  fail++;
} finally {
  await browser.close();
}

console.log(results.join("\n"));
if (consoleErrors.length) {
  console.log(`\n⚠️  ${consoleErrors.length} page error(s) captured:`);
  for (const e of consoleErrors.slice(0, 8)) console.log("   " + e.slice(0, 500) + "\n   ---");
}
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
