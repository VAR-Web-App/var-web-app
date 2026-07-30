# Communication Hub + Requests Log — Spec (DRAFT)

**Updated:** 2026-07-30 · Status: proposal. Net-new; nothing built yet.

Bundles all "correspondence + requests attached to a project" into one paid
add-on — the *"disputes can't hurt you"* feature. Modeled on Avanchor's deal
page (Email Correspondence + Action Items/asks + categorized Attachments),
built on our stack.

---

## The problem (builder's words)

A request is made verbally/by text at one stage and a *different* sub executes
it months later — and it must be defensible if disputed. Archetype: *client
describes a fireplace nuance during framing; the mason performs it 3 months
later; later there's a "that's not what I asked for" dispute.*

Selections already handles allowance-bound catalog choices with a signed portal
trail — **keep it for that.** Everything ad-hoc needs a new home.

## The core object: a **Request** (a.k.a. "Ask")

A per-deal log entry. Fields:
- `id`, `deal_ref`, `org_ref`
- `title` + `body` (the ask, in the client's words)
- `phase_ref?` (ties to a milestone) + `assigned_sub_ref?` (who executes it)
- `status`: open · scheduled · done · won't-do
- `source`: verbal · email · text · call · portal
- `attachments[]`: the original email/text/photo (see Attachments below)
- `client_signoff?`: { signature, signed_at } via the portal (optional but the
  dispute-killer)
- `created_at`, `resolved_at`, `created_by`

**Key behaviors**
- **Resurfaces at execution time:** when the tied phase/sub comes up on the
  schedule, its open Requests show on that milestone ("Requests for the mason:
  fireplace flush-mount"). This is the fireplace fix.
- **Escalation paths:** one click turns a Request into a **Change Order** (if it
  costs money) or a **Selection** (if it's a catalog choice) — carrying the
  original message + timestamp forward.
- **Client sign-off:** push a Request to the portal for the homeowner to
  approve, same token flow as draws/COs. Timestamped, immutable.

## Correspondence attached to the deal

- **Email:** connect Gmail / forward to a per-org parse address
  (`u-<orgId>@parse.keystonepro.app` → SendGrid Inbound Parse → `/api/email/inbound`).
  Threads render on the deal (Avanchor's "Email Correspondence · N threads"). The
  **Email Digester** we built is the seed — it already routes a pasted email to a
  project + extracts action items; inbound just automates the paste and files it.
- **Text/SMS:** inbound SMS (Twilio) logged against the matching sub/client's
  number, attached to the deal.
- **Calls:** the **Phone Summarizer** we built → recap + action items saved to the
  deal (already exists; just file under the deal's correspondence).

## Attachments (typed buckets)

Upgrade the thin Files tab toward Avanchor's categorized attachments: typed
drop-zones with counts — Contracts, Change Orders, Approvals, Client
Correspondence, Photos, Permits, Warranties. Feeds the export below.

## Paper-trail export

One click: *"Everything about the fireplace"* / *"Full record for this deal"* →
a chronological PDF of Requests + correspondence + sign-offs + attachments.
This is the headline sell.

---

## Maps to what we already have

| Need | Existing seed | New work |
|---|---|---|
| Route email → project + action items | **Email Digester** (`/api/email/digest`) | inbound-parse route + auto-file |
| Call → recap + action items on deal | **Phone Summarizer** | file under correspondence |
| Client sign-off | **Portal token flow** (draws/COs/selections) | extend to Requests |
| Escalate to CO / Selection | Change Orders + Selections exist | "convert Request →" action |
| Notes | `deal.notes` | structured Requests replace ad-hoc notes |

So ~60% is assembling pieces we built; the net-new is the **Requests data model +
UI**, **inbound email/SMS filing**, and the **export**.

## Packaging

One add-on — **"Communication Hub"** — bundling: per-deal email/text/call
correspondence + the Requests log + client sign-off + paper-trail export. Has
LLM cost (digest/summarize) → **metered/tiered add-on** per PRICING.md, not
base. The RAG **AI Assistant** is a *separate* add-on that can read/act on this
data (log a Request, draft a reply, summarize the trail).

## Phasing

1. **Requests log** (data model + per-deal UI + resurface-on-milestone + convert-to-CO/Selection). Highest value, no external deps. **Build first.**
2. **Client sign-off on Requests** (extend portal).
3. **Inbound email filing** (needs domain + SendGrid Inbound Parse — already scoped in COMMS.md).
4. **Inbound SMS filing** (needs Twilio).
5. **Typed attachments + paper-trail export.**

Phase 1 alone solves the fireplace scenario and is buildable now with zero
external setup. Confirm the add-on framing and I'll spec the data model +
schema for phase 1.
