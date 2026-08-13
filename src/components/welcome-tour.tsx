"use client";

// One-time "welcome back" tour that greets a builder on their first visit
// after signing in, walks the headline features in a few slides, and drops
// them into the demo. Shows once (localStorage); the permanent version lives
// on the What's New page. Doubles as onboarding for brand-new builders.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { XMarkIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

// Bump this version to re-show the tour to everyone (e.g. after a meaningful
// rewrite). v2 = the "connect your inbox" landing pass.
const SEEN_KEY = "kp_welcome_tour_v2";

interface Slide {
  emoji: string;
  title: string;
  body: string;
  href?: string;
  cta?: string;
}

const INTRO: Slide = {
  emoji: "👋",
  title: "Welcome back",
  body: "A lot has landed since you last looked — two-way client messaging, money forecasting, and more. Here's the 60-second tour.",
};

const SLIDES: Slide[] = [
  {
    emoji: "📱",
    title: "Text your clients",
    body: "Client texts file onto the right project automatically — with photos saved to Files and a reply-from-the-app conversation thread.",
    href: "/inbox",
    cta: "Take me to the Inbox",
  },
  {
    emoji: "📥",
    title: "Email that files itself",
    body: "Connect your inbox once and client email auto-routes to projects, turns into tracked requests, and parses supplier invoices into costs. It's the one thing to set up — let's do it.",
    href: "/inbox#connect-inbox",
    cta: "Connect your inbox",
  },
  {
    emoji: "💰",
    title: "Money, at a glance",
    body: "The Finances tab leads with contract · cost · margin, then cash-flow timing and sub overruns — a headline, not a wall of numbers.",
    href: "/deals",
    cta: "Open a project",
  },
  {
    emoji: "☎️",
    title: "Calls become notes",
    body: "Record or upload a call — it transcribes, routes to the right project, and pulls out the action items for you.",
    href: "/inbox",
    cta: "Take me to the Inbox",
  },
  {
    emoji: "🗂",
    title: "One inbox for everything",
    body: "Bids to award, draws to approve, change orders to sign, unanswered client messages — one screen, grouped by project.",
    href: "/inbox",
    cta: "Take me to the Inbox",
  },
];

const CLOSER: Slide = {
  emoji: "🎉",
  title: "One step to make it yours",
  body: "Connect your inbox so client email starts filing itself — it's the one thing to set up. Then load the sample data from Projects and poke at everything. Replay this anytime under “What's New.”",
  href: "/inbox#connect-inbox",
  cta: "Connect your inbox",
};

const DECK = [INTRO, ...SLIDES, CLOSER];

export default function WelcomeTour() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== "1") setShow(true);
    } catch {}
  }, []);

  function done() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setShow(false);
  }

  if (!show) return null;
  const slide = DECK[i];
  const last = i === DECK.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex justify-end px-3 pt-3">
          <button
            onClick={done}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            Skip tour
            <XMarkIcon className="ml-1 inline h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-8 pb-2 pt-2 text-center">
          <div className="text-5xl leading-none">{slide.emoji}</div>
          <h2 className="mt-4 text-xl font-bold text-slate-900">
            {slide.title}
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600">
            {slide.body}
          </p>
          {slide.href && slide.cta && (
            <button
              onClick={() => {
                done();
                router.push(slide.href!);
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              {slide.cta}
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* dots */}
        <div className="flex items-center justify-center gap-1.5 py-4">
          {DECK.map((_, d) => (
            <button
              key={d}
              onClick={() => setI(d)}
              className={`h-1.5 rounded-full transition-all ${
                d === i ? "w-4 bg-sky-600" : "w-1.5 bg-slate-300"
              }`}
              aria-label={`Slide ${d + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <button
            onClick={() => setI((v) => Math.max(0, v - 1))}
            disabled={i === 0}
            className="text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-0"
          >
            Back
          </button>
          {last ? (
            <button
              onClick={done}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Done
            </button>
          ) : (
            <button
              onClick={() => setI((v) => Math.min(DECK.length - 1, v + 1))}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
