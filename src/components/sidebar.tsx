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

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tourId?: string;
}

// Builder app navigation — same routes as the VAR app underneath
// (so existing pages keep working unchanged) with builder-friendly
// labels and icons. Routes will be aliased once /projects + /clients
// land. For now Pipeline still routes to /deals.
const NAV: NavItem[] = [
  { href: "/deals", label: "Projects", icon: RectangleStackIcon },
  { href: "/schedule", label: "Schedule", icon: CalendarDaysIcon },
  { href: "/accounts", label: "Clients", icon: HomeIcon },
  { href: "/contacts", label: "Contacts", icon: UserGroupIcon },
  { href: "/distributors", label: "Subs & Suppliers", icon: WrenchScrewdriverIcon },
  { href: "/roadmap", label: "Add-ons", icon: SparklesIcon, tourId: "sidebar-addons" },
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

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.map((item) => {
          // "/" matches Pipeline (deals list at root). Other paths use prefix
          // matching so deal detail pages (/deals/[id]) keep "Pipeline"
          // active.
          const isActive =
            item.href === "/deals"
              ? pathname === "/" || pathname.startsWith("/deals")
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour-id={item.tourId}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-slate-700 px-3 py-4">
        <Link
          href="/settings"
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            pathname.startsWith("/settings")
              ? "bg-blue-600 text-white"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <Cog6ToothIcon className="h-5 w-5" />
          Settings
        </Link>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5" />
          Sign Out
        </button>
        {profile?.email && (
          <p className="truncate px-3 py-1 text-[11px] text-slate-500">
            {profile.email}
          </p>
        )}
      </div>
    </aside>
  );
}
