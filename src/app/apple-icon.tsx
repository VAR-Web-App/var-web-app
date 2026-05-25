// iOS home-screen icon — 180×180 PNG, generated at request time via
// next/og ImageResponse. Mirrors the SVG favicon's design (white
// chevron on sky-700 circle) but rendered as PNG because iOS Safari
// doesn't reliably support SVG home-screen icons.
//
// Apple's spec: 180×180 is the modern "apple-touch-icon" size used by
// iPhone 6 and newer + most Android browsers' fallback for non-PWA
// shortcuts. No need for the older 60/76/120 variants — every device
// scales down from 180.

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0369a1", // sky-700
          // iOS auto-rounds the corners, so the full square fills with
          // brand color and the chevron sits centered.
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 64 64"
          width="120"
          height="120"
        >
          <path
            d="M18 40 L32 24 L46 40"
            stroke="#ffffff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
