"use client";

// Weather watch for a project. Geocodes the project address and pulls a
// 7-day forecast from Open-Meteo (free, no API key, CORS-enabled — safe
// to call straight from the browser). Flags a day only when bad weather
// lands on a phase that's actually scheduled, so the GC sees signal not
// noise. Any failure is swallowed — the banner simply doesn't render.

import { useEffect, useMemo, useState } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Deal } from "@/types";
import { ProjectMilestone } from "@/types/builder";

// Thresholds for "bad weather" worth flagging to the GC.
const RAIN_INCHES = 0.25; // meaningful accumulation
const RAIN_PROBABILITY = 70; // % chance
const WIND_MPH = 25; // gusty — bad for framing / lifts
const FREEZE_F = 32; // concrete / masonry risk
const HEAT_F = 100; // crew-safety heat

interface ForecastDay {
  date: string; // YYYY-MM-DD
  precipInches: number;
  precipChance: number;
  windMph: number;
  tempMin: number;
  tempMax: number;
}

// Pull a geocodable city out of a free-text US address. Weather is
// regional, so city-level accuracy is plenty.
function cityQuery(address: string): string | null {
  const segments = address
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  const stateZip = /^[A-Z]{2}(\s+\d{5})?$/;
  for (let i = 1; i < segments.length; i++) {
    if (stateZip.test(segments[i])) return segments[i - 1];
  }
  return segments[segments.length - 1];
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function WeatherBanner({
  deal,
  milestones,
}: {
  deal: Deal;
  milestones: ProjectMilestone[];
}) {
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [locationName, setLocationName] = useState("");

  // Fetch the forecast once per address. Skipped entirely when the
  // deal carries a demo_weather_alert override — those projects need
  // a deterministic banner for live demos, not whatever the real
  // forecast happens to be that afternoon.
  useEffect(() => {
    if (deal.demo_weather_alert) return;
    let active = true;
    const city = cityQuery(deal.ship_to_address || "");
    if (!city) return;
    (async () => {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`,
        );
        const geo = await geoRes.json();
        const results: Array<{
          latitude: number;
          longitude: number;
          name?: string;
          country_code?: string;
        }> = geo.results || [];
        const place =
          results.find((r) => r.country_code === "US") || results[0];
        if (!place) return;

        const fRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
            `&daily=precipitation_sum,precipitation_probability_max,wind_speed_10m_max,temperature_2m_max,temperature_2m_min` +
            `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`,
        );
        const f = await fRes.json();
        const d = f.daily;
        if (!d?.time || !active) return;
        const days: ForecastDay[] = d.time.map(
          (date: string, i: number) => ({
            date,
            precipInches: d.precipitation_sum?.[i] ?? 0,
            precipChance: d.precipitation_probability_max?.[i] ?? 0,
            windMph: d.wind_speed_10m_max?.[i] ?? 0,
            tempMax: d.temperature_2m_max?.[i] ?? 0,
            tempMin: d.temperature_2m_min?.[i] ?? 0,
          }),
        );
        setForecast(days);
        setLocationName(place.name || city);
      } catch (e) {
        // Silent — the banner just doesn't render.
        console.warn("[weather] forecast check failed", e);
      }
    })();
    return () => {
      active = false;
    };
  }, [deal.ship_to_address]);

  // Match bad-weather days against phases scheduled then. An alert only
  // fires when work is actually on the calendar for that day.
  const alerts = useMemo(() => {
    const out: {
      date: string;
      label: string;
      reason: string;
      phases: string[];
    }[] = [];

    // Demo override: synthesize an alert from the deal's preset and
    // skip the forecast match logic. Still resolves affected phases
    // from the milestone list so the banner reads naturally.
    if (deal.demo_weather_alert) {
      const { date, reason } = deal.demo_weather_alert;
      const phases = milestones
        .filter(
          (m) =>
            !!m.planned_start_date &&
            !!m.planned_end_date &&
            date >= m.planned_start_date &&
            date <= m.planned_end_date &&
            m.status !== "released" &&
            m.status !== "approved",
        )
        .map((m) => m.name);
      if (phases.length > 0) {
        out.push({ date, label: fmtDay(date), reason, phases });
      }
      return out;
    }

    for (const day of forecast) {
      const reasons: string[] = [];
      if (day.precipInches >= RAIN_INCHES) {
        reasons.push(`Rain (${day.precipInches.toFixed(2)}")`);
      } else if (day.precipChance >= RAIN_PROBABILITY) {
        reasons.push(`Rain likely (${day.precipChance}%)`);
      }
      if (day.windMph >= WIND_MPH) {
        reasons.push(`High wind (${Math.round(day.windMph)} mph)`);
      }
      if (day.tempMin <= FREEZE_F) {
        reasons.push(`Freezing (${Math.round(day.tempMin)}°F)`);
      }
      if (day.tempMax >= HEAT_F) {
        reasons.push(`Extreme heat (${Math.round(day.tempMax)}°F)`);
      }
      if (reasons.length === 0) continue;

      const phases = milestones
        .filter(
          (m) =>
            !!m.planned_start_date &&
            !!m.planned_end_date &&
            day.date >= m.planned_start_date &&
            day.date <= m.planned_end_date &&
            m.status !== "released" &&
            m.status !== "approved",
        )
        .map((m) => m.name);
      if (phases.length === 0) continue;

      out.push({
        date: day.date,
        label: fmtDay(day.date),
        reason: reasons.join(", "),
        phases,
      });
    }
    return out;
  }, [forecast, milestones]);

  if (alerts.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-amber-900">
            Weather watch{locationName ? ` · ${locationName}` : ""}
          </h3>
          <ul className="mt-1.5 space-y-1">
            {alerts.map((a) => (
              <li key={a.date} className="text-xs text-amber-900">
                <span className="font-semibold">{a.label}:</span> {a.reason}{" "}
                <span className="text-amber-700">
                  — {a.phases.join(", ")} scheduled
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-amber-700">
            Rescheduling a phase on the Gantt below texts the assigned subs
            automatically.
          </p>
        </div>
      </div>
    </section>
  );
}
