# FrameFlow — Feature Inventory

Running list of every capability we've identified — shipped, in flight, scoped for v1, deferred, or sitting on the "What's possible" roadmap. The goal: pick what to build from one place, not from memory.

When something gets implemented, move its check to **✅** and add the implementing commit/branch.

> **Brand name pending.** "FrameFlow" was a rename from Buildline; FrameFlow turned out to also be taken (existing IT-monitoring company). Current finalists: **SiteJoint** and **Lapjoint** (both have clean .coms across all major TLDs and no construction-software conflicts). LLC formation + EIN sequence is gating Twilio brand registration.

## Status legend

- **✅ Shipped** — live on `estimate-upgrade` (and headed to `builder-app` when merged)
- **🚧 In flight** — partially built; specific work item open
- **🎯 v1 — committed** — agreed for first release; build before mobile pass
- **📅 Deferred — post-v1** — explicitly out of v1; revisit after first paying customers
- **⏳ Blocked** — waiting on an external party (1build sales reply, Twilio brand approval, etc.)
- **💡 Roadmap** — possibility for the in-app "Add-ons" gallery; not committed

---

## v1 scope lock

What ships in v1, what waits. Frozen 2026-05-24.

**v1 includes everything ✅ Shipped plus these 🎯 commitments:**
- Subcontractor portal — **max version** (one unified `/sub/[token]` for each sub, covering schedule view + bid submission + draw status + doc access + schedule acknowledgment + SMS-link entry points)
- Excel / PDF export of the estimate
- Tax / contingency / general conditions lines on estimates

**v1 does NOT include — deferred to post-v1:**
- Bank-specific draw process selector (revisit after Barry confirms which banks he deals with)
- Real QuickBooks OAuth integration (mock sync stays for v1)
- Named whole-quote scenarios (Standard / Premium / Budget)
- Manual takeoff overlay (trace PDF)
- 1build live cost API wiring (still waiting on their reply; stub catalog is v1)
- Email digester, phone call summarization, AI inbox features
- 3D walkthrough, materials sourcing catalog

**Rule:** anything Barry asked for directly is in v1 unless explicitly deferred (only bank-draw + real QB qualify for deferral).

**Sequence:** finish 🎯 v1 commitments → mobile-first redesign pass → PWA shortcut → resume feature work.

---

## A. Estimate engine — assemblies, costs, live edits

The core of the platform's differentiator vs JobTread / Buildxact: quantity-based estimating that holds up during a live client conversation.

- **✅ Assembly engine** — formula-driven assemblies with parametric properties (Wall Length, Stud Spacing, Frame Material, etc.). Math matches 1build's API syntax.
- **✅ Formula evaluator** — sandboxed; handles UoM tokens like `LF`, `SF`, `EA`. Safe-arithmetic-only validation prevents JS injection through assembly definitions.
- **✅ Stub catalog — 15 assemblies** — framing × 3 (exterior 2×6, interior 2×4, floor 2×10), foundation × 2 (strip footing, slab on grade), roofing, exterior (windows, doors), millwork (interior door), finishes × 2 (paint, hardwood), plus newly added: siding, stairs, gutters/downspouts, garage door.
- **✅ Smart-typed properties** — `number`, `choice` (numeric dropdowns), `option` (labeled like "Vinyl / Wood / Fiberglass" with cost multipliers).
- **✅ Cost formulas** — material/labor cost can scale via `unitCostFormula` and `laborCostFormula`.
- **✅ Live-editable assembly instances** — instance cards on the quote page regenerate linked QuoteLines instantly on property edits.
- **✅ Assembly swap** — change assembly type on existing instance; matching property names carry over.
- **✅ Duplicate** — clone an instance for side-by-side what-ifs.
- **✅ A-vs-B compare widget** — collapsible header above instance cards; shows Option A vs Option B totals + delta ($ / %) with color coding.
- **✅ Persistence** — instances stored on `Deal.assembly_instances`; survive reload.
- **✅ Floor-plan → assemblies** — "Create assemblies →" action on FloorPlanExtractor generates 12–14 starter instances pre-filled from extracted plan data (perimeter, sqft, foundation type, windows/doors count, stories, garage cars). Lives in `src/lib/assemblies/from-floorplan.ts`.
- **✅ Quote page collapse + compact** — cards collapsible with property-summary peek; line items table hidden by default behind toggle; sticky mobile Save bar.
- **⏳ 1build Cost Data API integration** — waiting on `help@1build.com` reply. Architecture is ready — swap stub catalog for live API source, UI/engine identical.

### v1 commitments
- **🎯 Tax / contingency / general conditions lines** — markup model exists; need tax + contingency + GC layer applied below the subtotal.
- **🎯 Excel / PDF export of the estimate** — currently a disabled "coming soon" button. Build it.

### Builder customization of assemblies (the "where am I wrong?" thread, 2026-05-25)

Settled premise: a curated catalog alone has a hard ceiling. Every custom builder has tribal knowledge (waste factors, regional pricing, bundled scopes, items they always include/exclude) we cannot anticipate. The tool that "almost works" is more frustrating than the tool that's clearly a starting point you finish yourself. Override-only customization (just unit costs) handles ~50% of tweaks; the other 50% needs structural changes — add/remove material lines, change waste %, add new properties, etc. So full customization is required for the magic, not optional. The risk is formula syntax being too engineering-heavy for non-technical GCs; the path through is AI-assisted authoring on top of the existing Anthropic SDK we already have.

Sequencing:

- **📅 V1.5: Org-scoped overrides** — builder can override unit costs, labor costs, waste % on their org's copy of a stock assembly. No formula editing. ~2 days. Highest-value, lowest-risk customization. Covers price tweaks ("my framer charges $1.20/SF") without exposing math.
- **📅 V1.6: Material line add/remove** — list editor on each assembly's materials. Builder can append a new line (vapor barrier, sound-board) or remove one (underlayment rolled into carpet). Picks materials from a curated material picker with `unitCostUsd` + `laborCostUsd` fields; no formula needed for the add. ~2 days.
- **📅 V2: AI-assisted formula authoring + new-property creation** — plain English → formula via Claude, with preview + sanity check ("you've got SF on the left but multiplied by a LF rate — fix?"). The "make it really mine" tier; lets builders create entirely new assemblies. ~5 days. Gates on Anthropic API spend being acceptable at builder scale.
- **📅 V2.5: Share custom assemblies between builders** — marketplace dynamic; revisit when there are 5+ paying builders authoring meaningful catalogs.

The curated catalog (today) is the scaffold every builder builds on top of, not the destination. Author ~25–30 stock assemblies covering Barry's typical custom build, then layer V1.5/V1.6 on after the mobile pass.

### Deferred / future
- **📅 Named whole-quote scenarios** — save the configuration as "Standard Spec" / "Premium Spec" / "Budget Spec"; toggle between them.
- **📅 More catalog variety** — skylights, plumbing fixtures, cabinetry, electrical packages. Flooring coverage (hardwood / carpet / LVP / laminate / tile) shipped 2026-05-25. Cheap to author in stubs; eventually 1build supersedes the price layer (not the formula layer — see below).
- **📅 CMU foundation wall assembly** — Maddox list shows 1191 8×8×16 blocks; current catalog maps basement to strip footing without the wall.
- **📅 Drywall + insulation as standalone assemblies** — currently bundled in wall assemblies. Maddox lists them separately; useful for remodels where walls already exist.
- **📅 Manual takeoff overlay** — upload floor-plan PDF, trace walls/areas to feed assembly properties. Tier 2 (not the Tier 3 AI-takeoff moonshot we skipped).

### Note: what 1build provides vs. what we provide
1build is a Cost Data API — material/labor unit costs by location, RSMeans-style. They have "Sources" that approximate flat assemblies but no parametric formula layer. The relationship between a property (Wall Length) and a quantity (number of studs) is FrameFlow's logic, not theirs. When 1build wires up, swap `unitCostUsd` from hardcoded to a `lookup1Build()` call; UI + engine + formula structure stay identical. So formula authoring work — both ours and eventual builder-authored — is not wasted by the 1build integration.

---

## B. Sub coordination

Sub-facing functionality. Most of the SMS work landed this session.

- **✅ Sub schedule notifications (SMS)** *(Barry)* — `lib/sms.ts`, `/api/sms` route, sub-schedule public page `/s/[token]`, weather banner, A2P 10DLC consent checkbox on Distributor.
- **✅ Sub re-notify on schedule change** *(Barry)* — when a phase date moves, every assigned sub with SMS consent gets auto-texted with the new dates. Date-change detection in `project-execution-panel.updateMilestoneDates`; SMS body via `composeRescheduleSms`.
- **✅ SMS STOP/HELP inbound webhook** — `/api/sms/inbound` handles A2P 10DLC compliance keywords (STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT and HELP/INFO) with branded TwiML replies. Twilio request signature verified via HMAC-SHA1 + timing-safe compare. Firestore consent-flip is the one TODO (needs firebase-admin SDK on the server, not blocking).
- **✅ SMS C-ready architecture** — `OrgSettings.sms_config` schema field + `sendSms(to, body, { fromNumberHint })` client + `TWILIO_ALLOWED_FROM_NUMBERS` whitelist on the route. Migration from shared platform number (Option A) to dedicated per-builder numbers (Option C) is now a config write, not a deploy.

### v1 commitments — unified "max sub portal"

One URL per sub (`/sub/[token]`) covering everything they need from a GC, no login required. Every existing SMS (assign, reschedule, RFQ send, draw status) carries that token link as the entry point.

- **🎯 Sub schedule view** *(Barry)* — phases assigned to this sub across all of the GC's active projects, with dates, addresses, status. Lands here from the assignment + reschedule SMS texts.
- **🎯 Sub bid submission** *(Barry)* — when the GC sends an RFQ, the sub gets an SMS with a link to `/sub/[token]/bid/[rfqId]` where they review scope, enter a bid amount, attach supporting docs, and submit. Bids land back in the GC's RFQ panel for side-by-side compare.
- **🎯 GC-side RFQ compare** *(Barry)* — existing `RFQPanel` extended: see bids as they arrive, compare side-by-side, award the winner, push to estimate. Most of the scaffold exists; needs polish + the bid-submission-from-sub-side wiring.
- **🎯 Draw status view (sub side)** — what they've been paid, what's pending, links to invoice docs they've uploaded.
- **🎯 Document access (sub side)** — their bid PDF, awarded scope, any change orders that affect their work.
- **🎯 Schedule acknowledgment** — confirm a phase they're scheduled for, or flag a conflict (drives a notification back to the GC).
- **🎯 T-7 / T-2 reminder SMS cadence** *(scheduling extension)* — auto-SMS the assigned sub one week before and two days before their phase starts. Builds on the existing SMS pipeline + `composeRescheduleSms` patterns.

### Multi-channel notification strategy (2026-05-25 thread)

Settled premise: SMS is the gold-standard channel for sub notifications (~99% delivery, ~90% open within 3 min), but A2P 10DLC compliance is gated by LLC + EIN + Twilio Brand approval. While that's in flight, we want a reliable + highly-visible notification path that ships *now*.

The realistic alternatives don't match SMS on both axes:
- **Email** — reliable delivery but ~30-50% open rate, hours-to-days; everyone has it; zero compliance lift
- **Web push (PWA)** — native-alert visibility (banner / lockscreen / sound, OS-rendered, identical to native-app notifications); free per-message; **but** on iPhone requires the sub to install the PWA to home screen + grant permission first
- **WhatsApp / Phone IVR / In-app only** — non-starters for various reasons (adoption / disruption / engagement-gated)

Planned sequencing:
- **📅 Email-channel fallback** — same compose helpers, swap carrier. Sends when SMS isn't available (no consent, no valid phone, no A2P brand yet). Universal long-tail.
- **📅 Web push on PWA install** — once a sub installs the FrameFlow portal to home screen, prompt for push permission and use it for future assignment / conflict / reminder notifications. Replaces SMS for the engaged tier; free + reliable for installed users.
- **🎯 SMS as primary once A2P clears** — after LLC + EIN + Twilio Brand approval (the gating sequence already on the pre-launch list), flip SMS to primary. Email + web push become the backup channels.

Net: ship email + PWA push as the pre-A2P notification stack; SMS becomes the upgrade. Multi-channel is permanent — different channels are better for different message types (push for instant alerts, email for digestible summaries, SMS for "must reach this person now").

### Deferred / future
- **📅 Cross-project conflict detection** *(roadmap)* — flag when a sub is double-booked across GCs or across this GC's projects. More complex than the v1 self-service flag.
- **📅 Weather-aware date shifts** *(roadmap)* — auto-shuffle phases when forecast shows multiple rain days.
- **📅 Email-channel notification fallback** — universal channel for subs without SMS consent or valid phone. ~½ day; same compose helpers + a fetch swap.
- **📅 Web push on PWA install** — native-alert delivery for subs who've installed the portal home-screen shortcut. Free per-message, replaces SMS for engaged tier. ~1 day for the service worker + push subscription plumbing.
- **💡 Sub Bid Intelligence** *(roadmap)* — RSMeans-style benchmark comparison, historical-bid comparison, sub performance scoring, auto-flag bids missing scope.

---

## C. Bank / draw workflow

Banks process construction draws differently — some want email + invoice PDF, some have online portals, some require lien waivers, some send inspectors. Today the app has one draw flow.

- **✅ Photo / scan upload for invoices + receipts on a draw** *(Barry)* — `DrawAttachmentsSection` on the draw page: "Take photo" opens the phone camera, "Upload file" accepts images or PDFs, each attachment tagged Invoice or Receipt and linked to a milestone (`Attachment.milestone_ref`).
- **✅ Persistent attachment storage via Firebase Storage** — uploads land in `attachments/{dealId}/{recordId}-{filename}` with permanent download URLs; survive reload + device switch. Multi-tenant `storage.rules` gate read/write on the caller's org_ref matching the parent deal's org_ref.
- **✅ Receipt OCR auto-fill** — Textract synchronous AnalyzeDocument on PaymentsSection's "Scan receipt" button extracts vendor / amount / date and pre-fills the payment form. Confidence banner above the inputs labels what was filled.

### Deferred / future
- **📅 Bank-specific draw process selector** *(Barry — deferred)* — research how lenders actually process draws, model common workflows, surface dropdown per project. Waiting on Barry's list of banks he actually works with.
- **📅 Bank-process library** *(implied)* — knowledge base of common bank draw workflows (email vs portal upload vs in-person inspection).
- **📅 Per-bank templates** *(implied)* — pre-built email bodies, attachment bundles, line-item summaries shaped to each bank's requirements.
- **📅 Lien waiver generation** *(implied)* — auto-generate from sub bids + payment status.

---

## D. Comms / inbox

- **💡 Smart Notifications** *(roadmap)* — push / email / SMS the moment a client signs, deposit pays, milestone approves, sub bid arrives. Per-event routing, quiet hours, daily digest fallback.
- **💡 Email Digester** *(roadmap)* — connect inbox, AI sorts emails into projects, surfaces action items, drafts replies.
- **💡 Phone Call Summarization** *(roadmap)* — Twilio-powered per-project phone numbers; calls transcribed + summarized + action items auto-extracted into the project log.

---

## E. Financial intelligence

- **✅ Project-level overall budget tracking** *(Barry)* — `BudgetPanel` on the deal page (Finances tab) pulls quote lines + approved change orders + awarded RFQ winning bids + outgoing payments to show Budget / Committed / Spent / Remaining tiles plus a spend-pace bar with color tiers.

### Deferred / future
- **📅 Real QuickBooks sync** *(deferred)* — the draw page has a mock "Sync to QuickBooks" button that generates fake invoice numbers. Real integration needs Intuit OAuth, invoice/customer push via QBO API, two-way payment sync. ~1 week of work; deferred until v2.
- **💡 Dynamic Finance Forecasting** *(roadmap)* — phase-level cost-vs-actuals, cash flow projection, cost overrun alerts, profit margin by phase/sub/project type.

---

## F. Materials sourcing

- **💡 Materials Sourcing Catalog** *(roadmap)* — search HD Pro / Lowe's Pro / local lumber yards, one-click add to estimate with category markup, save favorites + lists. Overlaps with 1build (which covers catalog + assemblies + localized pricing but not live retail prices).

---

## G. Project / client visibility

- **✅ Floor-plan upload + AI structure pre-fill** — `FloorPlanExtractor` uses Claude vision to extract total_sqft, rooms with dimensions, foundation_type, exterior_wall_type, doors/windows counts, garage_cars, stories, etc. from a PDF. Renders post-extract UI with ambiguity flags; persists onto the Deal.
- **✅ Deal page split into tabs** — Overview / Schedule / Finances / Files / Quote — each a real sub-route under `/deals/[id]/...`. Shared chrome via `DealPageShell` (back link + header + tab nav). Eliminates the 10-stacked-panels page.

### v1 commitments
- **🎯 Excel / PDF export of the estimate** — (see also Section A) — must actually export a usable file the builder can email or hand to a lumber yard.

### Deferred / future
- **💡 3D Virtual Walkthrough** *(roadmap)* — convert floor plan to 3D, client-facing walkthrough link, material/finish overlays. CubiCasa-style.

---

## H. Branding / product positioning

- **✅ Renamed Buildline → FrameFlow** (name was taken; FrameFlow ALSO turned out taken — see top of this doc).
- **🚧 Decide on final product name** — finalists: SiteJoint, Lapjoint. Decision gates LLC formation, EIN, Twilio brand registration, domain purchase, email forwarder setup. See conversation transcripts for full availability checks.
- **🚧 LLC formation + EIN** — pending name decision. Wyoming or New Mexico LLC at ~$150 + free EIN online at IRS.gov.
- **📋 Long-term product positioning** — live-edit estimates with the client + sub-aware schedule + bank-aware draws are the wedge against JobTread / Buildxact / BuilderTrend.

---

## I. Payments & receipts

Money in, money out, and the proof.

- **✅ Outgoing sub / supplier payment log** *(Barry)* — `PaymentsSection` on the deal page, "Record money out" button. Tags party (Distributor lookup + free-text fallback), method (check + check #, CC, ACH, cash, other), date, optional milestone, optional notes.
- **✅ Incoming client payment log** *(Barry)* — same panel, "Record money in" button. Tracks deposits / draw releases / retainers.
- **✅ AR / AP basic rollup** *(implied)* — four tiles: Money in, Money out, Net cash on project, "% collected of contract." Per-sub aging buckets a future addition.
- **✅ Receipt photo capture** *(Barry)* — covered by `DrawAttachmentsSection` (Section C) and the "Scan receipt" action on the payment form.
- **✅ OCR auto-fill** — Textract pipeline extracts vendor / amount / date and pre-fills the payment form; confidence banner labels what was filled.

---

## J. Mobile + PWA

Identified 2026-05-24 — the app's current mobile experience is poor across all pages (compact text, sidebar eats screen, tables overflow, thin columns, tap targets too small). Locked features → focused mobile pass is the agreed plan.

### v1 commitments
- **🎯 Mobile-first redesign pass** — focused 1-week pass covering: sidebar → off-canvas drawer with hamburger; typography scale at 360px; tap targets ≥44pt; tables → responsive cards on phone; bottom sheets for property editors on phone; sticky bottom action bars where useful. Single audit-and-fix sweep across all pages, not incremental.
- **🎯 PWA shortcut (manifest + icons + iOS install hint)** — turn the app into an installable home-screen icon on iPhone and Android. ~1 hour: `app/manifest.ts`, apple-touch-icon, iOS meta tags, one-time iOS install banner. iOS shortcut works (manual Add to Home Screen via Share); Android gets the auto-install banner.

### Deferred / future
- **📅 Offline support via service worker** — separate from the install-as-shortcut piece. Caches read-only screens; useful for builders in the field with spotty signal. ~½ day post-mobile-pass.
- **📅 Web push notifications** — iOS 16.4+ supports them post-install; SMS via Twilio covers the same need today.
- **💡 Capacitor / native wrapper** — only if app-store presence eventually matters. PWA covers 80% of the value first.

---

## K. Architecture & infrastructure

Cross-cutting work that lands behind the scenes.

- **✅ Tab-strip + sub-routes for deal page** — `/deals/[id]` is the Overview; sister routes `/schedule`, `/finances`, `/files` each render their own focused panel set. Shared `DealPageShell` handles header + tab nav.
- **✅ Firebase Storage persistence** — attachments + photos now live in real Storage with `storage_path` on records. Best-effort delete cleans up Storage when records are removed.
- **✅ Multi-tenant Storage rules** — `storage.rules` deployed pattern mirrors `firestore.rules`: caller's org_ref must match parent deal's org_ref. Deploy with `firebase deploy --only storage:rules`.
- **✅ SMS C-ready Option A → Option C migration path** — see Section B; whitelist-gated per-org from-number override.

### Deferred / future
- **📅 firebase-admin server SDK** — needed for inbound SMS to flip `sms_consent` to false on STOP, and any other server-side Firestore writes that can't trust client auth. ~1 day setup (service account credentials, env var, helper module).
- **📅 STOP/HELP webhook → Firestore consent flip** — currently the inbound webhook logs the event and responds with branded TwiML; Twilio enforces STOP at carrier level so subs are protected. The DB consent flip (so our UI shows "opted out") needs the firebase-admin work above.

---

## Sequence of work

### Now → v1 launch

1. **Verify shipped features** (~½ day) — inline line-item edits on `/quote`, add-blank-line, add-assembly flows, AttachmentsCard parse pipeline end-to-end with real data.
2. **🎯 Tax / contingency / GC lines** (~½ day) — Section A.
3. **🎯 Excel / PDF export of estimate** (~1 day) — Section A / G.
4. **🎯 Max sub portal** (~5 days) — Section B. Unified `/sub/[token]` with schedule view, bid submission, draw status, doc access, schedule acknowledgment. Absorbs the standalone "sub bidding portal" item — bids land inside the same portal.
5. **🎯 T-7 / T-2 reminder SMS cadence** (~½ day) — Section B. Auto-SMS the week before and two days before each scheduled phase.
6. **🎯 Mobile-first redesign pass** (~5 days) — Section J.
7. **🎯 PWA shortcut** (~1 hour) — Section J.

### Pre-launch infrastructure
- Lock product name (SiteJoint / Lapjoint / other)
- Form LLC + apply for EIN
- Buy domain + set up email forwarder
- Register Twilio Brand under the LLC; submit Campaign for A2P 10DLC
- Configure Vercel custom domain + production env vars

### Post-v1 (do not start before mobile pass)
- Bank-specific draw process selector + bank library + per-bank templates + lien waivers (Section C)
- Real QuickBooks OAuth integration (Section E)
- Named scenarios, more catalog variety, CMU foundation, standalone drywall/insulation (Section A)
- firebase-admin SDK + STOP-consent flip (Section K)
- Twilio Trust Hub ISV program application → per-builder dedicated numbers migration (Section B)
- Offline support via service worker (Section J)
- 1build live cost integration when their key lands (Section A)
- Comms/inbox features, materials sourcing, 3D walkthrough (Sections D, F, G)
