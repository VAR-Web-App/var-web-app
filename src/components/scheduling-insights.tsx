"use client";

// Scheduling Intelligence — the "Sub Scheduling" add-on surface. Three
// read-only cards over data the schedule page already holds:
//   • Conflicts   — cross-project double-bookings + a suggested shift
//   • Weather     — rain hitting an upcoming outdoor phase + a dry-day suggestion
//   • Performance — per-sub on-time scoring
// Weather is the only card that hits the network (/api/weather, keyless).

import { useEffect, useMemo, useState } from "react";
import {
  ExclamationTriangleIcon,
  CloudIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import type { Deal, Distributor } from "@/types";
import type { ProjectMilestone } from "@/types/builder";
import {
  conflictPairs,
  scoreSubs,
  weatherAdvisories,
  isOutdoorPhase,
  type WeatherAdvisory,
  type ForecastDay,
} from "@/lib/scheduling/insights";

const fmt = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function SchedulingInsights({
  deals,
  subs,
  milestones,
}: {
  deals: Deal[];
  subs: Distributor[];
  milestones: ProjectMilestone[];
}) {
  const [today, setToday] = useState<string | null>(null);
  const [advisories, setAdvisories] = useState<WeatherAdvisory[]>([]);
  const [weatherState, setWeatherState] = useState<"idle" | "loading" | "done">("idle");
  // False when we tried to fetch a forecast but every address failed to
  // geocode / return data — so we show "couldn't check" instead of the
  // misleading "no rain" all-clear.
  const [weatherReachable, setWeatherReachable] = useState(true);

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10));
  }, []);

  const dealById = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);

  // ── conflicts ──
  const conflicts = useMemo(() => {
    const subById = new Map(subs.map((s) => [s.id, s]));
    const assignments = [];
    for (const m of milestones) {
      if (!m.planned_start_date || !m.planned_end_date || !m.assigned_subs?.length) continue;
      const deal = dealById.get(m.deal_ref);
      if (!deal) continue;
      for (const subId of m.assigned_subs) {
        const sub = subById.get(subId);
        if (!sub) continue;
        assignments.push({
          subId, subName: sub.name, dealId: m.deal_ref, dealName: deal.name,
          milestoneId: m.id, phase: m.name,
          start: m.planned_start_date, end: m.planned_end_date,
        });
      }
    }
    return conflictPairs(assignments);
  }, [milestones, subs, dealById]);

  // ── performance ──
  const scores = useMemo(
    () => scoreSubs(milestones, subs.map((s) => ({ id: s.id, name: s.name }))).filter((s) => s.completed > 0 || s.upcoming > 0),
    [milestones, subs],
  );

  // ── weather (network) ──
  useEffect(() => {
    if (!today) return;
    // Only fetch for deals that actually have an address + an upcoming
    // outdoor phase — keeps it to a couple of calls, not one per project.
    const relevant = deals.filter((d) => {
      if (!d.ship_to_address?.trim()) return false;
      return milestones.some(
        (m) =>
          m.deal_ref === d.id &&
          m.planned_end_date &&
          m.planned_end_date >= today &&
          m.status !== "released" &&
          m.status !== "approved" &&
          isOutdoorPhase(m.name),
      );
    });
    if (relevant.length === 0) { setWeatherState("done"); return; }

    let active = true;
    setWeatherState("loading");
    setWeatherReachable(true);
    void (async () => {
      const all: WeatherAdvisory[] = [];
      let succeeded = 0;
      for (const d of relevant.slice(0, 6)) {
        try {
          const res = await fetch(`/api/weather?address=${encodeURIComponent(d.ship_to_address)}`);
          const data = (await res.json()) as { ok: boolean; forecast?: ForecastDay[] };
          if (!data.ok || !data.forecast) continue;
          succeeded++;
          const dealMs = milestones.filter((m) => m.deal_ref === d.id);
          all.push(...weatherAdvisories(dealMs, data.forecast, d.name));
        } catch {
          /* skip this deal's weather */
        }
      }
      if (active) {
        setAdvisories(all);
        setWeatherReachable(succeeded > 0);
        setWeatherState("done");
      }
    })();
    return () => { active = false; };
  }, [deals, milestones, today]);

  const hasAny = conflicts.length > 0 || advisories.length > 0 || scores.length > 0;
  if (!hasAny && weatherState !== "loading") return null;

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      {/* Conflicts */}
      <Card
        icon={<ExclamationTriangleIcon className="h-4 w-4" />}
        title="Conflicts"
        tone={conflicts.length > 0 ? "red" : "slate"}
        count={conflicts.length}
      >
        {conflicts.length === 0 ? (
          <Empty>No double-bookings across your projects.</Empty>
        ) : (
          <ul className="space-y-2">
            {conflicts.map((c) => (
              <li key={c.key} className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs">
                <div className="font-semibold text-red-900">{c.subName} double-booked</div>
                <div className="mt-0.5 text-red-800">
                  {c.a.dealName} · {c.a.phase} ({fmt(c.a.start)}–{fmt(c.a.end)})
                  <span className="text-red-400"> vs </span>
                  {c.b.dealName} · {c.b.phase} ({fmt(c.b.start)}–{fmt(c.b.end)})
                </div>
                <div className="mt-1 rounded bg-white/70 px-2 py-1 text-[11px] text-slate-700">
                  💡 Shift <span className="font-medium">{c.suggestion.moveDealName}</span>’s{" "}
                  {c.suggestion.movePhase} to start {fmt(c.suggestion.newStart)}{" "}
                  (+{c.suggestedShiftDays}d) to clear the {c.overlapDays}-day overlap.
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Weather */}
      <Card
        icon={<CloudIcon className="h-4 w-4" />}
        title="Weather watch"
        tone={advisories.length > 0 ? "amber" : "slate"}
        count={advisories.length}
      >
        {weatherState === "loading" ? (
          <Empty>Checking forecasts…</Empty>
        ) : advisories.length === 0 ? (
          weatherReachable ? (
            <Empty>No rain threatening upcoming outdoor phases.</Empty>
          ) : (
            <Empty>Couldn&rsquo;t check the forecast for this project&rsquo;s address — double-check it&rsquo;s a valid US address.</Empty>
          )
        ) : (
          <ul className="space-y-2">
            {advisories.map((a) => (
              <li key={a.milestoneId} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs">
                <div className="font-semibold text-amber-900">
                  {a.phase} · {a.dealName}
                </div>
                <div className="mt-0.5 text-amber-800">
                  Rain up to {a.worstProb}% on {a.rainDays.map(fmt).join(", ")}
                </div>
                {a.suggestedStart && (
                  <div className="mt-1 rounded bg-white/70 px-2 py-1 text-[11px] text-slate-700">
                    💡 Next dry start: <span className="font-medium">{fmt(a.suggestedStart)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Performance */}
      <Card
        icon={<TrophyIcon className="h-4 w-4" />}
        title="Sub performance"
        tone="slate"
        count={scores.length}
      >
        {scores.length === 0 ? (
          <Empty>Assign subs to phases to start tracking.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {scores.map((s) => {
              const pct = s.onTimePct;
              const tone =
                pct === null ? "text-slate-400"
                  : pct >= 0.85 ? "text-emerald-600"
                    : pct >= 0.6 ? "text-amber-600"
                      : "text-red-600";
              return (
                <li key={s.subId} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{s.subName}</span>
                  <span className="text-slate-400">
                    {s.completed} done{s.upcoming > 0 ? ` · ${s.upcoming} upcoming` : ""}
                  </span>
                  <span className={`w-14 text-right font-semibold tabular-nums ${tone}`}>
                    {pct === null ? "—" : `${Math.round(pct * 100)}%`}
                  </span>
                  {s.avgVarianceDays !== null && Math.abs(s.avgVarianceDays) >= 0.5 && (
                    <span className={`w-16 text-right tabular-nums ${s.avgVarianceDays > 0 ? "text-red-500" : "text-emerald-600"}`}>
                      {s.avgVarianceDays > 0 ? "+" : ""}
                      {s.avgVarianceDays.toFixed(1)}d
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Card({
  icon, title, tone, count, children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "red" | "amber" | "slate";
  count: number;
  children: React.ReactNode;
}) {
  const badge =
    tone === "red" ? "bg-red-100 text-red-700"
      : tone === "amber" ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-600";
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <span className="text-slate-500">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {count > 0 && (
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge}`}>
            {count}
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-3 text-center text-xs text-slate-400">{children}</p>;
}
