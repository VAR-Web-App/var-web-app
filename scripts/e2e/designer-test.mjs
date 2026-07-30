// Designer-portal server-side E2E — TEMPORARY, delete after testing.
// Exercises /api/designer/selections (read) and /api/designer/save-selection
// (write) against the running dev server, including guardrails.
import { ensureTestUser, seedDeal, seedDesignerLink, db } from "./harness.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3001";
let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

const u = await ensureTestUser();
const { deal } = await seedDeal(u.org_ref);
const { token, selection } = await seedDesignerLink(u.org_ref, deal);

const get = (t) => fetch(`${BASE}/api/designer/selections?token=${t}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
const save = (body) => fetch(`${BASE}/api/designer/save-selection`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

console.log("\n— READ —");
let r = await get(token);
check("GET returns 200 ok:true", r.s === 200 && r.b.ok === true, JSON.stringify(r.b).slice(0, 200));
check("link labels present", r.b.link?.project_name === deal.name, JSON.stringify(r.b.link));
check("seeded SEL-001 present", (r.b.selections || []).some((s) => s.number === "SEL-001"));

console.log("\n— CREATE (designer adds a new selection) —");
r = await save({ token, selection: {
  category: "countertops", title: "Kitchen countertops", allowance: 6000,
  options: [
    { label: "Quartz — Calacatta", cost: 5200, is_default: true },
    { label: "Granite — Ubatuba", cost: 4100 },
    { label: "Marble — Carrara", cost: 7800 },
  ],
}});
const createdId = r.b.selection?.id;
check("POST create returns 200 ok:true", r.s === 200 && r.b.ok === true, JSON.stringify(r.b).slice(0, 200));
check("new selection got number SEL-002", r.b.selection?.number === "SEL-002", r.b.selection?.number);
check("status defaults to draft", r.b.selection?.status === "draft");
check("3 options persisted with ids", (r.b.selection?.options || []).length === 3 && r.b.selection.options.every((o) => o.id));

console.log("\n— READ back —");
r = await get(token);
check("now 2 selections for the project", (r.b.selections || []).length === 2, `got ${(r.b.selections||[]).length}`);

console.log("\n— EDIT (designer re-curates existing draft) —");
r = await save({ token, selection: {
  id: selection.id, category: "flooring", title: "Main floor flooring — updated",
  allowance: 9500, options: [{ label: "White Oak 5\"", cost: 9000 }],
}});
check("POST edit returns 200 ok:true", r.s === 200 && r.b.ok === true, JSON.stringify(r.b).slice(0, 200));
check("title updated", r.b.selection?.title === "Main floor flooring — updated");
check("allowance updated", r.b.selection?.allowance === 9500);
check("GC-owned status preserved (still draft)", r.b.selection?.status === "draft");

console.log("\n— GUARDRAILS —");
r = await get("");
check("missing token → 400", r.s === 400, `got ${r.s}`);
r = await get("totally-bogus-token");
check("unknown token → 404", r.s === 404, `got ${r.s}`);
r = await save({ token: "totally-bogus-token", selection: { title: "x", allowance: 0, category: "other", options: [] } });
check("save with unknown token → 404", r.s === 404, `got ${r.s}`);

// Lock the seeded selection (simulate GC/client approval) then try to edit.
await db.collection("project_selections").doc(selection.id).update({ status: "approved" });
r = await save({ token, selection: { id: selection.id, category: "flooring", title: "hack", allowance: 1, options: [] } });
check("editing an approved selection → 409 locked", r.s === 409, `got ${r.s} ${JSON.stringify(r.b)}`);

// Cross-project guard: make a second project + link, try to edit sel from project 1 via link 2.
const { deal: deal2 } = await seedDeal(u.org_ref);
const link2 = "e2e-token2-" + u.org_ref;
await db.collection("designer_links").doc(link2).set({
  token: link2, org_ref: u.org_ref, deal_ref: deal2.id, project_name: deal2.name,
  builder_name: "E2E Test Co", e2e_test: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
});
r = await save({ token: link2, selection: { id: createdId, category: "other", title: "cross", allowance: 1, options: [] } });
check("editing another project's selection → 403", r.s === 403, `got ${r.s} ${JSON.stringify(r.b)}`);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
