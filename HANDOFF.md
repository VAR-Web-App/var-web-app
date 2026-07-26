# KeystonePro — Changes Handoff

**Author:** Collin · **Date:** July 2026 · **For:** Brennan

Everything below is **merged to `main`** across PRs #8–#12. This doc covers what
changed, how to test each piece, and what's left. Skim **"Read this first"** —
a couple of items directly affect your work.

---

## ⚠️ Read this first (coordination)

1. **Firestore rules were DEPLOYED to production** (security fixes + new
   `client_portal_links` collection). If you run `firebase deploy --only
   firestore:rules` from an older local `firestore.rules`, you'll **overwrite
   the live security fixes**. Always `git pull origin main` before touching
   rules. The live rules == what's on `main`.
2. **Notification channels:** only **web push (VAPID)** is configured. There are
   **no Twilio (SMS) or SendGrid (email) keys** in the env, so all SMS/email
   sends currently no-op. See *What's left → SendGrid*. (This is fine for a
   test — the client-facing flows use mailto + copy-links + push.)
3. **Overlap to resolve:** your **Sub reliability** panel and my Scheduling
   Intelligence **Sub performance** card both score subs. We should consolidate
   into one so we're not shipping two sub-scoring surfaces.
4. **Automated E2E tests** for most of this live in `scripts/e2e/*.mjs` (not
   committed — they read `.env.local` + seed/cleanup tagged data in live
   Firestore). Ping me if you want them. Manual test steps are below.

**General test setup:** log in → **Projects**. If empty, click **"Try with
sample data"** → opens **Maddox — Country Dream House** (a mid-build project now
seeded with milestones, quote, payments, RFQs, change orders, and selections).
Most features below test against that project.

---

## 🔒 Security fixes (PR #9, #10 — DEPLOYED live)

Found in a 4-agent audit. Both were real multi-tenant holes.

| Fix | What it was | Verify |
|---|---|---|
| **org_ref self-assignment** | `users/{uid}` allowed writing any `org_ref`, so a user could read a victim's org_ref (leaked in public link docs) and join their tenant. | Signup + normal profile edits still work; you can't change `org_ref` except to your own uid or an org that invited your email. |
| **Public `list` enumeration** | `client_sign_links` / `sub_schedule_links` / `designer_links` used `allow read: if true` — `read` = get **+ list**, so anyone could `getDocs()` and dump every org's proposals/schedules. | Now `get: if true` + list denied/scoped. get-by-token still works. |
| **rfq-panel infinite "Loading…"** | No `.catch` behind the `!loaded` gate → any failed read hung the panel forever. | Finances → RFQ panel loads or shows an error, never hangs. |
| **sub_acknowledgments permission trap** | Rule gated on `org_ref` but the query filters `deal_ref` → silent permission-denied, so sub confirm/conflict badges never showed. | Sub acknowledgment badges now appear on the schedule. |

All four are hard to eyeball manually — they're verified by `scripts/e2e/rules-test.mjs` (8/8 against **live deployed rules**).

---

## ✨ Features

### 1. Scheduling Intelligence — `/schedule`
Three cards atop the Sub Schedule.
- **Conflicts:** cross-project double-bookings + a suggested shift.
- **Weather watch:** rain hitting an upcoming *outdoor* phase (keyless — US
  Census geocode of `deal.ship_to_address` + Open-Meteo). Degrades silently if
  the address can't be geocoded.
- **Sub performance:** on-time % from milestone timing.
- **Test:** open `/schedule` with sample data. To force a conflict, assign one
  sub to overlapping phases in two different projects.
- **Files:** `src/lib/scheduling/insights.ts`, `src/components/scheduling-insights.tsx`, `src/app/api/weather/route.ts`.

### 2. Smart Notifications — `/settings` → "Notification routing"
Per-event channel routing (push/email/SMS) + quiet hours; saves on change.
- **Test:** toggle channels; reload — they persist. For delivery: enable push
  (the "Instant alerts" card), then trigger an event (sign a proposal / record
  a payment) → you get a push. Email/SMS need SendGrid/Twilio.
- **Files:** `src/lib/notify/events.ts` (pure routing), `src/lib/notify/gc.ts` (server sender), `src/app/api/notify/gc/route.ts`, `src/components/notification-prefs-card.tsx`.

### 3. Materials Sourcing Catalog — quote editor
Searchable priced SKUs (flattened from the assembly catalog) → one-click add.
- **Test:** open a project → **Quote/Estimate** → **"Add from catalog"** →
  search "stud" → **Add** → the line appears in the estimate.
- **Files:** `src/lib/catalog/materials.ts`, `src/components/materials-catalog-modal.tsx`.

### 4. Email Digester — `/inbox`
Paste a forwarded email → Claude routes it to a project + action items + a draft
reply. (Uses `ANTHROPIC_API_KEY`, which *is* configured.)
- **Test:** Inbox → **"Digest a forwarded email"** → paste any client/sub email
  mentioning a project → get routed project + action items + editable reply.
- **Files:** `src/app/api/email/digest/route.ts`, `src/components/email-digester.tsx`.

### 5. Phone Call Summarization — `/inbox`
Paste a call transcript → recap + action items → save to project notes.
- **Test:** Inbox → **"Summarize a call"** → paste a transcript → **"Save to
  project notes"** → check the project's notes.
- **Files:** `src/app/api/phone/summarize/route.ts`, `src/components/phone-summarizer.tsx`.

### 6. Sub Bid Intelligence — `/deals/[id]/finances`
Benchmarks a project's RFQ bids against the org's own history for that phase
(low/fair/high). Only shows once there are bids.
- **Test:** sample data has awarded RFQs; open a project's Finances → the Bid
  Intelligence panel benchmarks the flooring RFQ bids.
- **Files:** `src/lib/bids/intelligence.ts`, `src/components/bid-intelligence-panel.tsx`, `store.listAllRFQsForOrg`.

### 7. Client Portal (no-login) — `/portal/[token]` ⭐ biggest add
Homeowners approve **draws**, approve/reject **change orders**, and pick
**selections** — all with no login. Data + writes go through token-verified
admin routes (`/api/portal/data`, `/api/portal/action`); over-allowance
selection picks auto-spawn an approved change order; each action notifies the
builder.
- **Test:** open Maddox → a draw milestone (there's one *awaiting approval*) →
  **"Email to client"** — the mailto now contains a `/portal/{token}` link.
  Open that link in a private window (no login) → approve the draw, decide the
  pending change order, and pick the flooring selection (SEL-001). Watch the
  contract value update and the builder get notified.
- **Files:** `src/app/portal/[token]/page.tsx`, `src/app/api/portal/{data,action}/route.ts`, `store.createOrGetClientPortalLink`, `client_portal_links` rule.
- **Note:** this is *separate from* the old builder-authed `/deals/[id]/portal`
  preview (which stays as the "view as client" preview).

### 8. Onboarding fixes (PR #11)
- **Company name at signup:** new accounts seed `settings.company_name`, so
  proposals/estimates/portal show the builder's name, not "Your builder."
  **Test:** sign up a fresh account → make a project → **Proposal** shows your
  company name.
- **Password reset:** **Test:** login page → **"Forgot password?"** → enter
  email → reset link sent.
- **Files:** `src/lib/default-settings.ts`, `src/lib/auth-context.tsx`, `src/app/login/page.tsx`.

### 9. Payment reconciliation (PR #12)
Releasing a draw now records an **incoming payment** (idempotent), so client
draw receipts show in the budget instead of vanishing.
- **Test:** open a project → schedule/execution panel → mark a milestone
  **"released"** (paid) → check **Payments** — a "Client draw" entry appears.
- **Files:** `src/components/project-execution-panel.tsx` (`transition`).

### 10. Mobile schedule (PR #12)
The cross-project Gantt was unusable on a phone. Now the Gantt is desktop-only
and phones get a stacked per-sub list.
- **Test:** open `/schedule` on a phone or a ~390px-wide browser → stacked
  "who's on what" list with conflicts highlighted, no horizontal overflow.
- **Files:** `src/app/schedule/page.tsx`.

### 11. Plan retention (PR #8)
Uploaded floor-plan PDFs are **no longer deleted** after extraction — they're
kept (`deal.floor_plan_url`) as the training corpus for a future in-house
floor-plan model. Reversible via `RETAIN_PLAN_UPLOADS=false`.
- **⚠️ Business gate:** retaining customer plans for training needs to be
  covered in the customer ToS. That's on us, not code.
- **Files:** `src/app/api/plan-extract/route.ts`, `src/components/plan-extractor.tsx`.

### 12. 3D Virtual Walkthrough — Path B **POC only** — `/walkthrough-demo`
LLM-inferred room layout → three.js extruded massing model. **Approximate, not
shippable** — a proof that the free/in-house path is viable. The "real" version
is CubiCasa (paid, accurate) — see *What's left*.
- **Test:** open `/walkthrough-demo` → an orbitable 3D model of a sample home.
- **Files:** `src/app/walkthrough-demo/page.tsx`, `src/components/walkthrough-viewer.tsx`, `src/app/api/walkthrough/layout/route.ts`.

---

## 🧭 What's left / follow-ups

| Item | Notes |
|---|---|
| **SendGrid setup** | Add `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` (verified sender) to Vercel env → automated RFQ-to-sub emails + email alerts start working. ~15 min. |
| **SMS** | Skip for now — Twilio A2P 10DLC registration is weeks; it's default-off and every path has a fallback. |
| **Quote editor on mobile** | Still contains-scrolls (usable but clunky). A card/stacked rebuild of the 8-column inline editor is the one remaining mobile piece. |
| **Closeout / warranty** | Only phase labels exist — no punch list, lien waivers, CO/as-built handoff. |
| **QuickBooks sync** | Still a mock (`alert("Demo mode")`). |
| **3D real version** | Path A = CubiCasa API (accurate, ~$35/plan retail, dev pricing = contact sales, not instant). CubiCasa5K dataset is **CC BY-NC** (non-commercial) so we can't ship a model trained on it — our retained plans (see #11) are the commercial path. Email out to CubiCasa sales pending. |
| **Entitlement / billing layer** | None exists. Needed to gate/charge for any of these add-ons as paid tiers. |
| **Selection picks vs auto-CO** | Portal selection picks work; double-check the auto-CO math against your finance panels. |

---

## PR index
- **#8** — Scheduling Intelligence, Smart Notifications, Materials Catalog, Email Digester, Phone Summarization, Sub Bid Intelligence, 3D POC, plan retention. *(My Cost Forecast panel was dropped in favor of your Finance Forecast panel.)*
- **#9** — 2 critical security fixes (deployed).
- **#10** — rfq-panel hang + sub_ack trap (deployed).
- **#11** — Client portal + onboarding (company name, password reset).
- **#12** — Portal selection picks, payment reconciliation, sample selections, mobile schedule.
