import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import IosInstallHint from "@/components/ios-install-hint";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title:
    "FrameFlow — Project + estimate + draw management for custom home builders",
  description:
    "AI-assisted estimating, draw schedule + lender-ready requests, sub coordination, customer portal — the custom-home builder workflow in one app.",
  // PWA: tells iOS Safari this app is installable as a standalone
  // shell, controls the status bar tint, and registers a short title
  // for the home-screen icon.
  appleWebApp: {
    capable: true,
    title: "FrameFlow",
    statusBarStyle: "black-translucent",
  },
};

// Separate Viewport export per Next.js 16 convention — themeColor +
// viewport-fit cover live here, not on metadata.
export const viewport: Viewport = {
  themeColor: "#0369a1", // sky-700, matches manifest + brand
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // honors iPhone safe-area insets when installed
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <AuthProvider>{children}</AuthProvider>
        {/* One-time iOS Safari install hint. No-op on Android, desktop,
         *  or already-installed PWAs. */}
        <IosInstallHint />
      </body>
    </html>
  );
}
