# FrameFlow — Feature Inventory

Running list of every capability we've identified — shipped, in flight, blocked, requested, or sitting on the "What's possible" roadmap. The goal: pick what to build from one place, not from memory.

When something gets implemented, move its check to **✅** and add the implementing commit/branch.

## Status legend

- **✅ Shipped** — live on `estimate-upgrade` (and headed to `builder-app` when merged)
- **🚧 In flight** — partially built, branch carries it
- **⏳ Blocked** — waiting on an external party (1build sales reply, etc.)
- **📋 Requested** — explicitly asked for by Barry / in conversation, not started
- **💡 Roadmap** — sits on the in-app "Add-ons" gallery as future possibility

---

## A. Estimate engine — assemblies, costs, live edits

The core of FrameFlow's differentiator vs JobTread / Buildxact: quantity-based estimating that holds up during a live client conversation.

- **✅ Assembly engine** — formula-driven assemblies with parametric properties (Wall Length, Stud Spacing, Frame Material, etc.). Math matches 1build's API syntax.
- **✅ Formula evaluator** — sandboxed; handles UoM tokens like `LF`, `SF`, `EA`.
- **✅ Stub catalog** — 11 residential assemblies (framing × 3, foundation × 2, roofing, exterior windows/doors, millwork, finishes × 2).
- **✅ Smart-typed properties** — `number`, `choice` (numeric dropdowns like stud spacing), `option` (labeled like "Vinyl / Wood / Fiberglass").
- **✅ Cost formulas** — material/labor cost can scale with properties (one window assembly handles vinyl-vs-wood pricing).
- **✅ Live-editable assembly instances** — instance cards on the quote page; tweaking a property regenerates linked QuoteLines instantly.
- **✅ Assembly swap** — change the assembly type on an existing instance; matching property values carry over.
- **✅ Duplicate** — clone an instance for side-by-side what-ifs.
- **✅ Persistence** — instances persist on the Deal so they're still live-editable on reload.
- **⏳ 1build Cost Data API integration** — waiting on `help@1build.com` to reply with API key + pricing + residential assembly coverage. Architecture is already ready — swap the stub catalog for a live API source, UI and engine stay identical.

### Estimate gaps still open
- **📋 A-vs-B comparison header** — duplicate works, but no "Option A: $5,200 vs Option B: $4,850 (−$350 / −6.7%)" delta widget.
- **📋 Named whole-quote scenarios** — save the configuration as "Standard Spec" / "Premium Spec" / "Budget Spec", toggle between them.
- **📋 More catalog variety** — skylights, garage doors, plumbing fixtures, cabinetry, tile, electrical packages. Cheap to author in stubs; eventually 1build's catalog supersedes.
- **📋 Tax / contingency / general conditions lines** — the model is line-item with markup; no tax or contingency layer yet.
- **📋 Manual takeoff overlay** — upload a floor-plan PDF and trace walls/areas to feed assembly properties. The "Tier 2" path we discussed (vs the Tier-3 AI moonshot we said we'd skip).

---

## B. Sub coordination (Barry's recurring asks)

Sub-facing functionality. Some pieces already coded (uncommitted on `builder-app`), most not.

- **🚧 Sub schedule notifications (SMS)** — `lib/sms.ts`, `/api/sms` route, sub-schedule public page `/s/[token]`, weather banner, A2P 10DLC consent checkbox. Currently in the working tree on `builder-app`, also committed onto `estimate-upgrade`.
- **✅ Sub re-notify on schedule change** *(Barry)* — when a phase date moves (weather, materials delay, etc.), every assigned sub with SMS consent is auto-texted with the new dates. Date-change detection lives in `project-execution-panel.updateMilestoneDates`; the SMS body is composed by `composeRescheduleSms` and dispatched fire-and-forget.
- **📋 Subcontractor portal** *(Barry)* — sub-facing UI where a sub can see their assigned phases, dates, draws, RFQ status without logging into the GC's account. Likely a token-based no-login page (`/sub/[token]`), separate from the client portal we already have.
- **📋 Sub bidding portal** *(Barry)* — RFQ out to multiple subs of the same trade simultaneously, collect bids in one place, side-by-side compare. Pairs naturally with Sub Bid Intelligence (below).
- **💡 Sub Scheduling — Auto-notify & Conflicts** *(roadmap)* — T-7 / T-2 day SMS to subs, conflict detection across projects, weather-aware date shifts, per-sub performance scoring. Builds on the in-flight SMS work + the re-notify item above.
- **💡 Sub Bid Intelligence** *(roadmap)* — industry-benchmark comparison (RSMeans-style), historical-bid comparison, sub performance scoring, auto-flag bids missing scope. Pairs with the bidding portal.

---

## C. Bank / draw workflow (Barry's new ask)

Banks process construction draws differently — some want email + invoice PDF, some have online portals, some require lien waivers, some send inspectors. Today the app has one draw flow.

- **📋 Bank-specific draw process selector** *(Barry)* — research how lenders actually process draws, model the most common workflows, surface a dropdown per project: "Use [bank name]'s process." Example from Barry: one bank wanted an email with invoice attachments + total; others differ.
- **📋 Bank-process library** *(implied)* — knowledge base of common bank draw workflows (email vs portal upload vs in-person inspection), updatable as we hit more banks.
- **📋 Per-bank templates** *(implied)* — pre-built email bodies, attachment bundles, line-item summaries shaped to each bank's requirements.
- **📋 Lien waiver generation** *(implied)* — many banks require waivers with draws; auto-generate from sub bids + payment status.
- **✅ Photo / scan upload for invoices + receipts on a draw** *(Barry)* — `DrawAttachmentsSection` on the draw page: "Take photo" opens the phone's camera, "Upload file" accepts images or PDFs, each attachment is tagged Invoice or Receipt and linked to this milestone (`Attachment.milestone_ref`). Bytes are object-URL only today, persistent storage via Firebase Storage is the next layer.
- **📋 Persist attachment bytes via Firebase Storage** — wires the upload flow above to durable cloud storage so files survive sessions and device switches. Storage bucket env var already configured; needs SDK init + upload helper.
- **📋 Receipt OCR auto-fill (vendor / amount / date)** — see also Section I. Textract pipeline already in repo; bolts onto the upload flow.

> *Note: Barry said "a bank wanted me to send an email with invoice attachments and the total" — "me" = Barry, from his own experience.*

---

## D. Comms / inbox (Barry's pain point)

Things that surface what's happening in projects without Barry having to dig.

- **💡 Smart Notifications** *(roadmap)* — push / email / SMS the moment a client signs, deposit pays, milestone approves, sub bid arrives. Per-event routing, quiet hours, daily digest fallback.
- **💡 Email Digester** *(roadmap)* — connect inbox, AI sorts emails into projects, surfaces action items, drafts replies. Per-sub thread tracking auto-attaches RFQ responses to the bid table.
- **💡 Phone Call Summarization** *(roadmap)* — Twilio-powered per-project phone numbers; calls transcribed + summarized + action items auto-extracted into the project log.

---

## E. Financial intelligence

- **💡 Dynamic Finance Forecasting** *(roadmap)* — phase-level cost-vs-actuals, cash flow projection (when cash hits, when bills clear), cost overrun alerts, profit margin by phase/sub/project type.
- **📋 Project-level overall budget tracking** *(Barry)* — budget vs. committed vs. actual at the project level (not just line-item totals). Today each Deal carries roll-up totals from QuoteLines (`total_quote_value`, `total_cost`, `margin_percent`); a real budget view comparing original budget → commitments via sub awards → actual spend is missing. Foundation for the forecasting feature above.
- **📋 Projected vs. actual budget variance on invoices** *(older note)* — was an item on the historical TODO list; folded into the project-level budget tracking above.
- **🚧 QuickBooks sync — *mock today*** — the draw page has a "Sync to QuickBooks" button that generates fake invoice numbers; the code comments say "real QB sync is Q3 (OAuth flow + invoice push API)." Real integration needs Intuit OAuth, invoice/customer push via QBO API, and two-way payment sync. Open project; high value because QB is where most builders' books live.

## I. Payments & receipts (Barry's new ask)

Money in, money out, and the proof. Today FrameFlow has draws (outbound to client) and sub bids, but no actual *payment* records — checks written, cards run, deposits received are not tracked yet.

- **✅ Outgoing sub / supplier payment log** *(Barry)* — `PaymentsSection` on the deal page, "Record money out" button. Tags the party (Distributor lookup + free-text fallback), method (check + check #, CC, ACH, cash, other), date, optional milestone, optional notes. Lets the project show "Cano Concrete paid $32k via check #1247 on 4/16."
- **✅ Incoming client payment log** *(Barry)* — same panel, "Record money in" button. Tracks deposits / draw releases / retainers with method + date + optional milestone tie. Cash flow feed for forecasting.
- **✅ AR / AP basic rollup** *(implied)* — four tiles at the top of the panel: Money in, Money out, Net cash on project, "% collected of contract" (using `deal.award_total` or `deal.total_quote_value`). Per-sub aging buckets are a follow-up.
- **📋 Receipt / invoice photo capture** *(Barry — see also Section C)* — mobile camera attach for invoices, receipts, packing slips. Same pipeline whether it's a draw attachment or a sub-payment receipt.
- **📋 Optional OCR auto-fill** — feed photographed receipts through the existing Textract pipeline to extract vendor / amount / date and pre-fill a payment record. Half the typing eliminated.

---

## F. Materials sourcing

- **💡 Materials Sourcing Catalog** *(roadmap)* — search HD Pro / Lowe's Pro / local lumber yards, one-click add to estimate with category markup, save favorites + lists. The HD/Lowe's pricing piece could be unofficial scrapers (SerpApi/Apify) since neither has an official public API. **Notably overlaps with the 1build integration** — 1build covers material *catalog + assemblies + localized pricing* but doesn't surface live HD/Lowe's prices specifically.

---

## G. Project / client visibility

- **💡 3D Virtual Walkthrough** *(roadmap)* — convert floor plan to 3D, client-facing walkthrough link, material/finish overlays as selections are made. CubiCasa-style integration. Reduces change orders by letting the client see the house before ground-break.
- **📋 Excel / PDF export of the estimate** — currently a disabled "coming soon" button on the quote page. Standard ask.
- **📋 Floor-plan upload + AI structure pre-fill** — placeholder text on the empty estimate state already hints at this. Different from the Tier-3 AI-takeoff moonshot — this is "extract rooms/dimensions" for kicking off the estimate, not "produce a full materials list."

---

## H. Branding / product positioning (not features, but worth tracking)

- **✅ Renamed Buildline → FrameFlow** (name was taken)
- **📋 Decide on long-term product positioning** — what makes FrameFlow different from JobTread, Buildxact, etc. (Live-edit estimates with the client and bank-aware draws may be the wedge.)

---

## Priority order — to discuss

Once we have the list, the next step is to rank by:
1. **Barry-validated demand** (he asked for it directly)
2. **Effort vs. impact** (cheap wins first)
3. **Sequencing dependencies** (e.g., bidding portal probably wants sub portal foundation first)

Top of mind as natural next moves:
- A-vs-B delta widget (small, completes the live-estimate story)
- Bank-specific draw process — high-validation Barry ask, mostly research + templating
- Subcontractor portal — pairs with the in-flight SMS work
- 1build wiring (when they reply)
