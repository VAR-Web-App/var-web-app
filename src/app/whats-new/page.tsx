"use client";

// A dedicated, builder-facing "what's changed since you last looked" page —
// built for Barry's walkthrough (his last pass was 2026-05-28). Each item links
// to where to try it. Plain language, newest capabilities first.

import Link from "next/link";
import AppShell from "@/components/app-shell";

type Status = "ready" | "beta" | "preview";

interface Item {
  emoji: string;
  title: string;
  blurb: string;
  href: string;
  cta: string;
  status: Status;
  /** Shown when there's something not-yet-done or a prerequisite. */
  note?: string;
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  ready: { label: "Ready", cls: "bg-emerald-100 text-emerald-800" },
  beta: { label: "Working — one thing left", cls: "bg-amber-100 text-amber-800" },
  preview: { label: "Preview — in progress", cls: "bg-slate-200 text-slate-700" },
};

const ITEMS: Item[] = [
  {
    emoji: "📱",
    title: "Text messaging with clients",
    blurb:
      "Connect a business text line and client texts land on the right project automatically — with a one-line AI summary, multi-part asks split into separate requests, and texted photos saved to the project's Files. Every project has a phone-style conversation thread you can reply from.",
    href: "/inbox",
    cta: "Open the Inbox",
    status: "beta",
    note: "Receiving texts works end-to-end today. Sending replies is built but waiting on carrier registration (10DLC) to approve — in progress now.",
  },
  {
    emoji: "📥",
    title: "Email that files itself",
    blurb:
      "Connect your inbox (read-only) and client email auto-files to the right project. A 'Needs reply' list, an Unassigned review queue, one-click turn an email into a tracked request or change order in the client's own words, attachments pulled into Files, and parse a supplier invoice/PDF straight into project costs.",
    href: "/inbox",
    cta: "Open the Inbox",
    status: "ready",
    note: "Connect your Gmail/Outlook once (read-only) to turn it on.",
  },
  {
    emoji: "🗂",
    title: "One Inbox, grouped by project",
    blurb:
      "Everything waiting on you across every job — bids to award, draws to approve, change orders out for signature, unanswered client email and texts — on one screen, grouped by project and clearly labeled by channel.",
    href: "/inbox",
    cta: "Open the Inbox",
    status: "ready",
  },
  {
    emoji: "💰",
    title: "Money & forecasting",
    blurb:
      "The Finances tab now leads with a 'Finances at a glance' headline (contract · cost · margin · alerts), then cash-flow timeline (when you'll be short and by how much), margin forecast, sub cost overruns & reliability, and budget vs. actuals from real invoices — with the deep tables collapsed so it's not a wall of numbers.",
    href: "/deals",
    cta: "Open a project → Finances",
    status: "ready",
  },
  {
    emoji: "📋",
    title: "Requests → Change Orders → paper trail",
    blurb:
      "Client asks get tracked as requests in their own words, promoted to change orders, shown in the client portal for sign-off, and exported as a clean paper trail.",
    href: "/deals",
    cta: "Open a project",
    status: "ready",
  },
  {
    emoji: "📅",
    title: "Scheduling intelligence",
    blurb:
      "Weather alerts on the phases they'd affect, plus double-booking conflict detection when a sub is scheduled on two jobs at once.",
    href: "/schedule",
    cta: "Open the Schedule",
    status: "ready",
  },
  {
    emoji: "☎️",
    title: "Summarize a call",
    blurb:
      "Paste a call transcript — or record a voice memo / upload a recording — and it routes to the right project, recaps it, and pulls out action items you can save to the log.",
    href: "/inbox",
    cta: "Open the Inbox",
    status: "beta",
    note: "Pasting a transcript works today. Record/upload transcription needs a transcription key enabled (a quick config step).",
  },
  {
    emoji: "🧭",
    title: "Onboarding & on-page guidance",
    blurb:
      "A first-run onboarding wizard, plus a 'how to use this page' guide at the top of every action page (like the one you'll see across the app) so nothing is a mystery.",
    href: "/deals",
    cta: "See it on any page",
    status: "ready",
  },
  {
    emoji: "📐",
    title: "3D scale model & AR",
    blurb:
      "An early look at generating a 3D model of the build from the plan, with an eye toward an augmented-reality view on-site.",
    href: "/deals",
    cta: "Open a project → Takeoff",
    status: "preview",
    note: "Early scaffold only — it produces a rough massing model (blocks + a roof), not plan-accurate walls/openings yet. AR is a spike. Not for the client's eyes; treat as a direction, not a finished feature.",
  },
];

export default function WhatsNewPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">
            What&rsquo;s new
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Since your last look
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            A lot has landed since late May — the estimate engine now sits inside
            a full builder workspace: two-way client communication, money
            forecasting, requests &amp; change orders, scheduling, and a client
            portal. Here&rsquo;s the tour, newest first. Tap any card to try it.
          </p>
        </header>

        <ul className="space-y-3">
          {ITEMS.map((it) => (
            <li key={it.title}>
              <Link
                href={it.href}
                className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">{it.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {it.title}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_META[it.status].cls}`}
                      >
                        {STATUS_META[it.status].label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{it.blurb}</p>
                    {it.note && (
                      <p className="mt-1.5 flex items-start gap-1 text-xs text-slate-500">
                        <span className="font-semibold text-slate-400">
                          Status:
                        </span>
                        <span>{it.note}</span>
                      </p>
                    )}
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
                      {it.cta} →
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-xs text-slate-400">
          Prepping a walkthrough? Reset the sample data from the Projects page so
          every surface is populated.
        </p>
      </div>
    </AppShell>
  );
}
