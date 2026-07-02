"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, ChevronLeftIcon } from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from "@/types";
import { useAuth } from "@/lib/auth-context";

export default function PricingPage() {
  const { profile } = useAuth();
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>("pro");

  const fmtPrice = (n: number) =>
    n === 0 ? "Free" : `$${n}/mo`;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Settings
          </Link>
          <h1 className="mt-2 text-lg font-bold text-slate-900">
            Subscription & Pricing
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose the plan that fits your business. All plans include a 14-day free trial.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {SUBSCRIPTION_TIERS.map((tier) => {
            const isPopular = tier.tier === "pro";
            const isSelected = selectedTier === tier.tier;
            return (
              <div
                key={tier.tier}
                className={`relative rounded-xl border-2 p-6 transition-colors ${
                  isSelected
                    ? "border-sky-500 bg-sky-50 ring-1 ring-sky-300"
                    : "border-slate-200 bg-white hover:border-slate-300"
                } ${isPopular ? "shadow-lg" : "shadow-sm"}`}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-sky-700 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-slate-900">{tier.name}</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-slate-900">
                    {tier.price_monthly === 0 ? "Free" : `$${tier.price_monthly}`}
                  </span>
                  {tier.price_monthly > 0 && (
                    <span className="text-sm text-slate-500">/month</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {tier.seats_included} user{tier.seats_included !== 1 ? "s" : ""} included
                  {tier.tier !== "free" && " · $25/extra seat"}
                </p>

                <ul className="mt-4 space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => setSelectedTier(tier.tier)}
                  className={`mt-6 w-full rounded-md px-4 py-2 text-sm font-semibold ${
                    isSelected
                      ? "bg-sky-700 text-white hover:bg-sky-800"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {isSelected ? "Current selection" : `Select ${tier.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Ready to subscribe?</h2>
          <p className="mt-1 text-xs text-slate-500">
            Stripe integration coming soon. Contact us to start your Pro trial today.
          </p>
          <div className="mt-3 flex gap-3">
            <button
              disabled
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white opacity-50 cursor-not-allowed"
            >
              Start 14-day trial — {fmtPrice(SUBSCRIPTION_TIERS.find((t) => t.tier === selectedTier)?.price_monthly ?? 0)}
            </button>
            <p className="self-center text-xs text-slate-400">
              No charge until trial ends. Cancel anytime.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
