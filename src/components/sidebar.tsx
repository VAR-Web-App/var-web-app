"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RectangleStackIcon,
  DocumentArrowUpIcon,
  ScaleIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  TruckIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

// Mirrors Avanchor's sidebar shape so the app feels familiar to anyone
// using both. The full quote-to-cash flow is exposed here even though most
// stages are still placeholders — the sidebar telegraphs the product
// category (workflow tool) on first glance, not just "doc parser".

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}

const NAV: NavItem[] = [
  { href: "/pipeline", label: "Pipeline", icon: RectangleStackIcon, comingSoon: true },
  { href: "/", label: "Documents", icon: DocumentArrowUpIcon },
  { href: "/compare", label: "Compare", icon: ScaleIcon },
  { href: "/quotes", label: "Quotes", icon: DocumentTextIcon, comingSoon: true },
  { href: "/vendor-pos", label: "Vendor POs", icon: ClipboardDocumentListIcon, comingSoon: true },
  { href: "/tracking", label: "Tracking", icon: TruckIcon, comingSoon: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-full w-56 flex-col bg-slate-900 text-white">
      <div className="border-b border-slate-700 px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-sm font-bold">
            V
          </div>
          <h1 className="text-lg font-bold tracking-tight">VAR Web App</h1>
        </div>
        <p className="mt-1 text-xs text-slate-400">Federal IT VAR — Early access</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const baseClass =
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors";
          if (item.comingSoon) {
            return (
              <div
                key={item.href}
                className={`${baseClass} cursor-not-allowed text-slate-500`}
                title="Coming soon"
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  Soon
                </span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${baseClass} ${
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
        <div
          className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500"
          title="Coming soon"
        >
          <Cog6ToothIcon className="h-5 w-5" />
          <span className="flex-1">Settings</span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide">
            Soon
          </span>
        </div>
      </div>
    </aside>
  );
}
