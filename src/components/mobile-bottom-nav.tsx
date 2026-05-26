"use client";

// Mobile-only bottom tab bar — primary navigation on phones. 4 tabs
// for the most-used destinations + a "More" item that opens the
// existing off-canvas sidebar drawer for everything else.
//
// Hidden on md+ where the sidebar handles navigation natively.
//
// Active state: matches the sidebar's prefix logic so that
// /deals/{id}/quote still highlights "Projects" etc.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RectangleStackIcon,
  CalendarDaysIcon,
  WrenchScrewdriverIcon,
  EllipsisHorizontalCircleIcon,
} from "@heroicons/react/24/outline";

interface TabItem {
  href?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Path prefixes that count as "active" for this tab. */
  matches: string[];
  /** When clicked, fire an action (used by the More overflow). If
   *  set, href is ignored. */
  onClick?: () => void;
}

export default function MobileBottomNav({
  onMoreClick,
}: {
  onMoreClick: () => void;
}) {
  const pathname = usePathname();

  const tabs: TabItem[] = [
    {
      href: "/deals",
      label: "Projects",
      icon: RectangleStackIcon,
      matches: ["/", "/deals"],
    },
    {
      href: "/schedule",
      label: "Schedule",
      icon: CalendarDaysIcon,
      matches: ["/schedule"],
    },
    {
      href: "/distributors",
      label: "Subs",
      icon: WrenchScrewdriverIcon,
      matches: ["/distributors"],
    },
    {
      label: "More",
      icon: EllipsisHorizontalCircleIcon,
      matches: ["/accounts", "/contacts", "/roadmap", "/settings"],
      onClick: onMoreClick,
    },
  ];

  function isActive(t: TabItem): boolean {
    return t.matches.some((m) =>
      m === "/" ? pathname === "/" : pathname.startsWith(m),
    );
  }

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {tabs.map((t) => {
        const active = isActive(t);
        const className = `flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors ${
          active ? "text-sky-700" : "text-slate-500 active:bg-slate-100"
        }`;
        const inner = (
          <>
            <t.icon className="h-5 w-5" />
            <span>{t.label}</span>
            {active && (
              <span
                aria-hidden
                className="absolute top-0 h-0.5 w-10 rounded-b-full bg-sky-600"
              />
            )}
          </>
        );
        if (t.onClick) {
          return (
            <button
              key={t.label}
              type="button"
              onClick={t.onClick}
              className={`relative ${className}`}
              aria-current={active ? "page" : undefined}
            >
              {inner}
            </button>
          );
        }
        return (
          <Link
            key={t.label}
            href={t.href!}
            className={`relative ${className}`}
            aria-current={active ? "page" : undefined}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
