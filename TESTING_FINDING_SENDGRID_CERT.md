# Blocker — SendGrid click-tracking domain breaks every emailed link

**Found:** 2026-08-08 · during Journey 6 (sub portal + bidding) of [TESTING.md](TESTING.md)
**Severity:** Blocker — affects all outbound email in production
**Status:** Open

---

## Summary

Every link we send by email is rewritten through SendGrid's click-tracking
subdomain `url1022.keystonepro.app`. That subdomain presents a TLS certificate
that does not cover the hostname, so the browser hard-fails the connection.

Because `.app` is an HSTS-preloaded TLD, **there is no click-through bypass in
any browser**. The recipient cannot reach the link at all.

This was hit on an RFQ bid invite, but it is not specific to RFQs — it affects
client portal links, draw requests, and designer links equally.

## Reproduction

1. Project → Finances → RFQ panel → create an RFQ, invite a sub with an email
   address on file.
2. Send. The sub receives the invite email.
3. Click the bid link in the email.
4. Browser blocks with `NET::ERR_CERT_COMMON_NAME_INVALID` and no bypass option.

## Observed

Edge, 2026-08-08. Address bar shows the SendGrid click-tracking URL, flagged
`Not secure`, protocol downgraded to `http://`:

```
http://url1022.keystonepro.app/ls/click?upn=u001.xnipivZZ5HB2Khd1LXr85IZ3n1cve-2BZd83rSzjQBHVseb2xTQ-2BRf8P1GUwuMi51IwRuVGISGwulwpBeeHmI5OSMyncEV8WbHD8Pga-2BxnW-2BGFaf0r5sPRthESYQxE1SeUs91L2N1...
```

Interstitial text:

```
Your connection isn't private

Attackers might be trying to steal your information from url1022.keystonepro.app
(for example, passwords, messages, or credit cards).

NET::ERR_CERT_COMMON_NAME_INVALID

[Hide advanced]                                              [Refresh]

url1022.keystonepro.app uses encryption to protect your information. When
Microsoft Edge tried to connect to url1022.keystonepro.app this time, the
website sent back unusual and incorrect credentials. This may happen when an
attacker is trying to pretend to be url1022.keystonepro.app, or a Wi-Fi sign-in
screen has interrupted the connection. Your information is still secure because
Microsoft Edge stopped the connection before any data was exchanged.

You can't visit url1022.keystonepro.app right now because the website uses
HSTS. Network errors and attacks are usually temporary, so this page will
probably work later.
```

Note there is **no "Proceed anyway" link** under Advanced — only `Refresh`.

## Diagnosis

Three facts combine:

1. **Our link generation is correct.** `src/components/rfq-panel.tsx:444` builds
   a clean absolute URL:

   ```ts
   const bidLink = `https://${host}/s/${token}/bid/${rfqId}`;
   ```

   The `/ls/click?upn=…` path in the failing URL is SendGrid's click-tracking
   rewrite, applied after we hand the message off.

2. **Click tracking is on, inherited from the SendGrid account default.**
   `src/lib/email.ts` never sets `trackingSettings`, so whatever is configured
   account-side applies. Link branding is configured (hence the vanity
   `url1022.keystonepro.app` rather than `sendgrid.net`), but the certificate
   for that hostname was never successfully provisioned — which is exactly what
   `ERR_CERT_COMMON_NAME_INVALID` means: the cert served does not list this
   name.

3. **`.app` is an HSTS-preloaded TLD.** The entire TLD ships in browser preload
   lists with `includeSubDomains`, so `url1022.keystonepro.app` inherits
   strict-transport enforcement from the browser binary. This is why no bypass
   is offered and why the failure is identical across Edge, Chrome, Firefox,
   and Safari. Nothing in this repo sets or can unset that header.

## Fix

### Immediate — unblocks testing and production

SendGrid dashboard → **Settings → Tracking → Click Tracking → off**, then
re-send. Links go out unrewritten as `https://keystonepro.app/s/{token}/bid/{rfqId}`
and resolve normally.

### Proper

SendGrid → **Settings → Sender Authentication → Link Branding** → confirm the
`url1022` CNAME resolves to SendGrid and re-validate so the certificate
provisions. Keep click tracking off until link branding reports validated.

### Worth considering in-repo

Set `trackingSettings.clickTracking.enable = false` explicitly in
`src/lib/email.ts` so transactional links can never be rewritten by an
account-level setting change. Our emails are transactional, not marketing —
click analytics on a draw-approval link has no product value and this failure
mode is severe.

## Related finding — no recovery path for a lost or broken invite

The sub portal at `/s/{token}` lists only **awarded** RFQs
(`src/app/s/[token]/page.tsx:424-432`). There is no "open invitations" section.

Consequently the emailed link is the *only* route to the bid form. A sub who
loses the email, or hits a broken link like this one, has no way to reach the
RFQ and no self-service recovery. Email is a single point of failure for the
entire bidding flow.

Suggested: surface open RFQ invites on the sub portal landing page, so
`/s/{token}` alone is sufficient to find and act on any outstanding bid request.
