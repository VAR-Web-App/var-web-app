"use client";

// First-visit guided tour for solo viewers (think: builder evaluating the
// platform alone, no one walking them through it). Shows a sequence of
// tooltips anchored to elements with [data-tour-id="..."] attributes,
// plus an intro/outro modal. Persists a "seen" flag in localStorage so
// it only runs once per browser.
//
// Targets are looked up by data-tour-id rather than CSS selectors so it's
// obvious which elements opt in to being tour anchors.

import { useEffect, useLayoutEffect, useState } from "react";

const STORAGE_KEY = "builder_tour_seen_v1";

interface TourStep {
  /** data-tour-id of the element to anchor near. Omit for a centered modal. */
  target?: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    title: "Quick tour",
    body: "30 seconds. We'll show you what's here, where to click, and how to load sample data. Hit Next to start, or Skip to explore on your own.",
  },
  {
    target: "pipeline",
    title: "This is your project pipeline",
    body: "Projects move left → right as they progress: Lead → Estimating → Sent → Signed → In Progress → Complete. Drag a card between columns to update stage.",
  },
  {
    target: "sidebar-addons",
    title: "Add-ons",
    body: "Capabilities we can turn on for you — phone-call summarization, sub bid intelligence, 3D walkthrough, more. If any of them would save you real time, just say so.",
  },
  {
    target: "project-card",
    title: "Open any project",
    body: "Click a card to see the full workflow: AI floor-plan extraction, estimate builder, milestone tracking, client portal preview. The Maddox House project is fully populated.",
  },
];

interface Anchor {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function FirstVisitTour() {
  const [step, setStep] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    // Tiny delay lets the page hydrate + render anchors before we measure.
    const t = setTimeout(() => setStep(0), 300);
    return () => clearTimeout(t);
  }, []);

  // Measure the anchor element whenever the step changes. useLayoutEffect
  // runs after DOM mutation but before paint, so the tooltip position is
  // correct on first render of each step (no flash).
  useLayoutEffect(() => {
    if (step === null) return;
    const current = STEPS[step];
    if (!current.target) {
      setAnchor(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(
      `[data-tour-id="${current.target}"]`
    );
    if (!el) {
      setAnchor(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setAnchor({
      top: r.top + window.scrollY,
      left: r.left + window.scrollX,
      width: r.width,
      height: r.height,
    });
    // Scroll the anchor into view if it's off-screen.
    if (r.top < 80 || r.bottom > window.innerHeight - 80) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [step]);

  if (step === null) return null;

  function dismiss() {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    setStep(null);
  }

  function next() {
    if (step === null) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  }

  function back() {
    if (step === null || step === 0) return;
    setStep(step - 1);
  }

  const current = STEPS[step];
  const isModal = !current.target;

  // Tooltip positioning — place below the anchor when there's room, above
  // when not. Clamp horizontally to keep it on-screen.
  const tooltipWidth = 320;
  let top = 100;
  let left = 100;
  let arrowSide: "top" | "bottom" = "top";
  if (!isModal && anchor) {
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
    const anchorBottom = anchor.top - window.scrollY + anchor.height;
    const spaceBelow = viewportH - anchorBottom;
    if (spaceBelow > 220) {
      top = anchor.top + anchor.height + 12;
      arrowSide = "top";
    } else {
      top = anchor.top - 220;
      arrowSide = "bottom";
    }
    left = anchor.left + anchor.width / 2 - tooltipWidth / 2;
    // Clamp horizontally
    const maxLeft =
      (typeof window !== "undefined" ? window.innerWidth : 1200) -
      tooltipWidth -
      16;
    if (left < 16) left = 16;
    if (left > maxLeft) left = maxLeft;
  }

  return (
    <>
      {/* Dimming backdrop. Click-through is disabled so the user can't
          accidentally close the tour by clicking the page underneath. */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px]"
        aria-hidden
      />

      {/* Highlight ring around the anchored element. Drawn as an absolutely-
          positioned box with no fill, so the underlying element shows through
          but visually pops above the dimming backdrop. */}
      {!isModal && anchor && (
        <div
          className="pointer-events-none absolute z-40 rounded-lg ring-4 ring-sky-400 ring-offset-2 ring-offset-white"
          style={{
            top: anchor.top - 4,
            left: anchor.left - 4,
            width: anchor.width + 8,
            height: anchor.height + 8,
          }}
        />
      )}

      {/* Tooltip / modal card */}
      <div
        className={
          isModal
            ? "fixed inset-0 z-50 flex items-center justify-center px-4"
            : "absolute z-50"
        }
        style={
          isModal
            ? undefined
            : { top, left, width: tooltipWidth }
        }
      >
        <div
          className={`relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200 ${
            isModal ? "" : ""
          }`}
        >
          {!isModal && (
            <span
              className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white ${
                arrowSide === "top" ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-r border-b"
              } border-slate-200`}
              aria-hidden
            />
          )}

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
              Step {step + 1} of {STEPS.length}
            </span>
            <button
              onClick={dismiss}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-700"
            >
              Skip tour
            </button>
          </div>
          <h3 className="mt-1 text-base font-bold tracking-tight text-slate-900">
            {current.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            {current.body}
          </p>
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={back}
              disabled={step === 0}
              className="text-sm font-medium text-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Back
            </button>
            <button
              onClick={next}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800"
            >
              {step === STEPS.length - 1 ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
