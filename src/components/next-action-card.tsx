"use client";

// Stage-aware "what's next" hero card at the top of the project detail
// page. Single most important next action for the GC based on where the
// project sits in the pipeline, plus 1-2 CTAs to act on it directly.
//
// Builds on the audit signal that a builder evaluating the app for the
// first time needs guidance on a dense page. Rather than a tour overlay,
// the card is the next instruction — embedded in the workflow, dismissable
// nowhere because it's the workflow itself.
//
// The card adapts its message + CTAs per stage:
//
//   Lead → "upload plans, start the estimate"
//   Estimating → "build the estimate, view sub bids"
//   Estimate Sent → "view as client / send reminder" ← surfaces the portal
//   Contract Signed → "set up draws, mobilize subs" ← surfaces draws
//   Pre-Construction / In Progress → "track draws + post photos"
//   Complete / Lost → quiet status

import Link from "next/link";
import {
  ArrowUpTrayIcon,
  CalculatorIcon,
  EyeIcon,
  ArrowPathIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  CameraIcon,
  DocumentCheckIcon,
} from "@heroicons/react/24/outline";
import type { Deal, DealStage } from "@/types";

interface NextAction {
  /** Optional pre-headline pill, e.g. "Action needed" */
  banner?: string;
  /** Headline displayed prominently */
  headline: string;
  /** One-sentence explanation */
  body: string;
  /** Primary CTA */
  primary?: { label: string; href?: string; scrollTo?: string; icon?: React.ComponentType<{ className?: string }> };
  /** Optional secondary CTA */
  secondary?: { label: string; href?: string; scrollTo?: string };
  /** "Quiet" mode mutes the visual weight (used for Complete / Lost). */
  quiet?: boolean;
}

function pickAction(deal: Deal): NextAction {
  const stage: DealStage = deal.stage;
  const id = deal.id;
  const sentDaysAgo = daysSince(deal.updated_at);

  switch (stage) {
    case "rfq":
      return {
        banner: "New lead",
        headline: `Start the estimate for ${deal.account_name || "this lead"}.`,
        body: "Drop the floor plan PDF and the AI pulls square footage, room counts, and pre-fills the estimate.",
        primary: {
          label: "Upload floor plan",
          href: `/deals/${id}/files`,
          icon: ArrowUpTrayIcon,
        },
      };

    case "vendor_sourcing":
      return {
        banner: "Estimating",
        headline: "Cost it out, then send.",
        body: "Build the estimate, gather sub bids, then generate a client-facing proposal when the numbers are firm.",
        primary: {
          label: "Open estimate",
          href: `/deals/${id}/quote`,
          icon: CalculatorIcon,
        },
        secondary: {
          label: "Sub bids",
          href: `/deals/${id}/finances`,
        },
      };

    case "quoted":
      return {
        banner: "Estimate out",
        headline: "Waiting on the client.",
        body: `Sent ${sentDaysAgo === 0 ? "today" : `${sentDaysAgo} day${sentDaysAgo === 1 ? "" : "s"} ago`}. See what they're looking at, or nudge them.`,
        primary: {
          label: "View as client",
          href: `/deals/${id}/portal`,
          icon: EyeIcon,
        },
      };

    case "awarded":
      return {
        banner: "Contract signed",
        headline: "Mobilize the job.",
        body: "Set up the draw schedule + payment milestones so the client sees a clear billing timeline. Notify subs that work is starting.",
        primary: {
          label: "Set up draws",
          href: `/deals/${id}/schedule`,
          icon: CurrencyDollarIcon,
        },
        secondary: {
          label: "Notify subs",
          href: `/deals/${id}/schedule`,
        },
      };

    case "po_sent":
      return {
        banner: "Pre-construction",
        headline: "Permits + sub scheduling.",
        body: "Pull permits, lock in sub start dates, mobilize equipment. Updates posted here show up in the client portal.",
        primary: {
          label: "Open schedule",
          href: "/schedule",
          icon: ArrowPathIcon,
        },
        secondary: {
          label: "Sub bids",
          href: `/deals/${id}/finances`,
        },
      };

    case "partially_shipped":
      return {
        banner: "In progress",
        headline: "Track draws + post photos.",
        body: "Submit draw requests as milestones complete. Photos posted here flow straight to the client portal.",
        primary: {
          label: "Submit draw request",
          href: `/deals/${id}/schedule`,
          icon: CurrencyDollarIcon,
        },
        secondary: {
          label: "Post photos",
          href: `/deals/${id}/schedule`,
        },
      };

    case "closed_won":
      return {
        banner: "Complete",
        headline: "Wrap it up.",
        body: "Final invoice + warranty package. Keep the client warm for referrals.",
        primary: {
          label: "Generate closeout",
          href: `/deals/${id}/proposal`,
          icon: DocumentCheckIcon,
        },
        quiet: true,
      };

    case "closed_lost":
      return {
        banner: "Lost",
        headline: "Closed lost.",
        body: "Worth a follow-up note 3-6 months out — circumstances change.",
        quiet: true,
      };

    default:
      return {
        headline: "Project workflow.",
        body: "Pick up where you left off.",
      };
  }
}

function daysSince(iso: string | undefined): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

export default function NextActionCard({ deal }: { deal: Deal }) {
  // On the Lead stage, the AI Floor Plan Extractor below is already the
  // page's primary surface — adding a second 'upload your plan' prompt
  // here just creates two CTAs for one action. Skip the hero entirely.
  // The extractor's empty state carries the next-action signal on its own.
  if (deal.stage === "rfq") return null;

  const action = pickAction(deal);
  const PrimaryIcon = action.primary?.icon;
  const isQuiet = action.quiet;

  return (
    <section
      className={
        isQuiet
          ? "rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          : "rounded-xl border border-sky-300 bg-gradient-to-br from-sky-50 to-blue-50 p-5 shadow-sm"
      }
    >
      {action.banner && (
        <div
          className={
            isQuiet
              ? "text-[10px] font-semibold uppercase tracking-wider text-slate-500"
              : "text-[10px] font-semibold uppercase tracking-wider text-sky-700"
          }
        >
          {action.banner}
        </div>
      )}
      <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
        {action.headline}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">{action.body}</p>
      {(action.primary || action.secondary) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {action.primary && (
            <ActionButton action={action.primary} primary icon={PrimaryIcon} />
          )}
          {action.secondary && <ActionButton action={action.secondary} />}
        </div>
      )}
    </section>
  );
}

function ActionButton({
  action,
  primary,
  icon: Icon,
}: {
  action: { label: string; href?: string; scrollTo?: string };
  primary?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const cls = primary
    ? "inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800"
    : "inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

  if (action.href) {
    return (
      <Link href={action.href} className={cls}>
        {Icon && <Icon className="h-4 w-4" />}
        {action.label}
      </Link>
    );
  }
  if (action.scrollTo) {
    return (
      <button
        type="button"
        onClick={() => {
          const el = document.getElementById(action.scrollTo!);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        className={cls}
      >
        {Icon && <Icon className="h-4 w-4" />}
        {action.label}
      </button>
    );
  }
  return (
    <span className={cls}>
      {Icon && <Icon className="h-4 w-4" />}
      {action.label}
    </span>
  );
}

// Re-export icons so callers don't import them twice — keeps the public
// surface tight. (Currently only used internally; export kept minimal.)
export { ArrowUpTrayIcon, CalculatorIcon, EyeIcon, UserGroupIcon, CameraIcon };
