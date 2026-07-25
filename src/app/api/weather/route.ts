// GET /api/weather?address=<free text> — precipitation forecast for a
// project's location, used by the Sub Scheduling weather advisories.
//
// Two keyless, free upstreams:
//   1. US Census onelineaddress geocoder → lat/lng (handles full US street
//      addresses; US-only, which fits this builder audience).
//   2. Open-Meteo daily forecast → precipitation probability + sum, 14 days.
//
// Degrades gracefully: any upstream miss returns { ok:false } so the UI just
// hides the weather card rather than erroring.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface ForecastDay {
  date: string;
  precipProbMax: number;
  precipSum: number;
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const url =
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress" +
    `?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      result?: { addressMatches?: { coordinates?: { x: number; y: number } }[] };
    };
    const c = j.result?.addressMatches?.[0]?.coordinates;
    if (!c || typeof c.x !== "number" || typeof c.y !== "number") return null;
    return { lat: c.y, lng: c.x };
  } catch {
    return null;
  }
}

async function forecast(lat: number, lng: number): Promise<ForecastDay[] | null> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lng}` +
    "&daily=precipitation_probability_max,precipitation_sum&timezone=auto&forecast_days=14";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      daily?: {
        time?: string[];
        precipitation_probability_max?: (number | null)[];
        precipitation_sum?: (number | null)[];
      };
    };
    const d = j.daily;
    if (!d?.time) return null;
    return d.time.map((date, i) => ({
      date,
      precipProbMax: d.precipitation_probability_max?.[i] ?? 0,
      precipSum: d.precipitation_sum?.[i] ?? 0,
    }));
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ ok: false, error: "missing_address" }, { status: 400 });
  }
  const geo = await geocode(address);
  if (!geo) {
    return NextResponse.json({ ok: false, error: "geocode_failed" });
  }
  const days = await forecast(geo.lat, geo.lng);
  if (!days) {
    return NextResponse.json({ ok: false, error: "forecast_failed" });
  }
  return NextResponse.json(
    { ok: true, location: geo, forecast: days },
    // Cache a few hours — precipitation forecasts don't need to be fresher,
    // and it protects the free upstreams from repeat loads.
    { headers: { "Cache-Control": "public, max-age=10800, s-maxage=10800" } },
  );
}
