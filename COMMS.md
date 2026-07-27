# Communications & Notifications — Roadmap

**Owner:** Collin · **Updated:** 2026-07-27

Everything the app needs across push, email, and SMS to be fully live.

**Legend:** ✅ done · 🔧 code (Claude) · 👤 external accounts/DNS (Collin) · ⏳ blocked on something

---

## 0. Domain — DNS access plan (DEFERRED until testing is complete)

`keystonepro.app` lives in **Ira's** GoDaddy account, shared with other domains
he won't delegate. GoDaddy's native "Delegate Access" is *account-wide*, so it
can't scope to a single domain — hence the plan below.

**Chosen = Option B (Cloudflare DNS delegation). Do this AFTER the test run:**
- [x] ✅ `keystonepro.app` already attached to the `var-web-app` Vercel project
- [ ] 👤 Collin: free Cloudflare account → add `keystonepro.app` → Cloudflare gives 2 nameservers
- [ ] 👤 Ira: **one-time** nameserver change at GoDaddy → point to Cloudflare's NS
- [ ] 👤 Collin (in Cloudflare, no GoDaddy access needed): `A @ 76.76.21.21` · `CNAME www cname.vercel-dns.com` · later the SendGrid MX
- [ ] ⏳ Vercel auto-verifies + issues SSL; Collin now controls all DNS himself

*Alt (Option A):* Ira "Move domain to another account" → Collin owns just
keystonepro.app outright. *Why it matters:* SendGrid sender domain, Twilio
brand website, inbound-email MX, and Firebase reset-email deliverability all
depend on this domain being live under Collin's control.

---

## 1. Push (VAPID) — ✅ DONE

- [x] Configured, opt-in cards present, events fire, quiet hours work
- No action needed.

---

## 2. Email — outbound (SendGrid)

- [ ] 👤 Create SendGrid account → API key → verify a sender (ideally domain auth on keystonepro.app)
- [ ] 🔧 Claude provides DKIM/SPF DNS records → 👤 Collin pastes them at GoDaddy
- [ ] 👤 Add to Vercel (Brennan's scope): `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, optional `SENDGRID_FROM_NAME`
- [x] ✅ Code path already exists (`src/lib/email.ts`, `/api/email`) — no-ops until keyed, then delivers

*Turns on:* automated RFQ-to-sub emails + the Email channel in notification routing.

---

## 3. Email — inbound (removes the inbox copy-paste)

- [ ] ⏳ needs the domain live (step 0)
- [ ] 👤 Add MX at GoDaddy: `parse.keystonepro.app → mx.sendgrid.net`
- [ ] 👤 Configure SendGrid **Inbound Parse** → webhook to `/api/email/inbound`
- [ ] 🔧 Build `/api/email/inbound` (verify POST, resolve which org, run the existing digester)
- [ ] 🔧 **Decision needed:** per-org forwarding address + **review queue** vs auto-file
      *(recommend review queue — a misroute never writes to the wrong project unattended)*

---

## 4. SMS (Twilio A2P 10DLC)

**In-app: ✅ already built (Brennan) + hardened.**
- [x] ✅ Consent checkbox on every sub; `sms_consent === true` gates every send path
- [x] ✅ STOP flips consent off + HELP handled (`/api/sms/inbound`)
- [x] ✅ Message templates prefix the builder name (`src/lib/sms.ts`)
- [x] ✅ Consent disclosure copy is carrier-grade (PR #17)

**External (Collin — standard/EIN path):**
> **Entity structure:** KeystonePro is a product under the **Knoxx Group** umbrella (Knoxx holds the EIN). The A2P **Brand = Knoxx Group** (keyed by EIN — register ONCE, one brand per EIN). KeystonePro is a **Campaign** under that brand; other Knoxx products (e.g. RoofWorks) get their own campaigns under the same brand. **Reuse an existing Knoxx Twilio account if one exists** — don't create a second or re-register the EIN.

- [ ] 👤 **Check first:** does a Knoxx product (RoofWorks?) already have a Twilio account + the Knoxx brand registered? If yes → reuse it, skip the brand step.
- [ ] 👤 Create/log into the **Knoxx Group** Twilio account + payment method
- [ ] 👤 Buy a 10-digit number for KeystonePro (~$1.15/mo)
- [ ] 👤 Register **Brand = Knoxx Group** — legal name exactly as on the EIN/IRS letter + EIN (~$4) — *only if not already registered*
- [ ] 👤 Register **Campaign** (KeystonePro) — use case "Customer Care – notifications" + 2–3 sample messages
- [ ] 👤 Point the number's "A message comes in" webhook → `https://keystonepro.app/api/sms/inbound`
- [ ] 👤 Send Claude the number + Account SID + Auth Token
- [ ] 🔧 Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` to Vercel
- [ ] ⏳ carrier review, ~1–3 days

**Sample message for campaign registration:**
> KeystonePro: You're scheduled for framing at 123 Oak St starting Mon 8/4. Reply STOP to opt out.

---

## 5. In-app notification routing — ✅ mostly DONE

- [x] ✅ Per-event channel toggles, quiet hours, "Needs setup" cue, `/api/notify/channels` (PR #16)
- No action until Email/SMS keys exist — the "Needs setup" cues clear automatically once configured.

---

## 6. Cross-cutting / non-code

- [ ] 👤 **ToS/privacy** must cover: SMS consent, transactional email, and plan-retention-for-training (legal, not code)
- [ ] 👤 (with Brennan) consolidate overlapping **sub-reliability** vs **sub-performance** surfaces

---

## Suggested order

1. **Domain DNS** (Collin, 5 min) → unblocks everything
2. **SMS registration** (Collin) — start now; carrier review is the long pole
3. **SendGrid outbound** (Collin ~15 min + Claude's DNS records) — quick win
4. **Inbound email** (Claude, after domain + SendGrid) — removes copy-paste

---

## Verifying comms once live

| Channel | How to confirm delivery |
|---|---|
| **Push** | Settings → enable "Instant alerts" → trigger an event (sign a proposal / record a payment) → device gets a push |
| **Email (outbound)** | After keys: Settings → Notification routing → the "Needs setup" cue on Email disappears. Send an RFQ to a sub with an email → they receive it |
| **Email (inbound)** | After build: forward an email to the parse address → it appears in the Inbox digested, no paste |
| **SMS** | After Brand/Campaign approved + keys: assign a consented sub to a phase → they get the schedule text. Reply STOP → `sms_consent` flips to false and no further texts send |
