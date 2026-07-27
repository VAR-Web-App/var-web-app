# KeystonePro — Pricing & Packaging (DRAFT)

**Updated:** 2026-07-27 · Status: **proposal for Collin to finalize.** No billing/entitlement layer is built yet — this is the plan, not the implementation.

Grounded in 2026 competitive research (Buildertrend, Houzz Pro, JobTread, Contractor Foreman, Knowify, Buildxact, UDA ConstructionOnline) + per-feature add-on market pricing.

---

## The market, in one line

Custom-home-builder software clusters at **~$300–600/mo, FLAT, unlimited-user**, with all core features **bundled and gated by tier depth** — *not* sold à la carte. (Software Advice: ~76% of builders pay a flat ~$412/mo unlimited-user; only ~32% are on per-seat plans at ~$162/user/mo.)

- **Bundled by everyone:** estimating, proposals, **e-signature**, client portal, draws/payments, scheduling, subs/RFQs, selections, change orders. Selections + change orders + subs/RFQ are the classic **step-up-tier** unlocks.
- **Monetized separately by some:** payment processing (~2.9%), **SMS/texting** (e.g. JobNimbus "Engage" $49–249/mo), lead-gen/advertising (Houzz $499/mo), and **AI estimating/takeoff** add-ons (Buildxact +$99–149/mo).
- **Never sold standalone:** e-signature and 3D/visualization — always bundled into a tier.

**Implication:** KeystonePro should be **flat, unlimited-user** (the builder-native camp, not the per-seat roofing-CRM camp). Bundle the core flow; meter *only* what has real per-use cost.

---

## Proposed tiers (flat, **unlimited users** — the headline differentiator)

| | **Solo** | **Team** | **Pro** |
|---|---|---|---|
| **Price** | **$199/mo** | **$399/mo** | **$699/mo** |
| Active projects | up to 5 | up to 25 | unlimited |
| Users | unlimited | unlimited | unlimited |
| Core: estimating, proposals + **e-sign**, client portal, draws/payments, selections, change orders, subs/RFQs, scheduling, push | ✅ | ✅ | ✅ |
| Scheduling Intelligence · Bid Intelligence · finance forecasting · designer portal | — | ✅ | ✅ |
| AI Inbox (Email Digester + Phone Summarizer, capped) | add-on | add-on | ✅ included |
| QuickBooks sync · API · priority support | — | — | ✅ |

*Annual: 2 months free (~17% off), matching market norm.*
*Alternative if you want to mirror RoofWorks' locked tiers: $149 / $349 / $599. Recommendation is the slightly-higher set above — custom-home builders are a higher-value segment than roofers and the market supports it.*

**Why unlimited users:** competitors either hide pricing (Buildertrend), charge $60/seat (Houzz Pro), or +$29/seat (Knowify). Flat unlimited-user is a clean, honest headline that undercuts all of them.

---

## Add-ons — meter ONLY what costs us money

Everything below has a real per-use cost, so it's à-la-carte or metered (never bundled into a flat plan we'd lose money on). Retail anchored against what the market already charges, at ~2–3× our COGS.

| Add-on | Our COGS | **Retail** | Market anchor |
|---|---|---|---|
| **3D floor plan + virtual tour** / property (GetFloorPlan → our AR pipeline) | ~$40 | **$129 / property** | $279–1,000 a pro Matterport shoot |
| **Photoreal 3D render** / image | ~$40–80 | **$249 / image** | $800–3,000 rendering studios |
| **3D-printed scale model** (~20 cm, POD dropship) | ~$40 | **$199 / model** (+$89 rush) | $300–1,000 model shops |
| **SMS notifications** | ~$0.011/seg | **$19/mo** incl. 500 segments, then $0.04/seg | Salesmsg/QuoteIQ $25–60/mo |
| **AI Inbox** (Solo/Team; included in Pro) | <$3/user/mo | **$29/mo**, capped + credits | Fireflies/Descript $10–30 |
| Payment processing | processor % | **pass-through ~2.9%** | universal |

**A basic in-app 3D *massing* model** (our own pipeline, zero marginal cost) can be a bundled tier feature — it's the *photoreal (GetFloorPlan)* and *physical print (POD)* versions, which have COGS, that stay à la carte. This mirrors how Houzz bundles a free 3D floor planner but nobody bundles unlimited Matterport shoots.

---

## What we bundle that competitors charge for (marketing angle)

- **E-signature** — built-in (our own token sign-flow, zero DocuSign cost). Standalone value $10–25/mo; we include it free. Lead with this.
- **Client portal** (no-login draws/COs/selections) — our hero feature; Houzz/Knowify/UDA gate this to higher tiers, we include it in **every** tier.
- **Unlimited users** — see above.

---

## Open decisions for Collin

1. **Exact price points** — the $199/$399/$699 above vs. the RoofWorks-parallel $149/$349/$599.
2. **Project caps** — 5/25/unlimited, or unlimited on all and differentiate purely on features?
3. **Portal/selections gating** — keep in all tiers (recommended, it's the differentiator) or make selections a Team-tier step-up like the market does?
4. **AI Inbox** — included in Pro only (proposed) vs. add-on for everyone.
5. **Beta/early-builder discount** — undercut to win the first N builders, then raise?

## Not built yet
No Stripe/entitlement/tier-gating layer exists in the app. Implementing this pricing needs: plan definitions, feature gating (per-tier + per-add-on), usage metering (SMS segments, 3D/print orders, AI actions), and Stripe subscriptions + à-la-carte checkout. Separate build once pricing is locked.

---

*Sources: builder-SaaS pricing pages (Buildertrend, JobTread, Houzz Pro, Contractor Foreman, Knowify, Buildxact, UDA); Software Advice homebuilder comparison; GetFloorPlan/Matterport/virtual-staging/rendering pricing; Twilio SMS; DocuSign/Dropbox Sign. Full URLs in the research thread.*
