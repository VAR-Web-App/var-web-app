// Client portal (no-login) E2E — seeds a draw awaiting approval + a change
// order, then exercises the public data + action routes AS AN UNAUTHENTICATED
// client, and verifies the writes landed. Plus a render check of /portal/[token].
import { chromium } from "playwright";
import { cleanup, ensureTestUser, db } from "./harness.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
let pass = 0, fail = 0;
const out = [];
const check = (n, c, d = "") => { if (c) { pass++; out.push(`  ✅ ${n}`); } else { fail++; out.push(`  ❌ ${n} ${d}`); } };
const now = () => new Date().toISOString();

await cleanup();
const u = await ensureTestUser();
const org = u.org_ref;

const dealRef = db.collection("deals").doc();
await dealRef.set({ id: dealRef.id, org_ref: org, name: "Maddox Country Dream House", account_name: "Brennan Maddox", stage: "In Progress", total_quote_value: 1200000, e2e_test: true, created_at: now(), updated_at: now() });
// a draw awaiting the client's approval
const ms = db.collection("project_milestones").doc();
await ms.set({ id: ms.id, deal_ref: dealRef.id, org_ref: org, name: "Foundation", description: "", order: 0, percentage: 10, amount: 120000, status: "awaiting_approval", planned_start_date: "2026-08-01", planned_end_date: "2026-08-10", assigned_subs: [], notes: "", e2e_test: true, created_at: now(), updated_at: now() });
// a change order sent to the client
const co = db.collection("project_change_orders").doc();
await co.set({ id: co.id, deal_ref: dealRef.id, org_ref: org, number: "CO-001", title: "Upgrade kitchen counters", description: "Quartz upgrade", amount_delta: 4200, schedule_impact_days: 2, reason: "client_request", status: "sent", e2e_test: true, created_at: now(), updated_at: now() });
// a selection sent to the client (one option over allowance → auto-CO)
const sel = db.collection("project_selections").doc();
await sel.set({ id: sel.id, deal_ref: dealRef.id, org_ref: org, number: "SEL-001", category: "flooring", title: "Main floor flooring", description: "", allowance: 5000, status: "sent", notes: "",
  options: [{ id: "opt-lvp", label: "Luxury vinyl plank", description: "", cost: 4000 }, { id: "opt-oak", label: "White oak hardwood", description: "", cost: 7000 }],
  e2e_test: true, created_at: now(), updated_at: now() });
// the portal link
const token = "e2e-portal-" + org;
await db.collection("client_portal_links").doc(token).set({ token, org_ref: org, deal_ref: dealRef.id, project_name: "Maddox Country Dream House", builder_name: "E2E Test Co", client_name: "Brennan Maddox", e2e_test: true, created_at: now(), updated_at: now() });

const get = (t) => fetch(`${BASE}/api/portal/data?token=${t}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
const act = (body) => fetch(`${BASE}/api/portal/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
const read = async (coll, id) => (await db.collection(coll).doc(id).get()).data();

try {
  console.log("— data route (unauthenticated) —");
  let r = await get(token);
  check("data 200 ok", r.s === 200 && r.b.ok, JSON.stringify(r.b).slice(0, 120));
  check("project name + contract returned", r.b.project?.name === "Maddox Country Dream House" && r.b.contract_value === 1200000);
  check("awaiting draw present", (r.b.milestones || []).some((m) => m.id === ms.id && m.status === "awaiting_approval"));
  check("sent CO present", (r.b.change_orders || []).some((c) => c.id === co.id && c.status === "sent"));
  check("no internal cost fields leaked", !JSON.stringify(r.b).includes("cost_extended") && r.b.milestones?.[0]?.cost === undefined);

  console.log("\n— actions (unauthenticated) —");
  r = await act({ token, action: "approve_draw", milestoneId: ms.id, signature: "Brennan Maddox" });
  check("approve_draw ok", r.s === 200 && r.b.ok, JSON.stringify(r.b));
  check("milestone now approved + signed", (await read("project_milestones", ms.id)).status === "approved" && (await read("project_milestones", ms.id)).approval_signature === "Brennan Maddox");

  r = await act({ token, action: "approve_co", coId: co.id, signature: "Brennan Maddox" });
  check("approve_co ok", r.s === 200 && r.b.ok, JSON.stringify(r.b));
  check("CO now approved", (await read("project_change_orders", co.id)).status === "approved");

  console.log("\n— selection pick (over allowance → auto-CO) —");
  const dataR = await get(token);
  check("selections returned by data route", (dataR.b.selections || []).some((s) => s.id === sel.id && s.status === "sent"));
  r = await act({ token, action: "pick_selection", selectionId: sel.id, optionId: "opt-oak", signature: "Brennan Maddox" });
  check("pick_selection ok", r.s === 200 && r.b.ok, JSON.stringify(r.b));
  const picked = await read("project_selections", sel.id);
  check("selection → over_allowance + signed", picked.status === "over_allowance" && picked.selected_option_id === "opt-oak" && picked.approval_signature === "Brennan Maddox");
  check("auto-CO created for $2,000 overage", picked.linked_change_order_id && (await read("project_change_orders", picked.linked_change_order_id))?.amount_delta === 2000);
  r = await act({ token, action: "pick_selection", selectionId: sel.id, optionId: "opt-lvp", signature: "x" });
  check("re-picking a decided selection → 409", r.s === 409, `got ${r.s}`);

  console.log("\n— guardrails —");
  r = await act({ token: "bogus", action: "approve_draw", milestoneId: ms.id, signature: "x" });
  check("bad token → 404", r.s === 404, `got ${r.s}`);
  r = await act({ token, action: "approve_draw", milestoneId: ms.id, signature: "x" });
  check("re-approving an approved draw → 409", r.s === 409, `got ${r.s}`);
  // milestone from a different deal must be rejected as wrong_project
  const otherMs = db.collection("project_milestones").doc();
  await otherMs.set({ id: otherMs.id, deal_ref: "other-deal", org_ref: org, name: "X", description: "", order: 0, percentage: 5, amount: 1, status: "awaiting_approval", notes: "", e2e_test: true, created_at: now(), updated_at: now() });
  r = await act({ token, action: "approve_draw", milestoneId: otherMs.id, signature: "x" });
  check("cross-project milestone → 403", r.s === 403, `got ${r.s}`);
  r = await get("bogus");
  check("data bad token → 404", r.s === 404, `got ${r.s}`);

  console.log("\n— public page renders (no login) —");
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ serviceWorkers: "block" })).newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`${BASE}/portal/${token}`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Maddox Country Dream House/).waitFor({ timeout: 8000 }).catch(() => {});
  const txt = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  // Contract reflects base + approved CO by now ($1,204,200), so match the label not a stale figure.
  check("page shows project + contract", /Maddox Country Dream House/.test(txt) && /Contract: \$1,20[0-9],[0-9]{3}/.test(txt));
  check("page shows phases section", /phases|draws/i.test(txt));
  check("no page errors", errs.length === 0, errs[0]?.slice(0, 120));
  await browser.close();
} catch (e) {
  out.push("‼️ threw: " + e.message);
  fail++;
} finally {
  await cleanup();
}

console.log(out.join("\n"));
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
