"use client";

// Roadmap / "Coming Soon" wall. Communicates platform momentum to demo
// audiences without requiring those features to actually exist. Each
// card has a stylized preview component showing the shape of the
// feature, so it reads as "we know exactly what we're building" not
// "we'll figure it out later." Quarter labels set realistic expectations.

import { useState } from "react";
import {
  EnvelopeIcon,
  PhoneIcon,
  CubeIcon,
  ChartBarIcon,
  ScaleIcon,
  HomeModernIcon,
  MegaphoneIcon,
  SparklesIcon,
  CheckCircleIcon,
  CalendarDaysIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";

interface Feature {
  id: string;
  title: string;
  quarter: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  description: string;
  bullets: string[];
  preview: React.ReactNode;
}

const FEATURES: Feature[] = [
  {
    id: "email_digester",
    title: "Email Digester",
    quarter: "Q3 2026",
    icon: EnvelopeIcon,
    tagline: "Stop missing project messages buried in your inbox.",
    description:
      "Connect your inbox, AI sorts client + sub emails into the right project, surfaces what needs your attention, drafts replies you approve in one click.",
    bullets: [
      "Auto-route emails to the matching project page",
      "Daily digest: action items, overdue replies, project updates",
      "AI-drafted replies pre-loaded with project context",
      "Per-sub thread tracking — RFQ responses auto-attach to the bid table",
    ],
    preview: <EmailDigesterPreview />,
  },
  {
    id: "advanced_scheduling",
    title: "Sub Scheduling — Auto-notify & Conflicts",
    quarter: "Q3 2026",
    icon: ClockIcon,
    tagline: "Auto-text subs when their phase is approaching, catch double-bookings.",
    description:
      "Builds on the cross-project sub schedule already live in the Schedule tab. Adds proactive coordination: SMS/email reminders, conflict resolution suggestions, weather-aware date shifts, and per-sub performance tracking.",
    bullets: [
      "Auto-SMS subs T-7 days, T-2 days before their phase starts",
      "Conflict detection across projects with suggested resolution",
      "Weather forecast integration — shift outdoor phases proactively",
      "Per-sub performance: on-time, on-budget, quality scoring over time",
    ],
    preview: <SchedulingPreview />,
  },
  {
    id: "phone_log",
    title: "Phone Call Summarization",
    quarter: "Q3 2026",
    icon: PhoneIcon,
    tagline: "Calls become project notes automatically.",
    description:
      "Forward calls through your project line; AI transcribes, summarizes, extracts action items, and drops them into the right project's daily log. No more 'wait what did the framer say?'",
    bullets: [
      "Per-project phone numbers (Twilio-powered)",
      "Real-time transcription + AI summary",
      "Action items auto-flagged ('schedule slipped 3 days', '$2k change order')",
      "Call recording archived to the project",
    ],
    preview: <PhoneLogPreview />,
  },
  {
    id: "materials",
    title: "Materials Sourcing Catalog",
    quarter: "Q4 2026",
    icon: CubeIcon,
    tagline: "Real-time pricing across Home Depot, Lowe's, and your local supplier.",
    description:
      "Search and add materials directly to your estimate without bouncing between five tabs. Live pricing pulled from supplier APIs.",
    bullets: [
      "Catalog search across HD Pro, Lowe's Pro, local lumber yards",
      "One-click add to estimate as a line item",
      "Markup defaults pre-applied per category",
      "Track your favorites + saved lists for repeat builds",
    ],
    preview: <MaterialsPreview />,
  },
  {
    id: "finance_forecast",
    title: "Dynamic Finance Forecasting",
    quarter: "Q4 2026",
    icon: ChartBarIcon,
    tagline: "Cash flow projection that updates as bills arrive.",
    description:
      "Project profit + cash flow projection per phase. As sub invoices come in, the forecast adjusts. See cost overruns the moment they happen, not at closeout.",
    bullets: [
      "Phase-level cost-vs-actuals tracking",
      "Cash flow projection: when does cash hit, when do bills clear",
      "Cost overrun alerts ('Foundation 12% over')",
      "Profit margin by phase, by sub, by project type",
    ],
    preview: <FinanceForecastPreview />,
  },
  {
    id: "bid_intelligence",
    title: "Sub Bid Intelligence",
    quarter: "Q4 2026",
    icon: ScaleIcon,
    tagline: "Know if a sub bid is high, low, or fair before you sign.",
    description:
      "Compare incoming bids against industry benchmarks and your own historical bids. Flag suspiciously low bids, identify your most reliable subs over time.",
    bullets: [
      "Industry benchmarks (RSMeans-style data) for every line",
      "Your own historical: 'Average plumber bid for similar scope: $X'",
      "Sub performance scoring (on-time, on-budget, quality)",
      "Auto-flag bids that miss scope items",
    ],
    preview: <BidIntelligencePreview />,
  },
  {
    id: "walkthrough",
    title: "3D Virtual Walkthrough",
    quarter: "Q4 2026",
    icon: HomeModernIcon,
    tagline: "Your client walks the house before you break ground.",
    description:
      "Convert the floor plan into a 3D model your client can virtually walk through from their phone. Fewer change orders, happier clients, marketing material for your portfolio.",
    bullets: [
      "Auto-generate 3D model from CubiCasa integration",
      "Client-facing walkthrough link (mobile-friendly)",
      "Material/finish overlays as selections get made",
      "Optional 3D printed scale model add-on for high-end clients",
    ],
    preview: <WalkthroughPreview />,
  },
  {
    id: "lead_gen",
    title: "Lead Generation",
    quarter: "Q1 2027",
    icon: MegaphoneIcon,
    tagline: "Inbound leads that match your build profile.",
    description:
      "Referral tracking, automated follow-up, and (optional) marketplace placement on Houzz / GuildQuality / Angi-style platforms. We handle the integrations; you focus on the build.",
    bullets: [
      "Referral tracking + thank-you automation",
      "Marketplace integrations (opt-in)",
      "Lead scoring against your build profile (size, region, type)",
      "Automated follow-up sequences for unconverted inquiries",
    ],
    preview: <LeadGenPreview />,
  },
];

export default function RoadmapPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
          <SparklesIcon className="h-4 w-4" />
          Roadmap
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          What we&apos;re building next
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Features in active design or build. We prioritize based on customer feedback —
          if any of these would unlock real time savings for you, let us know and we&apos;ll
          fast-track it.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {FEATURES.map((f) => (
          <FeatureCard
            key={f.id}
            feature={f}
            expanded={expanded === f.id}
            onToggle={() => setExpanded(expanded === f.id ? null : f.id)}
          />
        ))}
      </div>

      <div className="mt-10 rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center">
        <p className="text-sm font-medium text-slate-900">Have something else you need?</p>
        <p className="mt-1 text-xs text-slate-500">
          The roadmap above is what&apos;s on deck — we&apos;re open to bumping anything
          higher based on what would save you time.
        </p>
      </div>
    </AppShell>
  );
}

function FeatureCard({
  feature: f,
  expanded,
  onToggle,
}: {
  feature: Feature;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = f.icon;
  return (
    <article
      className={`rounded-xl border bg-white shadow-sm transition-all ${
        expanded ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200"
      }`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-5 text-left"
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <Icon className="h-5 w-5 text-amber-700" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-semibold text-slate-900">{f.title}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
              <CalendarDaysIcon className="mr-0.5 inline-block h-2.5 w-2.5" />
              {f.quarter}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-700">{f.tagline}</p>
        </div>
        <span className="mt-1 text-xs font-medium text-amber-700">
          {expanded ? "Hide" : "Preview →"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <p className="text-sm text-slate-700">{f.description}</p>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
            <ul className="space-y-1.5 text-xs text-slate-700">
              {f.bullets.map((b, i) => (
                <li key={i} className="flex gap-1.5">
                  <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              {f.preview}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

// ── preview components ───────────────────────────────────────────
// Stylized non-functional UI. Each one shows the SHAPE of the feature
// so the demo audience can imagine it working without us having to
// actually build it.

function EmailDigesterPreview() {
  return (
    <div className="w-72 space-y-1.5 text-[10px]">
      <div className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5">
        <div className="flex justify-between">
          <span className="font-semibold text-blue-900">Action needed (3)</span>
          <span className="text-blue-600">→ Maddox House</span>
        </div>
        <div className="mt-1 truncate text-blue-800">
          Plumber: &ldquo;Need decision on faucet brand by Friday&rdquo;
        </div>
      </div>
      <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
        <div className="flex justify-between">
          <span className="font-semibold text-amber-900">Awaiting reply (2)</span>
          <span className="text-amber-600">→ Smith Remodel</span>
        </div>
        <div className="mt-1 truncate text-amber-800">
          You sent quote to client 4 days ago. Nudge?
        </div>
      </div>
      <div className="rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-500">
        <div className="font-semibold">Auto-handled (12)</div>
        <div className="mt-0.5 truncate">ScanSource shipping confirmations…</div>
      </div>
    </div>
  );
}

function PhoneLogPreview() {
  return (
    <div className="w-72 space-y-1.5 text-[10px]">
      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="flex justify-between">
          <span className="font-semibold text-slate-900">Mike (Framer) · 14 min</span>
          <span className="text-slate-400">10:42 AM</span>
        </div>
        <div className="mt-1 italic text-slate-600">
          &ldquo;Frame inspection passed. Roof material delivery pushed
          to Wednesday — won&apos;t affect critical path.&rdquo;
        </div>
        <div className="mt-1.5 flex gap-1">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">
            +Action
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
            Maddox House
          </span>
        </div>
      </div>
      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="flex justify-between">
          <span className="font-semibold text-slate-900">Brennan · 6 min</span>
          <span className="text-slate-400">Yesterday</span>
        </div>
        <div className="mt-1 italic text-slate-600">
          &ldquo;Wants to swap tile selection in master bath — new selection emailed
          to you.&rdquo;
        </div>
      </div>
    </div>
  );
}

function MaterialsPreview() {
  return (
    <div className="w-72 space-y-1.5 text-[10px]">
      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="font-semibold text-slate-900">2x6x10&apos; SPF stud-grade</div>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <PriceTile vendor="HD Pro" price="$11.42" best />
          <PriceTile vendor="Lowe&apos;s" price="$11.97" />
          <PriceTile vendor="Local" price="$10.85" best />
        </div>
        <button className="mt-1.5 w-full rounded bg-amber-600 px-2 py-1 text-[9px] font-semibold text-white">
          Add to estimate
        </button>
      </div>
      <div className="text-center text-slate-400">+ 24,000 SKUs</div>
    </div>
  );
}

function PriceTile({ vendor, price, best }: { vendor: string; price: string; best?: boolean }) {
  return (
    <div className={`rounded border p-1 text-center ${best ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <div className="text-[8px] uppercase tracking-wider text-slate-500">{vendor}</div>
      <div className={`text-[10px] font-bold ${best ? "text-emerald-700" : "text-slate-900"}`}>
        {price}
      </div>
    </div>
  );
}

function FinanceForecastPreview() {
  return (
    <div className="w-72 space-y-1.5">
      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="text-[10px] font-semibold text-slate-900">Cash flow · next 90 days</div>
        <div className="mt-2 flex h-12 items-end gap-0.5">
          {[20, 35, 28, 42, 50, 38, 60, 65, 55, 70, 80, 75].map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t ${i % 3 === 0 ? "bg-amber-500" : "bg-amber-300"}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-slate-500">
          <span>Today</span>
          <span>+30d</span>
          <span>+60d</span>
          <span>+90d</span>
        </div>
      </div>
      <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px]">
        <span className="font-semibold text-emerald-900">Foundation phase</span>
        <span className="text-emerald-700"> · 4% under budget · $3,200 to good</span>
      </div>
      <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[10px]">
        <span className="font-semibold text-red-900">Framing</span>
        <span className="text-red-700"> · trending 8% over · check sub overruns</span>
      </div>
    </div>
  );
}

function BidIntelligencePreview() {
  return (
    <div className="w-72 space-y-1.5 text-[10px]">
      <div className="font-semibold text-slate-900">Plumbing rough-in · 3 bids</div>
      <BidRow vendor="Acme Plumbing" price="$18,400" tag="Low (-12%)" tone="emerald" />
      <BidRow vendor="Bay Area Plumb." price="$21,250" tag="Fair" tone="slate" />
      <BidRow vendor="Quick Fix Co." price="$24,800" tag="High (+18%)" tone="amber" />
      <div className="rounded border border-slate-200 bg-white px-2 py-1 text-[9px] text-slate-600">
        Industry benchmark for this scope: <span className="font-bold">$20.8k–22.3k</span>
      </div>
    </div>
  );
}

function BidRow({
  vendor,
  price,
  tag,
  tone,
}: {
  vendor: string;
  price: string;
  tag: string;
  tone: "emerald" | "slate" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "amber"
      ? "bg-amber-100 text-amber-800"
      : "bg-slate-100 text-slate-700";
  return (
    <div className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1.5">
      <span className="font-medium text-slate-900">{vendor}</span>
      <span className="font-semibold tabular-nums text-slate-900">{price}</span>
      <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${toneClass}`}>
        {tag}
      </span>
    </div>
  );
}

function WalkthroughPreview() {
  return (
    <div className="relative h-32 w-72 overflow-hidden rounded-lg bg-gradient-to-br from-slate-700 to-slate-900">
      <div className="absolute inset-0 flex items-center justify-center text-white">
        <div className="text-center">
          <HomeModernIcon className="mx-auto h-10 w-10 text-amber-400 opacity-80" />
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider">
            Walk the house
          </p>
          <p className="text-[9px] text-slate-300">Tap and drag to explore</p>
        </div>
      </div>
      <div className="absolute bottom-1 left-1 right-1 flex gap-0.5">
        {["Foyer", "Kitchen", "Living", "Master", "Bath"].map((r) => (
          <div
            key={r}
            className="flex-1 rounded bg-white/20 py-0.5 text-center text-[8px] text-white backdrop-blur"
          >
            {r}
          </div>
        ))}
      </div>
    </div>
  );
}

function SchedulingPreview() {
  return (
    <div className="w-72 space-y-1.5 text-[10px]">
      <div className="rounded border border-blue-200 bg-blue-50 p-2">
        <div className="font-semibold text-blue-900">Auto-text scheduled · today 8 AM</div>
        <div className="mt-0.5 text-blue-800">
          → Cano Concrete: &ldquo;Foundation pour Mar 18 (T-7d)&rdquo;
        </div>
      </div>
      <div className="rounded border border-red-200 bg-red-50 p-2">
        <div className="flex justify-between">
          <span className="font-semibold text-red-900">Conflict detected</span>
          <span className="text-red-600">2 projects</span>
        </div>
        <div className="mt-0.5 text-red-800">
          Hill Country Framing: Maddox + Reyes overlap Apr 22–28
        </div>
      </div>
      <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
        <span className="font-semibold">Weather alert:</span> Rain Apr 18–20.
        Suggest shift slab pour to Apr 21.
      </div>
    </div>
  );
}

function LeadGenPreview() {
  return (
    <div className="w-72 space-y-1.5 text-[10px]">
      <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
        <div className="flex justify-between">
          <span className="font-semibold text-emerald-900">New lead · 92% match</span>
          <span className="text-[9px] text-emerald-600">2 hr ago</span>
        </div>
        <div className="mt-0.5 text-emerald-800">
          Custom home, 4,200sqft, Boerne TX · referred by Maddox
        </div>
      </div>
      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="flex justify-between text-slate-500">
          <span>Maddox referral · auto-thanks sent</span>
          <span>✓</span>
        </div>
      </div>
      <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
        <span className="font-semibold">Reminder:</span> Quote sent 6 days ago to Smith family,
        no reply. Send nudge?
      </div>
    </div>
  );
}
