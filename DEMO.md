# Builder Demo — Walkthrough Script

_For Barry. ~30–40 minute demo. Branch: `builder-app` on var-web-app._

## Pre-demo setup (5 min, do before Barry shows up)

- [ ] Dev server running: `npm run dev` in `var-web-app` → http://localhost:3000
- [ ] Sign in (login screen on first load)
- [ ] On empty pipeline: click **"Try with sample data"** → wait 5–10s → 5 builder projects appear
- [ ] Open the **Maddox — Country Dream House** project in a tab; it has full milestones populated
- [ ] Have **Maddox Floor Plan.pdf** open in Downloads, ready to drag
- [ ] Open the **portal preview** in a second tab (`/deals/{maddoxId}/portal`) — for the cross-tab approval moment
- [ ] Optional: have a stopwatch ready for "I bet this takes you ~2 hours today"

If sample data already loaded from prior demo, skip the "Try with sample data" step.

## Frame the demo (2 min)

Open with the Maddox project visible. Don't click yet.

> *"Barry, you mentioned a few pain points: assembling estimates from scratch, the QuickBooks-screenshot draw request flow, tracking which subs are bidding what. I want to walk through how a project would flow through this tool start to finish. We'll use a real plan and a real customer — Brennan's house — so you can react to actual data rather than imagining it."*

> *"This isn't a sales pitch. I'd like to know which of these features would save you the most time, and what's missing that would matter to you."*

## Section 1 — Pipeline (2 min)

**Click**: top-left logo → `/deals` (Project Pipeline)

Talk track:
- Builder-friendly stage columns: Lead → Estimating → Estimate Sent → Contract Signed → Pre-Construction → In Progress → Complete / Lost
- Drag a card between columns to update stage (do this once with the Wilson lead → Estimating)
- Each card shows estimate vs. contract value depending on stage
- Project type badge (Custom Home, Remodel, Addition, Spec Build)

Pivot to Maddox card.

## Section 2 — New Project (2 min, optional)

If Barry's curious how a new project starts:
- **Click**: New Project button → modal opens
- Show: Project name, Client dropdown, Project type (Custom Home / Remodel / Addition / Spec Build), Job number, Estimate type (Detailed Estimate vs Ballpark / Budget), Target start
- **Cancel** out — don't actually create one. Use existing Maddox.

## Section 3 — AI Floor Plan Extraction (5 min — first wow moment)

**Click**: Maddox project card → project page loads.

Top of page: **"AI Floor Plan Extraction"** card (amber gradient, sparkle icon).

> *"You said takeoffs are one of your biggest time sinks — drop a plan, AI reads it. Verify before quoting. Watch."*

- **Drag**: Maddox Floor Plan.pdf onto the upload area
- **Click**: Extract → progress bar slides for 10–15s ("Reading plan…")
- Extraction renders: editable fields (Total sqft, Bedrooms, Full baths, Half baths, Garage sqft, Porch sqft) + room list + AI flagged ambiguities + estimate preview
- Confidence pill ("HIGH confidence" or "MEDIUM" depending on plan)

> *"You verify before quoting — that's the contract. The room list expands to show every room dimension AI pulled. If anything looks off, fix it here. Then…"*

- **Click**: Apply to estimate → routes to estimate page with 17 line items pre-filled

## Section 4 — Project Estimate (4 min)

- 17 line items grouped: Site Work, Foundation, Framing, Exterior, MEP Rough-In, Drywall & Insulation, Finishes, Soft Costs
- Stats at top: Line Items / Total Cost / Estimate to Client / Profit Margin
- Edit a row to show how cost + markup % drives customer price
- Save button shows green "Saved" pill (no pending state)

> *"This is the structured starting point — you tune costs and markups before sending. The math behind every line is cost + your markup, not list-discount-markup like the GSA quoting tools."*

**Back to project**: click breadcrumb (project name)

## Section 5 — Schedule + Draws (5 min — the depth moment)

Scroll past Floor Plan card to **Project Schedule + Draws** panel.

In the Maddox sample data:
- 9 milestones, Deposit + Foundation + Framing already paid (released)
- Dried-In is **In Progress** (current draw window)
- Rest are pending

Tour the panel top-to-bottom:

1. **Header**: "3 of 9 milestones complete · $507,500 of $1,450,000 paid"
2. **Schedule Timeline** (proportional by $): horizontal bar with green/teal segments showing what's paid vs pending
3. **Gantt chart**: month axis at top, status-colored bars positioned by date, "Today" red line in the Dried-In phase
4. **Milestone list**: each row has status icon, name, status pill, % + $ amount, action buttons + Draw request link

Click any historical milestone's **Draw request** link → opens the AIA-style document in a new tab. Show:
- Application for Payment, Draw # X
- Contractor block (your business info from settings) and Owner block (Brennan + project address)
- Summary box: contract sum, completed to date, less previous payments, this draw, completion %
- Schedule of Values table — every phase, with current draw highlighted amber
- Contractor + Owner certification text + signature blocks
- Footer

> *"Right now you screenshot QuickBooks and email Brennan. Brennan forwards to the bank. With this, click 'Draw request' — bank-ready document. 'Email to client' opens your email with the portal approval link prefilled."*

Click **Email to client** → mailto: opens with prefilled subject + body. **Cancel** out — don't actually send.
Close the draw tab.

## Section 6 — Cross-tab approval (3 min — the second wow moment)

Back on the project page, find the Dried-In milestone (status: In Progress).

- **Click**: Mark complete (request draw) → status flips to "Awaiting Approval"
- Schedule timeline + Gantt update live to reflect the new state

**Switch to the portal tab** (the one you opened pre-demo). Refresh.

The portal now shows:
- Hero: "Maddox — Country Dream House" / "Boerne address" / "Pre-Construction"
- Big progress bar showing % complete
- **"Awaiting your review"** callout with the Dried-In milestone + a **Review & approve** button
- Milestone list with paid phases (green dots) and pending ones
- Payment summary: contract / paid / remaining
- Build photos section

> *"Brennan sees this. He clicks Review & approve, confirms the $145,000 draw…"*

- **Click**: Review & approve → confirm dialog → status flips to Approved

**Back to GC tab**, refresh project page:
- Dried-In is now Approved
- Action buttons changed to "Mark paid"
- **Click**: Mark paid → flips to Released
- Gantt segment darkens to deepest emerald
- Totals update: $652,500 paid

> *"That whole loop took 30 seconds. Today it takes you what — an hour? Two? Across the email back-and-forth?"*

## Section 7 — Photos by phase (2 min)

Scroll to **Project Photos** panel.

If the Maddox project has photos (you may need to drop a few in pre-demo for visual richness):
- Filter chips at top: All / Site Work / Foundation / Framing / etc.
- Photos organized by phase with phase badges and dates
- Click a photo → full-screen lightbox

If empty, demonstrate uploading 1–2 test photos:
- Pick "Foundation" in upload phase dropdown
- Drag in any image (your phone, a stock construction photo, whatever)
- Photo appears in gallery with phase tag

> *"Your client scrolls through their build chronologically. Phase by phase. We've seen this single feature drive more referrals than anything else."*

## Section 8 — Subcontractor RFQs (3 min)

Scroll to **Subcontractor RFQs** panel.

- **Click**: New RFQ → modal opens
- Fill in: Scope title ("MEP rough-in"), Phase (MEP Rough-In), Description ("Plumbing + electrical + HVAC rough complete with inspections")
- Multi-select subs from the directory: check Quick-Sparks Electric, Texas Plumb Pros, Comfort HVAC
- **Click**: Send to 3 subs → RFQ saved with status "Out for bid"
- The RFQ now appears in the list

Reopen it to show the **Bid responses** table — each sub gets a row, you enter their bid amount + notes as they come back. Type a few bids, then click **Award** on the lowest.

> *"You currently text or call subs and write bids in a notebook. Here, you enter the bids as they arrive, low bid auto-sorts, click Award and the project knows who's locked in."*

## Section 9 — AI Project Q&A (3 min — second AI wow)

Right column of the project page: **"Ask the project AI"** card.

Click one of the suggested questions: *"Where's our margin coming from?"* — wait 5–8s for the response.

> *"The AI knows everything about THIS project — your line items, your milestones, your photos. It cites which phase it's pulling from."*

Try a follow-up:
- *"How much did we spend on framing vs. budget?"*
- *"When is dried-in supposed to finish?"*
- *"What still needs to happen before the next draw?"*

Each answer is grounded in the actual project data, with phase / line item citations.

## Section 10 — Roadmap (3 min — communicates platform momentum)

**Click**: Sidebar → Roadmap

Show 7 feature cards:
- Email Digester (Q3) — click to expand → preview shows lane-based inbox with Action Needed, Awaiting Reply, Auto-handled
- Phone Call Summarization (Q3) — preview shows AI-transcribed call entry with action item flag
- Materials Sourcing Catalog (Q4) — HD/Lowe's/local price comparison
- Dynamic Finance Forecasting (Q4) — cash flow chart + cost-vs-actuals alerts
- Sub Bid Intelligence (Q4) — benchmarks against industry + your history
- 3D Virtual Walkthrough (Q4) — client walks the house from their phone
- Lead Generation (Q1 2027) — referral tracking + marketplace

> *"Anything on this roadmap you'd want fast-tracked? We prioritize based on who's paying for what."*

## Section 11 — Pricing + close (3 min)

Bring up pricing on whiteboard or screen:

| Tier | Features | Monthly |
|---|---|---|
| Starter | CRM + Projects + Estimate + Customer Portal + Draw Requests | **$300–500/mo** |
| Pro (when AI features ship) | + AI Q&A + AI extraction (already live!) + RFQs + Photos | **$700/mo** |
| Premium (Q3/Q4 feature ship) | + Email Digester + Phone Logs + Sourcing + Forecasting | **$1.2k–2k/mo** |

Setup fee: $1,500 (covers your data load, branding, sub directory import)

> *"Today I'd offer $1,500 setup credited toward your first month + $400/mo for what's working today. When the AI features ship for production, you stay grandfathered. If you sign as a design partner this week, $500 of the setup fee gets credited if you give us 3 referrals to other builders in your network."*

## Wrap-up questions (5 min)

1. *"What was the most useful piece of what I showed you?"*
2. *"What's missing that would actually matter for your day-to-day?"*
3. *"If you imagine this rolled out across the next Brennan-style project — the new house you take on after this one — what would it save you each week?"*
4. *"Are there any other custom builders in your network who'd want to see this?"*

## After the demo

- [ ] Send Barry a follow-up email with the recording (if recorded) and the design partner offer in writing
- [ ] If yes — get the design partner fee in writing before any further build
- [ ] Update STRATEGY.md with the outcome (signed / wait-and-see / pass) so future planning reflects reality
- [ ] If yes — Maddox project becomes the official anchor; ask Barry about migrating his other 1–2 projects in the next session

---

## Key things NOT to do

- ❌ Don't promise the AI takeoff is more accurate than it is. Always frame as "smart starting point, you verify."
- ❌ Don't promise the floor plan parser handles complex commercial drawings — Maddox plan is residential-friendly.
- ❌ Don't quote price for Premium-tier features as if they're available today (they're roadmap).
- ❌ Don't skip the cross-tab approval moment — it's the second wow, after AI extraction.
- ❌ Don't show 11 features at the same depth — depth on AI extraction, AI chat, draw flow, and portal approval. The rest are scan-and-move-on.

## Things to listen for during the demo

- Anything Barry says "yeah I do that" or "that would help" → write it down. That's a signal.
- If Barry asks about a specific feature ("can it do X?") and X is on the roadmap → click into that roadmap card immediately.
- If Barry asks about something NOT on the roadmap → write it down, ask if it's a top-3 pain or a nice-to-have.
- If Barry's quiet for too long → ask "what's going through your head?" Long silences = either confusion or skepticism. Either is useful information.
