"use client";

// Mobile-only top bar with hamburger menu, brand logo, and the
// current page name. Visible below the md breakpoint; hidden on
// desktop where the fixed-left sidebar handles navigation.
//
// Renders fixed at the top so it survives content scroll. Respects
// the iOS safe-area-inset-top so the notch / dynamic island doesn't
// overlap the hamburger button.

import { Bars3Icon } from "@heroicons/react/24/outline";

export default function MobileTopBar({
  onMenuClick,
}: {
  onMenuClick: () => void;
}) {
  return (
    <header
      className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-3 backdrop-blur md:hidden"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)",
        paddingBottom: "0.5rem",
      }}
    >
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 active:bg-slate-200"
      >
        <Bars3Icon className="h-6 w-6" />
      </button>
      <div className="flex min-w-0 items-center gap-2">
        <svg
          viewBox="0 0 64 64"
          className="h-6 w-6 flex-shrink-0"
          aria-label="KeystonePro logo"
        >
          <circle cx="32" cy="32" r="32" fill="#0369a1" />
          <path
            d="M18 40 L32 24 L46 40"
            stroke="#ffffff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        <span className="truncate text-sm font-semibold text-slate-900">
          KeystonePro
        </span>
      </div>
    </header>
  );
}
