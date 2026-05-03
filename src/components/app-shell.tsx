import Sidebar from "./sidebar";

// Minimal app shell — fixed left sidebar + main content offset by sidebar
// width. No auth check yet (single-tenant); will gate routes once Firebase
// Auth lands.

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="ml-56 p-6">{children}</main>
    </div>
  );
}
