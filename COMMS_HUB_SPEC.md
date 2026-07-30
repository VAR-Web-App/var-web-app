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

## Correspondence attached to the deal — email (layered, provider-agnostic)

Studied Brennan's Avanchor build (`Avanchor/Avanchor-Web-App`). His email
system is **Gmail OAuth + client polling → thread↔deal bindings → per-deal
message metadata**, NOT inbound-parse. Data model to mirror:
- **Bindings:** `email_thread_bindings/{threadId}` = thread → deal
  (`{thread_id, deal_ref, bound_by: user | auto_label | auto_match}`).
- **Per-deal messages:** `deals/{id}/email_messages/{messageId}` = **metadata
  only** (from/subject/snippet/date; bodies fetched on demand). Idempotent
  write + a post-poll sync sweep.
- **Display:** a live `onSnapshot` "Correspondence" card on the deal, grouped by
  thread, links out. (Keep our org-scoped Firestore rules — do NOT copy
  Avanchor's wide-open single-tenant rules.)
- **Auto-bind** by a Gmail label (`KeystonePro/Deals/{name}`) or by substring-
  matching deal identifiers (PO#/award#/address) — `deal-matcher`.

**The catch: Gmail OAuth is Gmail-only.** So we LAYER for every provider:
- **Baseline — forward-in (ANY provider incl. Yahoo / Outlook / ISP):** builder
  sets one auto-forward rule → `u-<orgId>@parse.keystonepro.app` → SendGrid
  Inbound Parse → `/api/email/inbound` → file to the deal. Needs domain +
  SendGrid (domain now live). The universal path.
- **Premium UX — Gmail OAuth** (Gmail + Google Workspace majority): Brennan's
  auto-sync + label-bind; no forwarding, reads history; no domain needed.
- **Outlook/Microsoft OAuth:** obvious second connector if the data warrants.
- **Alt — unified email API (Nylas / Unipile):** one integration = Gmail +
  Outlook + Yahoo + IMAP; paid per mailbox (pass-through in the add-on).
- **Floor — paste-in (already built):** the Email Digester works for any
  provider today, zero setup.

Recommendation: **forward-in baseline + Gmail OAuth premium** (100% coverage via
forwarding, slick zero-config for the Gmail majority, no per-mailbox vendor fee).

- **Text/SMS:** inbound SMS (Twilio) logged against the matching sub/client's
  number, attached to the deal.
- **Calls:** the **Phone Summarizer** we built → recap + action items on the deal
  (already exists; just file under correspondence).

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

1. ✅ **Requests log** — DONE (PR#39): `project_requests` + `RequestsPanel` on the
   deal, tied to phase/sub, status cycle, org-scoped rule deployed.
2. **Requests 1.5** — resurface-on-milestone (show a phase's open requests when it
   comes up on the schedule), convert Request → Change Order / Selection, portal
   client sign-off. No external deps — buildable now.
3. **Email correspondence on the deal** — the Avanchor triad (bindings +
   per-deal `email_messages` + Correspondence card). Ship **forward-in
   (universal)** first (needs SendGrid + the now-live domain), then **Gmail
   OAuth** (premium, no domain). Outlook/unified-API optional later.
4. **Per-deal activity feed = "notifications by project"** (net-new — neither
   app has it): a per-deal `activity` subcollection written on binds / requests /
   draws / COs + a badge. Reuse the poller→badge pattern.
5. **Inbound SMS filing** (Twilio) + **paper-trail export** (one-click PDF of
   correspondence + requests + sign-offs for a dispute).

Phases 2 + 4 need zero external setup and are buildable now; phase 3's forward-in
leg only waits on SendGrid (domain is live).
