# UX Principles — reduce overload without hiding the payload

North star: **reduce cognitive load and match the user's role + mental model.**
Grounded in Nielsen's "Flexibility & efficiency of use" + redundant navigation
paths (multiple entry points to the same thing, because users hold different
mental models). Tools: **progressive disclosure** (summary first, expand for
detail), **grouped/tabbed sections**, **role-based views**, and **hiding empty
fields**. "Consolidate the page" and "more ways to navigate" are the same fix.

## The governor — read this before applying progressive disclosure

Progressive disclosure must **never hide a proactive alert or summary.** The
premium value of the forecasting features IS the surfacing — _"you'll be short
$24,815 in July,"_ _"2 subs over their bid,"_ _"thin margin."_ Collapse those
behind an "expand for detail" and you've hidden the exact thing worth paying
for.

**Rule: summaries + alerts stay always-visible; only supporting detail (tables,
logs, line items) collapses. Not "everything starts closed."**

## Where to apply it — the real target is the deal Finances tab

It's become the overload: ~10 stacked co-equal panels (Estimate, Budget,
Finance Forecast, Cash-flow Timeline, Sub Overruns, Change Orders, Invoices,
Payments, RFQs, Bid Intelligence). Every feature we add makes the scroll wall
worse. Fix, in order:

1. **Attention strip at the top.** Aggregate the red/amber signals currently
   scattered across panels — cash shortfall, subs over budget, thin margin,
   overdue draw — into ONE row the builder sees first.
2. **Collapse the deep tables by default.** Payments log, RFQ list, invoice
   list, quote line items → show a summary, expand for the table.
3. **Group the panels.** Forecast (margin / cash / overruns) · Ledger
   (invoices / payments / change orders) · Sourcing (RFQs / bid intelligence).
   Three groups, not ten peers.

Apply the same pattern anywhere a page grows past ~4–5 co-equal panels.

## Already done — don't rebuild these

- **Role-based views already exist via the portals.** Sub (`/s`, `/sub`),
  client (`/portal`, `/sign`), designer (`/d`) each get a stripped-down,
  login-free, role-appropriate page. That IS "a caller sees a simpler page than
  the owner" — for three roles. Only the **builder-facing app** is overloaded.
- **The deal page is already tabbed** (Overview / Schedule / Finances /
  Selections / Files). The overload is _within_ Finances, not across tabs.
- **Empty states are handled** — panels degrade to clean empty states. Keep
  doing this (hide empty fields/sections rather than showing blanks).

## The new role worth designing for

**Builder-as-agent managing multiple customers** is a genuinely different mental
model — portfolio oversight, not single-project depth. It justifies a _new_
consolidated cross-project view (cash / margin / overrun health across all
jobs), not just decluttering an existing page. Build it when the multi-customer
need is real.

## Meta-rule

**Let the design partner's friction pick the target, not the principle.** Watch
where Barry scroll-hunts or asks "where do I find…". The principle tells you
_how_ to fix overload; the user tells you _which_ overload actually costs them.
Applying it uniformly ahead of that signal is its own kind of waste.
