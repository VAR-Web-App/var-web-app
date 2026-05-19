"use client";

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
} from "@heroicons/react/24/outline";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Tooltip from "@/components/tooltip";

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
    hint: "Optional features you can layer onto Builder — analytics, QuickBooks sync, AI walkthroughs, and more. Not required for launch.",
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, logout } = useAuth();
  const router = useRouter();

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-full w-56 flex-col bg-slate-900 text-white">
      <div className="border-b border-slate-700 px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-600 text-sm font-bold">
            B
          </div>
          <h1 className="text-lg font-bold tracking-tight">Builder</h1>
        </div>
        <p className="mt-1 truncate text-xs text-slate-400">
          {profile?.display_name ?? "Custom home builder — Beta"}
        </p>
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
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {item.label}
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-slate-700 px-3 py-4">
        <Tooltip
          label="Your business profile, branding, default markup, payment terms, integrations (QuickBooks, Stripe). Sets the defaults that flow into every new project."
          placement="right"
          className="w-full"
        >
          <Link
            href="/settings"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/settings")
                ? "bg-blue-600 text-white"
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
          className="w-full"
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
