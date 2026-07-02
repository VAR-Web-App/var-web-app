# KeystonePro — Master To-Do

Consolidated from the 2026-05-28 Barry call + his 2026-06-13 answers.
Sources: [BARRY_TRANSCRIPT_IDEAS.md](./BARRY_TRANSCRIPT_IDEAS.md) (meeting punch
list), [POST_DEMO_TIGHTENING.md](./POST_DEMO_TIGHTENING.md) (extractor accuracy),
[FEATURES.md](./FEATURES.md) (full feature inventory + add-on gallery).

Status: ⬜ open · ✅ done · 🔵 waiting on Barry

---

## The 5 overarching tracks (epics)

1. **🎯 Selections** — client-facing priced selections (the #1 unbuilt feature; now scoped & unblocked).
2. **💸 Financial flywheel** — invoice parser → draws → actuals→estimating loop (biggest *unblocked* strategic unlock).
3. **📐 Estimate completeness** — wire the missing MEP/finishes/site-work assemblies into the converter (closes the $265K→$1.1M gap).
4. **🏗️ Field, sub & client ops** — scheduling depth, sub-portal upgrades, client field tools, dashboards.
5. **💵 Packaging & premium add-ons** — pricing model + the upsell gallery.

---

## 1. 🎯 Selections — *scoped 2026-06-13, ready to build*
Model: selection = a **non-change-order** choice/spec, **rolling** (pre & during build); curated options with **cost deltas via allowance** — over-allowance picks auto-spawn a linked change order.
- ⬜ Data model + Firestore rules (project-scoped, rolling; selection + auto-linked change order on over-allowance)
- ⬜ "Selections & Change Orders" tab on the project page (type dropdown)
- ⬜ Curated option templates (brick/paint/flooring/fixtures/fireplace…), editable + add-custom
- ⬜ Allowance + per-option cost-delta engine (reuse assembly variant/cost engine)
- ⬜ **Client-facing priced picks** in the client portal (variant engine exposed) + approve / e-sign
- ⬜ Designer portal — writable, selections-scoped, reusable designer
- ⬜ Needed-by date + reminder (soft flag)
- ⬜ Wall-move change order: annotated photo + client signature (same tab, change-order type)

## 2. 💸 Financial flywheel — *invoices → draws → actuals loop*
- ⬜ **Port the invoice email parser from Avanchor** (the unlock everything below depends on)
- ⬜ Same-sub-multiple-jobs disambiguation (PO# / amount match)
- ⬜ Draw automation: aggregate period invoices → generate draw packet → portal/email to client → capture signature → notify Barry
- ⬜ Bank-portal upload mode (~10% of clients)
- ⬜ Bank draw model on project (# draws, % per draw, initial cap)
- ⬜ Actuals→estimating loop: invoice line updates the matching cat-ID unit cost on the org's GFE template
- ⬜ Estimate color states (orange→yellow→green) as PriceSource flips catalog→market→bid

## 3. 📐 Estimate completeness — *CRITICAL: close the $265K→$1.1M gap*
Auto-generate the trade assemblies the converter doesn't yet emit (catalog HAS them):
- ⬜ `stub-plumbing-rough` (baths×3 + kitchen + laundry)
- ⬜ `stub-electrical-whole-home` (by sqft + bedrooms)
- ⬜ `stub-hvac-ducted` (tonnage = sqft / 500)
- ⬜ `stub-kitchen-cabinetry` (linear feet; ~25 LF fallback)
- ⬜ `stub-countertops` (kitchen + bath, ~60 SF each)
- ⬜ `stub-bath-suite` (per full + half bath)
- ⬜ `stub-appliance-allowance` (kitchen fixture count)
- ⬜ `stub-site-work` (perimeter × clearing factor)
- ⬜ `stub-septic-system` (rural / no municipal sewer)
- ⬜ **Pre-floorplan questionnaire** (bedrooms/baths/finish tier → rough estimate from GFE defaults; top-of-funnel)
- ⬜ Catalog: regional pricing multipliers ("Set your market" onboarding)
- ⬜ Catalog: live pricing source (1build / RSMeans / Stackct) — replace hardcoded 2024 averages
- ⬜ Minor extractor polish: drywall tape line, 4×8 vs 4×12 sheets, PSL-vs-LVL porch beams *(small $)*

## 4. 🏗️ Field, sub & client ops
**Subs & scheduling**
- ⬜ Drag-to-reschedule cascades (slide a phase → notify sub + downstream subs)
- ⬜ Sub accept/decline scheduled dates
- ⬜ Location ping on sub portal sign-in (geofence → ping Barry on arrival)
- ⬜ Spanish translator on sub portal
- ⬜ Bulk import subs/suppliers from Excel *(quick win)*
- ❌ Sub mini-PM inside portal *(Barry killed it)*

**Client-facing**
- ⬜ Notify client on new photo upload *(trivial)*
- ⬜ In-app camera capture + document scan
- ⬜ iPad-signed sketch on walkthrough photos *(see Selections wall-move flow)*

**Cross-cutting / polish**
- ⬜ Customizable dashboards (borrow Ira's Avanchor multi-project cash-flow code)
- ⬜ Tutorial popups / "explain this page" AI button
- ⬜ Files auto-synced to iCloud/Dropbox per project

## 5. 💵 Packaging & premium add-ons
- ⬜ ~$129/mo base, 3–4 users included (no per-seat-from-$1)
- ⬜ Per-seat surcharge beyond included count
- ⬜ Premium add-on tier: 3D walkthrough · invoice-parser+draw automation · customization services
- ⬜ Add-on gallery (FEATURES.md roadmap): Sub Bid Intelligence · Smart Notifications · Email Digester · Phone Call Summarization · Dynamic Finance Forecasting · Materials Sourcing Catalog · 3D Virtual Walkthrough

---

## Still open for Barry (not blocking)
- 🔵 Draws — who approves first (universal vs just Brennan's bank)?
- 🔵 Pricing-learns-from-actuals — region-shared DB or org-only (privacy)?
- 🔵 3D walkthrough demand — real customer asks or speculative?

## Recommended build order
1. **Estimate completeness (Track 3 CRITICAL)** — fastest credibility win; the demo's estimate is wrong by ~5× without it.
2. **Selections (Track 1)** — Barry's #1; now unblocked.
3. **Invoice parser → draws (Track 2)** — the strategic flywheel; port from Avanchor.
4. Parallel quick-wins from Track 4 (location ping, bulk import, photo notifs, Spanish).
5. Packaging (Track 5) once there's enough to tier.
