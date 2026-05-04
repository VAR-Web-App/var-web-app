"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RectangleStackIcon,
  DocumentArrowUpIcon,
  ScaleIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  TruckIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { href: "/deals", label: "Pipeline", icon: RectangleStackIcon },
  { href: "/accounts", label: "Accounts", icon: BuildingOfficeIcon },
  { href: "/contacts", label: "Contacts", icon: UserGroupIcon },
  { href: "/distributors", label: "Distributors", icon: TruckIcon },
  { href: "/documents", label: "Documents", icon: DocumentArrowUpIcon },
  { href: "/compare", label: "Compare", icon: ScaleIcon },
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
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-sm font-bold">
            V
          </div>
          <h1 className="text-lg font-bold tracking-tight">VAR Web App</h1>
        </div>
        <p className="mt-1 truncate text-xs text-slate-400">
          {profile?.display_name ?? "Federal IT VAR — Early access"}
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
