# KeystonePro — Full End-to-End Test Script

**Updated:** 2026-07-27 · Walk top to bottom. Each step is **action → expected**.

**Where:** live at `var-web-app-beryl.vercel.app` (auto-deploys from `main`), or `npm run dev` locally.

## Setup — do this before starting
- [ ] **Two browsers/profiles ready:** your normal window (logged in as the builder) + a **private/incognito** window (for the no-login client/sub/designer portals).
- [ ] **A second account** (different email) if you want to test tenant isolation (Journey 11).
- [ ] Log in → **Projects** → if empty, **"Try with sample data"** → opens *Maddox — Country Dream House* (seeded with milestones, quote, payments, RFQs, change orders, selections, portal link, a cross-project conflict).

---

## Journey 1 — Auth & onboarding
- [ ] **Sign up** a fresh account (new email) → land in the app. Sidebar shows your name/email.
- [ ] Settings → **company name** is pre-seeded (proposals/portal show it, not "Your builder").
- [ ] **Log out** → **log in** again → lands on Projects.
- [ ] Login page → **"Forgot password?"** → enter email → reset email sent.
- [ ] `/demo` in a logged-out window → browsable demo with seed data, no account.
- [ ] **Team invite:** Settings → invite a teammate email → the join-org banner/flow works for that invitee.

## Journey 2 — Sales: Lead → Estimate → Proposal → Signed
- [ ] **Projects → New** → name it → saves in **Lead** (`rfq`).
- [ ] **Quick estimate** (nav) → answer size/beds/baths/foundation/finish → get a ballpark number off the template.
- [ ] Open the new project → **Quote/Estimate** → add line items manually.
- [ ] Quote → **"Add from catalog"** → search "stud" → **Add** → line appears.
- [ ] **Takeoff** tab → (if using) plan-based takeoff loads.
- [ ] **Proposal** → generate/copy the client sign link → **project moves to "Estimate Sent"** (`quoted`).
- [ ] Proposal shows **Total Contract Amount** = grand total; if soft costs exist, scope shows **Subtotal + Soft costs + Total** reconciling.
- [ ] **Incognito:** open the `/sign/{token}` link → review → sign → **contract amount signed = what Accept books**.
- [ ] Back as builder → project → **Accept** → moves to **Contract Signed** (`awarded`), books `award_total`.

## Journey 3 — Pre-construction: schedule, subs, RFQs
- [ ] **Subs & Suppliers** → **New Sub** → fill name/trade/phone/email → **SMS consent** checkbox shows the full carrier disclosure with your company name → save.
- [ ] Subs → **Import** → paste a few tab-separated rows → preview → import.
- [ ] Project → **Schedule** tab → add milestones/phases → **assign a sub** to a phase.
- [ ] Project → **Finances** → **RFQ panel** → create an RFQ → invite subs → (sub side tested in Journey 6).
- [ ] Finances → **Bid Intelligence** benchmarks the flooring RFQ bids (low/fair/high) once bids exist.
- [ ] Award an RFQ → winning sub reflected; award notification fires (push if enabled).

## Journey 4 — Construction: draws, change orders, selections, payments
- [ ] Project → execution/schedule panel → mark a milestone **"released"** → **Payments** shows a "Client draw" entry (idempotent — releasing twice doesn't double it).
- [ ] Project → **Selections** → designer-curated options exist (SEL-001 flooring, SEL-002 countertops).
- [ ] Create/edit a **change order** → appears in the project's CO list.
- [ ] Project → **Files** tab → upload a file → it lists; a floor-plan PDF is **retained** (not deleted after extraction).
- [ ] Draw detail (`/deals/[id]/draw/[milestoneId]`) → attachments/section loads.

## Journey 5 — Client portal (no-login) ⭐
- [ ] As builder: open Maddox → a **draw awaiting approval** → **"Email to client"** → copy the `/portal/{token}` link.
- [ ] **Incognito:** open the portal → **no cost/margin leak** anywhere.
- [ ] Draw section reads *"Approve it to authorize your builder to release the $X draw payment"*; button **"Approve draw · $X"** → type name → approve → builder gets notified.
- [ ] **Change order** in portal → approve (with signature) or reject (with reason) → builder notified.
- [ ] **Selection** (SEL-001) → pick an option **over the allowance** → sign → an **over-allowance change order auto-creates** (selection + CO commit together) → contract value updates → builder notified.

## Journey 6 — Sub portal + bidding (no-login)
- [ ] As builder: Subs → a sub → **"Preview portal"** → opens `/s/{token}` (schedule, payments, awarded scopes).
- [ ] From an RFQ invite link → `/s/{token}/bid/{rfqId}` → sub reviews scope → **submits a bid** → builder sees it arrive (Bid Intelligence updates; push if enabled).

## Journey 7 — Designer portal (no-login)
- [ ] Get a designer link → `/d/{token}` → designer curates selection options → saved options appear in the project's Selections + client portal.

## Journey 8 — Inbox & AI
- [ ] **Inbox** → unattended items across all projects (bids to award, draws pending, COs out) with the sidebar count badge matching.
- [ ] **"Digest a forwarded email"** → paste a client/sub email mentioning a project → routed project + action items + draft reply.
- [ ] **"Summarize a call"** → paste a transcript **naming a project** → recap + action items → **Save to project notes** → check notes.
- [ ] Phone summarizer with a transcript that **names no project** → "No clear match" → **pick a project from the dropdown** → save works.

## Journey 9 — Scheduling Intelligence (`/schedule`)
- [ ] **Conflicts** card shows the seeded cross-project double-booking + a suggested shift.
- [ ] **Sub performance** card shows on-time %.
- [ ] **Weather:** with a valid US project address, shows rain advisories or "no rain." Set a project address to garbage → reload → **"Couldn't check the forecast for this project's address"** (not a false all-clear). Restore the address.
- [ ] **Mobile (<768px):** stacked per-sub list; **idle subs appear** with "No assignments yet" + Assign.

## Journey 10 — Settings
- [ ] **Business profile / branding** → company name, logo, markup, payment terms → saves; flows into new projects.
- [ ] **Notification routing** → per-event push/email/SMS toggles + quiet hours persist on reload.
- [ ] Email + SMS columns show **"Needs setup"** (no keys yet) with an explanatory banner.
- [ ] **Instant alerts** (push opt-in) → enable → trigger an event (sign a proposal / record a payment) → device gets a **push**.
- [ ] **Pricing** (`/settings/pricing`) and **Estimate template** (`/settings/estimate-template`) load and save.

## Journey 11 — Multi-tenant isolation (security — do not skip)
- [ ] Log in as **Account B** (second org). You should see **only B's** projects/subs/clients — none of Account A's.
- [ ] Grab a document ID or deal ID from Account A; confirm B **cannot** open it (no data, permission denied).
- [ ] A no-login token (portal/sign/sub) works **only** for its own project's data — never lists others'.

## Journey 12 — Mobile / responsive
- [ ] Narrow to phone width → **bottom tab bar** (Projects · Schedule · Subs · More); "More" opens the drawer (Clients, Contacts, Add-ons, Settings, Sign out).
- [ ] Projects, Schedule, Subs, and a project's tabs are all usable — no horizontal overflow. (Known rough spot: the quote editor still contains-scrolls on phones.)

---

## Comms delivery — only after external setup (see COMMS.md)
- [ ] **Email/SMS actually send** once SendGrid/Twilio keys are in Vercel — the "Needs setup" cues clear automatically.
- [ ] **SMS opt-out:** text STOP to the number → `sms_consent` flips false → no further texts to that sub.
- [ ] **Inbound email** (kill copy-paste) — not built yet; pending domain + design decision.
