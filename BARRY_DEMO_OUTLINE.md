# Barry walkthrough — casual outline

_For Thursday night. 30-45 min, casual tone, not a pitch. Goal: show him
where the app's at, surface what he'd actually use, get his feedback on
gaps. The longer pitchy version lives in `DEMO.md` — use this one._

---

## Before he shows up (~5 min)

- Open `https://var-web-app-cmadd123-cmadd123s-projects.vercel.app` in
  Chrome on desktop
- Sign in (Google works)
- If the pipeline is empty or stale, hit **Projects** → **Reset to
  demo data** → confirm. ~10 sec to repopulate with 6 projects
  including Maddox Country House mid-flight.
- Open the **Maddox Country House** project in a second tab so the
  click-in is instant. Have the Overview tab loaded.
- Have your phone unlocked with Messages + Mail open in case the
  notification demo lands.
- Close everything else for screen-share cleanliness.

## Frame it (1-2 min)

- "Wanted to show you where this is now — not selling you on it,
  just want your read on what would actually save you time."
- "Built around the way you said custom builds flow — lead, estimate,
  contract, build, draws. I'd love your reactions where stuff matches
  reality and where it doesn't."

## Pipeline tour (3-5 min) — projects across stages

- Show the kanban — 7 stages, projects spread across them.
  - Maddox (Pre-Construction, the anchor)
  - Hunter (Estimating)
  - Wilson (Lead)
  - Reyes (Estimate Sent)
  - Webb (Contract Signed)
  - Patel (Complete)
- Drag the Wilson lead → Estimating. _"Stage moves are just drag,
  no clicks-into-form."_
- Project type badge on each card (Custom Home, Remodel, Addition,
  Spec Build).
- Point at the count + $ per column.

## Click into Maddox (2 min) — orient

- Overview tab loads.
- Big "Open quote editor →" card at top — the everyday entry point.
- Project Details card: client, type, lead contractor, contract #,
  schedule, targets, totals.
- Notes card on the right — quick scratchpad for the GC.
- Next-action card adapts per stage — points at the thing that needs
  doing.

## Quote editor — the heart (8-10 min)

- Click **Open quote editor**.
- Live totals header — Lines, Total Cost, Estimate to Client, Margin.
- **Tap Client View toggle (eye icon).** Cost + Margin columns
  disappear instantly. _"Turn the laptop toward the homeowner."_
  Tap again to bring them back.
- **Scenarios bar** at the top — save the current state as
  "Standard Spec" / "Premium Spec" etc. Build A vs B comparisons.
- **Assemblies panel** — the differentiator vs. spreadsheets:
  - Click into a foundation assembly. Show the property grid:
    Wall Length, Foundation Type, Slab Thickness.
  - Edit one property → watch line items regenerate live below.
  - Highlight the formula evaluator under the hood — material +
    labor formulas, waste %, real costs.
- **Line items table** — 20 lines grouped by phase: Foundation,
  Framing, Dried-In, MEP, Drywall, Finishes, Punch.
  - Search box, phase tinting on rows, inline edit on qty / unit
    cost / markup.
  - Per-line margin colored green/sky/red.
- **Soft costs panel** at the bottom — tax, contingency, GC overhead
  on top of subtotal. _"Markup is per-line; this is where you cover
  the rest."_
- **Add new assembly** modal — 15+ stock assemblies in the catalog
  (foundation, framing, roofing, windows, doors, finishes, etc).
- Mention: **Export CSV** (works today). **PDF proposal** lives on
  the Proposal page — print-to-PDF from the browser. Real PDF
  download button is a quick add later.

## Schedule + subs (5-7 min)

- Back to project → **Schedule** tab.
- Top header card: Released / Approved / Contract dollar tiles.
- **ScheduleTimeline** strip — colored segments per phase, % weighted.
- **Gantt chart** below it — phases laid out on calendar, today line.
- **Weekly view** below Gantt — _"This is the view that actually works
  on your phone in the field. Each card = one week, who's assigned,
  what's planned."_
- Scroll to milestone list — 9 phases for Maddox (3 paid, 1
  in-progress, 5 pending).
  - Click a phase → assign subs (Cano Concrete, Hill Country Framing,
    etc.). Subs picker shows tradename.
  - **Tap Assign on Quick-Sparks Electric for the MEP phase.**
    _"That sub just got a text + email + push if they have it
    installed. Watch."_
  - Open your phone — show the SMS landing in real-time.
- Click a paid milestone (Deposit / Foundation / Framing) →
  draw page → invoice + receipt attachments, payments tied to it.

## Finances tab (3-5 min)

- Estimate Summary at top — cost, client, margin tiles.
- **Budget panel** — Budget vs Committed vs Spent vs Remaining,
  spend-pace bar.
- **Change orders panel** — collapsible; one approved CO seeded.
- **Payments section**:
  - 3 incoming client draws ($72K + $145K + $290K)
  - 3 outgoing sub payments (Cano $95K, Framing $175K, Lumber $48K)
  - Rollup tiles: in, out, net, % collected
- **RFQ panel** — open flooring RFQ with 2 bids in (Boerne Lumber
  $68K vs Hill Country Framing $72K). Side-by-side compare. Award
  button pushes the winner into the estimate as a line item.

## View as client (2 min) — the wow

- Top-right of project header → **"View as client"** button.
- Loads the homeowner portal: schedule with photos, payment status,
  draw progress, signed proposal.
- _"This is exactly what Brennan would see. No login required —
  you send him a link, he opens it on his phone."_
- Photos timeline if any seeded.

## Sub side preview (3 min, if time)

- Back to a project → **Subs & Suppliers** in sidebar.
- Click a sub → **Preview portal**.
- Shows what the sub sees on their no-login portal:
  - Schedule of phases they're on across all your projects
  - Awarded RFQs / scopes
  - Outstanding payments
  - Confirm phase / flag conflict buttons
- _"Same link they tap in the assignment text. No app to install,
  no account to remember."_

## Wrap + questions for him (5-10 min)

Bring up:
- "What's your current estimate flow? Spreadsheet, Buildertrend,
  paper?"
- "What banks do you work with for construction loans? We've left
  bank-specific draw flows for after we know your real list."
- "How many subs do you regularly invite for bids? We're capping
  at... actually no cap, but want to make sure the RFQ scope size
  matches reality."
- "Do you use QuickBooks? Real two-way sync is on the roadmap; right
  now it's CSV export."
- "What would make you actually use this on a Monday morning?"
- "What's missing that would be a deal-breaker?"

Listen for:
- Anything he says "I'd want this to..." → write it down
- Anything that gets a long pause or a "hmm" → friction signal
- Anywhere he reaches for his phone to take a photo / make a note —
  that's a feature gap

## After the demo (your notes)

Write down within an hour while it's fresh:
- 3 things he reacted positively to
- 3 things that fell flat or confused him
- 1 feature he asked for that we don't have
- 1 question he didn't ask but should have

---

## Things NOT to do

- Don't pitch. The whole framing is "show + react."
- Don't say "AI" 12 times. Once or twice tops.
- Don't apologize for missing features — note them and move on.
- Don't show the mobile experience unless he asks. It works but it's
  not the focus.
- Don't quote a price unless he asks. If he does: "Haven't pinned it
  down yet. Want to validate the value first."

## URLs to have ready

- App: `https://var-web-app-cmadd123-cmadd123s-projects.vercel.app`
- Sub portal preview: from Subs & Suppliers → click "Preview portal"
- Client portal preview: from project header → "View as client"
