"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RectangleStackIcon,
  HomeIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
  CalendarDaysIcon,
  SparklesIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  XMarkIcon,
  InboxIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Tooltip from "@/components/tooltip";
import { useInboxCount } from "@/lib/use-inbox-count";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
}

// Builder app navigation — same routes as the VAR app underneath
// (so existing pages keep working unchanged) with builder-friendly
// labels and icons. Routes will be aliased once /projects + /clients
// land. For now Pipeline still routes to /deals.
const NAV: NavItem[] = [
  {
    href: "/inbox",
    label: "Inbox",
    icon: InboxIcon,
    hint: "Things waiting on you — sub bids to award, draws pending client approval, change orders out for signature. One screen, every project.",
  },
  {
    href: "/deals",
    label: "Projects",
    icon: RectangleStackIcon,
    hint: "Your project pipeline — kanban view across stages from new lead through closeout. Click a card to open the project.",
  },
  {
    href: "/schedule",
    label: "Schedule",
    icon: CalendarDaysIcon,
    hint: "Calendar view of who's on which job and when. Assign subs to phases, see conflicts across projects.",
  },
  {
    href: "/accounts",
    label: "Clients",
    icon: HomeIcon,
    hint: "Your client roster — homeowners and the projects tied to each. Contact info, history, communication thread.",
  },
  {
    href: "/contacts",
    label: "Contacts",
    icon: UserGroupIcon,
    hint: "People you work with across clients and subs — architects, lenders, inspectors, designers. Searchable directory.",
  },
  {
    href: "/distributors",
    label: "Subs & Suppliers",
    icon: WrenchScrewdriverIcon,
    hint: "Your trade roster — framers, plumbers, electricians, lumberyards. Used by RFQs and milestone sub assignments.",
  },
  {
    href: "/roadmap",
    label: "Add-ons",
    icon: SparklesIcon,
    hint: "Optional features you can layer onto KeystonePro — analytics, QuickBooks sync, AI walkthroughs, and more. Not required for launch.",
  },
];

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  /** Drawer-open state for mobile (< md). Ignored on desktop where
   *  the sidebar is always pinned. */
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { profile, logout } = useAuth();
  const router = useRouter();
  // Live count of unattended items across all projects — drives the
  // pill on the Inbox nav row. Hook re-queries every couple minutes,
  // so the badge stays roughly current without manual refresh.
  const inboxCount = useInboxCount(profile?.org_ref);

  // Auto-close the mobile drawer on route change. Without this, tapping
  // a nav item navigates but leaves the drawer covering the new page.
  useEffect(() => {
    if (mobileOpen && onClose) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileOpen]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!mobileOpen || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose!();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onClose]);

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <aside
      className={
        "fixed left-0 top-0 z-50 flex h-full w-64 flex-col bg-slate-900 text-white transition-transform duration-200 md:w-56 md:translate-x-0 " +
        (mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full")
      }
      aria-label="Main navigation"
    >
      <div className="flex items-start justify-between border-b border-slate-700 px-5 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 64 64"
              className="h-7 w-7 flex-shrink-0"
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
            <h1 className="text-lg font-bold tracking-tight">KeystonePro</h1>
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">
            {profile?.display_name ?? "Custom home builder — Beta"}
          </p>
        </div>
        {/* Close button — mobile drawer only. */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="-mr-2 -mt-1 flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          // "/" matches Pipeline (deals list at root). Other paths use prefix
          // matching so deal detail pages (/deals/[id]) keep "Pipeline"
          // active.
          const isActive =
            item.href === "/deals"
              ? pathname === "/" || pathname.startsWith("/deals")
              : pathname.startsWith(item.href);
          return (
            <Tooltip key={item.href} label={item.hint} placement="right" block>
              <Link
                href={item.href}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sky-700 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/inbox" && inboxCount > 0 && (
                  <span
                    className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-slate-900"
                    aria-label={`${inboxCount} items needing attention`}
                  >
                    {inboxCount > 99 ? "99+" : inboxCount}
                  </span>
                )}
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-slate-700 px-3 py-4">
        <Tooltip
          label="Your business profile, branding, default markup, payment terms, integrations (QuickBooks, Stripe). Sets the defaults that flow into every new project."
          placement="right"
          block
        >
          <Link
            href="/settings"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/settings")
                ? "bg-sky-700 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Cog6ToothIcon className="h-5 w-5" />
            Settings
          </Link>
        </Tooltip>
        <Tooltip
          label="Sign out of your account on this device. Your data stays — sign back in any time."
          placement="right"
          block
        >
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            Sign Out
          </button>
        </Tooltip>
        {profile?.email && (
          <p className="truncate px-3 py-1 text-[11px] text-slate-500">
            {profile.email}
          </p>
        )}
      </div>
    </aside>
  );
}
