# Barry transcript — feature punch list

Captured from the 2026-05-28 planning call with Barry McCluskey
(Maddox / McCluskey Construction). Transcript at
`C:\Users\cmadd\Downloads\Transcript_Builder App Planning_20260528.txt`.

Status legend:
- ✅ shipped today (2026-05-28)
- ☑ pre-existing in app
- ⏳ in-flight
- 🔵 waiting on Barry
- ⚪ unstarted
- ❌ explicitly declined by Barry

---

## Top of the funnel (estimating)

- ☑ AI plan extractor → assemblies → estimate (the demo magic)
- ✅ Barry's 200-line Good Faith Estimate template as taxonomy
  → `/settings/estimate-template` editor lets Barry add pricing per line
- ✅ AI estimate lines tagged with cat IDs (#21 FOOTINGS, #40 FRAMING,
  #51 DRYWALL, etc.) so output respects his GFE structure
- ✅ Plan extractor accuracy tightening (8 rounds against Maddox
  cross-check — see [POST_DEMO_TIGHTENING.md](./POST_DEMO_TIGHTENING.md))
- ⚪ **Pre-floorplan questionnaire** (Ira's idea, Barry liked). For
  prospects without plans yet — checklist of bedrooms/baths/finish
  tier drives a rough estimate using the Good Faith template defaults.
  **Pairs with the GFE template we just shipped.** High-leverage
  top-of-funnel lever; mid-size build.
- ⚪ Architectural plan AI search (architecturaldesigns.com /
  southernlivinghouseplans.com). Search by bedroom count + style →
  filter plans for prospects. Big and external; defer.

## Selections (Barry circled this 5+ times — biggest unbuilt feature) — ✅ SCOPED 2026-06-13

**Barry's email answers (2026-06-13) closed the blockers:**
- **Type:** selections are **non-change-order line items, distinct from change orders** ("yes, different from change order"). A selection = the *choice/spec*; a change order = a *price-changing mod*.
- **Timing:** **rolling — pre AND during build**, just like change orders. Project-scoped, addable anytime.
- **Required-by date:** **yes — a date, or at least a reminder** (soft; he did NOT ask for a hard schedule block).

**Resolved model (the 6 questions):**
1. **Option model** → curated options with **cost deltas via allowance**. Client picks: within allowance = logged selection; over allowance = the delta **spawns a linked change order**. This reconciles "non-change-order" with client cost-comparison.
2. **Templates** → starter category templates (brick / paint / flooring / fixtures / fireplace…), editable + add-custom.
3. **Wall-move vs selection** → separate types on one "Selections & Change Orders" tab (type dropdown). Wall-move = change order (annotated photo + client signature); selection = a choice.
4. **Designer role** → **writable**, scoped to selections; reusable designer across projects ("usually the same designer").
5. **After-approval** → record + client approves in portal (notification) + auto-generated confirmation / spec record.
6. **Required-by date** → optional needed-by date + reminder (soft flag, not a hard schedule block).

**Client-facing priced selections (Brennan's idea @ 15:05 + Collin's vision):** expose the existing assembly **variant/cost engine** to the client — they choose options (e.g., 4" vs 6" garage slab, door/flooring tiers) and see the **cost delta vs allowance**, the same way Barry edits assemblies. The mechanism already exists (variant presets carry cost deltas); this is exposing it client-side.

**Build (now unblocked):**
- ⚪ Data model + Firestore rules (project-scoped, rolling; selection + auto-linked change order on over-allowance)
- ⚪ "Selections & Change Orders" tab on project page (type dropdown)
- ⚪ Curated option templates + allowance + cost-delta
- ⚪ Client-facing priced picks in the client portal (variant engine exposed) + approve / e-sign
- ⚪ Designer portal (writable, selections-scoped)
- ⚪ Needed-by date + reminder

## Invoices & Draws (the second pillar — actuals→estimating loop)

The transcript's central thesis: *"put in actual costs… start
building estimates from there."* This is the feature flywheel.

- ☑ Email invoice parser exists in **Avanchor** (Ira: *"we do that
  today"*). Ports invoice text → line items → QuickBooks-ready
- ⚪ **Port the invoice parser into var-web-app** — biggest strategic
  unlock outside Selections. Unlocks everything below.
- ⚪ Same-sub-multiple-jobs disambiguation (uses PO# / amount match)
- ⚪ Draw automation (depends on parser):
  - Aggregate this period's invoices
  - Generate draw packet (simple lead-invoice + attachments — Barry's
    case is 95% of clients; AIA is commercial)
  - Email or portal-deliver to client
  - Capture client approve (signature modal — already exists)
  - Notify Barry
- ⚪ Bank-portal upload mode for the ~10% of clients with bank portals
- ⚪ Bank draw model on project (# of draws, % per draw, initial cap)
- ⚪ Actuals → estimating loop: when an invoice line lands, update the
  matching cat-ID unit cost on the org's GFE template. Falls out
  almost free once the parser is in place
- ⚪ Estimate color states (orange → yellow → green) as `PriceSource`
  flips from catalog → market → bid. Cheap to add once the loop exists

## Subs & Scheduling

- ☑ Sub portal at `/s/{token}` (read-only schedule + payments + awards)
- ☑ Per-trade RFQ creation (Subs page → New RFQ → project picker)
- ☑ Master schedule across all projects (`/schedule`)
- ⚪ **Drag-to-reschedule cascades** — slide a Gantt phase, notify
  the sub AND every downstream sub. Notifications already wired;
  cascade logic is the missing piece. Medium.
- ⚪ **Sub accept/decline scheduled dates** — small addition to sub
  portal. Pairs with cascade.
- ⚪ **Location ping on sub portal sign-in** — geofence project
  address, ping Barry when sub arrives on site. Ira's idea, Barry
  loved: *"You'd laugh but that would be awesome."*
- ⚪ **Spanish translator on sub portal** — Brennan flagged at end
  of call. Modern AI makes this cheap.
- ⚪ **Bulk import subs/suppliers from Excel** — Barry already has
  the spreadsheet. Quick win.
- ❌ **Sub mini-project-management inside sub portal** — Barry
  explicitly killed: *"most of them can't even manage their finances
  yet alone scheduling."* Do not build.

## Client-facing

- ☑ Read-only client portal (project view, payments, photos, draws)
- ☑ Client sign-link flow (typed name, no-login, e-signature)
- ✅ Notes section saves reliably (was racing the sign-link sync)
- ✅ Drop the `/s/` prefix on signature display (was rendering as `|s|`)
- ⚪ **Notify client on new photo upload** — trivial wire into
  existing notification system
- ⚪ **In-app camera capture + document scan** — replace
  upload-from-roll flow. Mobile primitive
- ⚪ **iPad-signed sketch on walkthrough photos** — Barry's partner
  workflow. Annotate photo + customer signature on photo. Mid-size

## Pricing / Packaging (business model)

Barry's view from the call:
- BuilderTrend = $400-$1000+/mo when stacked with per-seat fees;
  too complex, "feeds you to death"
- Job Trade ~$159/mo (cheapest competitor he knows)
- Barry: *"\$100-150/mo with good base features + add-ons is attractive."*

- ⚪ **~$129/mo base with 3-4 users included** (don't nickel-and-dime
  on seats; that's BuilderTrend's worst behavior)
- ⚪ **Premium add-ons** to upsell: 3D walkthrough, invoice
  parser + draw automation tier, customization services
- ⚪ Per-seat surcharge for users beyond included count (not per-seat
  from $1)

## Cross-cutting / polish

- ☑ Master multi-project schedule (`/schedule`)
- ☑ Project AI chat ("ask the project")
- ⚪ **Customizable dashboards** — Ira has working Avanchor code for
  multi-project cash flow forecast. Worth borrowing
- ⚪ **Tutorial popups / "explain this page" AI button** — cheap with
  modern tooling. Helpful when Barry's partner / project manager /
  designer onboard
- ⚪ **Files auto-synced to iCloud/Dropbox per project** — Brennan
  does this for Avanchor. Matters most when Barry is offline on jobsite

## Prioritization (my read)

If we had to rank by leverage × confidence:

1. **Selections** — biggest unbuilt feature, daily-use value for Barry.
   Blocked on 6 Q&A.
2. **Invoice email parser** (port from Avanchor) — biggest strategic
   unlock. Unlocks draws + actuals→estimating loop.
3. **Draw automation** — depends on #2. End-to-end value Barry feels weekly.
4. **Estimate color states + actuals→template loop** — falls out
   cheaply once #2 lands. Closes the thesis.
5. **Pre-floorplan questionnaire** — top-of-funnel lever, lowers
   friction to engage Barry on new prospects.
6. Quick wins parallel track: location ping, sub accept/decline,
   bulk sub import, photo notifs, Spanish translator.

## Open questions for Barry

**✅ Answered 2026-06-13 (see Selections section above):** option model (1),
category templates (2), wall-move vs selection (3), designer role (4),
after-approval flow (5), required-by-date (6), and designer-per-project
(9 — reusable, "usually the same designer").

**Still open:**
- **Draws — who approves first?** Universal across his clients, or just
  Brennan's bank? (Brennan signs first, then bank.)
- **Pricing learns from actuals — region-shared or org-only?** A bigger
  cross-builder learning DB is more powerful but raises privacy questions.
- **3D walkthrough as a paid add-on** — does Barry have customers actually
  asking, or is it speculative?

---

## Related docs

- [POST_DEMO_TIGHTENING.md](./POST_DEMO_TIGHTENING.md) — plan
  extractor accuracy punch list (mostly closed today)
- [BARRY_DEMO_OUTLINE.md](./BARRY_DEMO_OUTLINE.md) — what we showed
  Barry on the call
- [STRATEGY.md](./STRATEGY.md) — overall product strategy
- Raw transcript: `C:\Users\cmadd\Downloads\Transcript_Builder App Planning_20260528.txt`
