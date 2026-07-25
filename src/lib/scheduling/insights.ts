// Scheduling intelligence — pure logic behind the "Sub Scheduling" add-on.
//
// Three read-only derivations over data the app already has:
//   1. conflictPairs()  — cross-project double-bookings, WITH a suggested
//                          resolution (shift the later phase past the earlier).
//   2. scoreSubs()      — per-sub on-time performance from milestone timing.
//   3. weatherAdvisories() — rain days that hit an upcoming OUTDOOR phase,
//                          with a suggested shift to the next dry day.
//
// All pure — no I/O — so they unit-test trivially. The weather forecast is
// fetched by the /api/weather route and passed in here.

import type { ProjectMilestone } from "@/types/builder";

// ── shared date helpers (YYYY-MM-DD, lexical-safe) ────────────────
const DAY = 86_400_000;
const toMs = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
};
const addDays = (d: string, n: number) =>
  new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);
const overlap = (a: string, b: string, c: string, d: string) => a <= d && c <= b;

// ═══════════════ 1. CONFLICTS ═══════════════

export interface ConflictPair {
  key: string;
  subId: string;
  subName: string;
  a: { dealId: string; dealName: string; phase: string; start: string; end: string };
  b: { dealId: string; dealName: string; phase: string; start: string; end: string };
  overlapDays: number;
  /** Days to push the later phase so it starts the day after the earlier ends. */
  suggestedShiftDays: number;
  /** Which side to move (the later-starting one) + its new start date. */
  suggestion: { moveDealName: string; movePhase: string; newStart: string };
}

interface Assignment {
  subId: string;
  subName: string;
  dealId: string;
  dealName: string;
  milestoneId: string;
  phase: string;
  start: string;
  end: string;
}

/** Every cross-project double-booking, deduped per pair, with a suggested
 *  resolution. Same-project overlaps are normal (a sub works consecutive
 *  phases) and excluded. */
export function conflictPairs(assignments: Assignment[]): ConflictPair[] {
  const bySub = new Map<string, Assignment[]>();
  for (const a of assignments) {
    if (!a.start || !a.end) continue;
    (bySub.get(a.subId) ?? bySub.set(a.subId, []).get(a.subId)!).push(a);
  }

  const out: ConflictPair[] = [];
  for (const [subId, list] of bySub) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const x = list[i];
        const y = list[j];
        if (x.dealId === y.dealId) continue; // same project = fine
        if (!overlap(x.start, x.end, y.start, y.end)) continue;

        // Earlier-starting = a; later = b (b is the one we suggest moving).
        const [a, b] = x.start <= y.start ? [x, y] : [y, x];
        const overlapDays =
          Math.min(dayDiff(b.start, a.end), dayDiff(b.start, b.end)) + 1;
        const newStart = addDays(a.end, 1);
        out.push({
          key: `${subId}|${a.milestoneId}|${b.milestoneId}`,
          subId,
          subName: a.subName,
          a: { dealId: a.dealId, dealName: a.dealName, phase: a.phase, start: a.start, end: a.end },
          b: { dealId: b.dealId, dealName: b.dealName, phase: b.phase, start: b.start, end: b.end },
          overlapDays: Math.max(1, overlapDays),
          suggestedShiftDays: Math.max(1, dayDiff(b.start, newStart)),
          suggestion: { moveDealName: b.dealName, movePhase: b.phase, newStart },
        });
      }
    }
  }
  return out.sort((p, q) => p.a.start.localeCompare(q.a.start));
}

// ═══════════════ 2. SUB PERFORMANCE ═══════════════

export interface SubScore {
  subId: string;
  subName: string;
  /** Completed phases (approved/released or explicitly marked complete). */
  completed: number;
  /** Phases finished on or before their planned end date. */
  onTime: number;
  /** onTime / completed, 0..1 (null when nothing completed yet). */
  onTimePct: number | null;
  /** Mean (completion − planned end) in days; + = late. Null if none. */
  avgVarianceDays: number | null;
  /** Phases still scheduled (not yet completed). */
  upcoming: number;
}

const completionDate = (m: ProjectMilestone): string | undefined => {
  const ts = m.approved_at ?? m.marked_complete_at ?? m.released_at;
  return ts ? ts.slice(0, 10) : undefined;
};
const isComplete = (m: ProjectMilestone) =>
  m.status === "approved" ||
  m.status === "released" ||
  !!m.marked_complete_at ||
  !!m.approved_at;

/** Per-sub on-time scoring over the org's milestones. */
export function scoreSubs(
  milestones: ProjectMilestone[],
  subs: { id: string; name: string }[],
): SubScore[] {
  const nameById = new Map(subs.map((s) => [s.id, s.name]));
  const bySub = new Map<string, ProjectMilestone[]>();
  for (const m of milestones) {
    for (const id of m.assigned_subs ?? []) {
      (bySub.get(id) ?? bySub.set(id, []).get(id)!).push(m);
    }
  }

  const scores: SubScore[] = [];
  for (const [subId, list] of bySub) {
    let completed = 0;
    let onTime = 0;
    let upcoming = 0;
    const variances: number[] = [];
    for (const m of list) {
      if (isComplete(m)) {
        completed++;
        const done = completionDate(m);
        if (done && m.planned_end_date) {
          const v = dayDiff(m.planned_end_date, done);
          variances.push(v);
          if (v <= 0) onTime++;
        } else {
          onTime++; // completed, no planned date to judge against → treat on-time
        }
      } else {
        upcoming++;
      }
    }
    scores.push({
      subId,
      subName: nameById.get(subId) ?? "(sub)",
      completed,
      onTime,
      onTimePct: completed > 0 ? onTime / completed : null,
      avgVarianceDays:
        variances.length > 0
          ? variances.reduce((s, v) => s + v, 0) / variances.length
          : null,
      upcoming,
    });
  }
  // Best on-time first; subs with history ahead of those without.
  return scores.sort((a, b) => {
    if (a.onTimePct === null) return b.onTimePct === null ? 0 : 1;
    if (b.onTimePct === null) return -1;
    return b.onTimePct - a.onTimePct || b.completed - a.completed;
  });
}

// ═══════════════ 3. WEATHER ═══════════════

const OUTDOOR = /found|footing|excavat|grad|dig|concret|slab|pour|frame|framing|roof|sid|exterior|deck|porch|mason|brick|stucco|stone|shingle|gutter|paint.*ext|landscap|driveway|flatwork/i;

export function isOutdoorPhase(name: string): boolean {
  return OUTDOOR.test(name);
}

export interface ForecastDay {
  date: string; // YYYY-MM-DD
  precipProbMax: number; // %
  precipSum: number; // mm
}

export interface WeatherAdvisory {
  milestoneId: string;
  phase: string;
  dealName: string;
  rainDays: string[]; // YYYY-MM-DD hit by rain within the phase window
  worstProb: number;
  /** Suggested new start = first dry day at/after the phase start. Null if
   *  no dry day is visible in the forecast window. */
  suggestedStart: string | null;
}

const isRainy = (d: ForecastDay) => d.precipProbMax >= 60 || d.precipSum >= 5;

/** For each upcoming OUTDOOR milestone of a deal, flag rain days that fall
 *  in its planned window and suggest the next dry start. `forecast` is the
 *  deal's location forecast (typically 14 days out). */
export function weatherAdvisories(
  milestones: ProjectMilestone[],
  forecast: ForecastDay[],
  dealName: string,
): WeatherAdvisory[] {
  if (forecast.length === 0) return [];
  const byDate = new Map(forecast.map((d) => [d.date, d]));
  const out: WeatherAdvisory[] = [];

  for (const m of milestones) {
    if (m.status === "released" || m.status === "approved") continue;
    if (!m.planned_start_date || !m.planned_end_date) continue;
    if (!isOutdoorPhase(m.name)) continue;

    const rainDays: string[] = [];
    let worstProb = 0;
    for (const f of forecast) {
      if (
        f.date >= m.planned_start_date &&
        f.date <= m.planned_end_date &&
        isRainy(f)
      ) {
        rainDays.push(f.date);
        worstProb = Math.max(worstProb, f.precipProbMax);
      }
    }
    if (rainDays.length === 0) continue;

    // First dry day at/after the planned start within the forecast window.
    let suggestedStart: string | null = null;
    for (let cur = m.planned_start_date; byDate.has(cur); cur = addDays(cur, 1)) {
      const f = byDate.get(cur)!;
      if (!isRainy(f)) {
        suggestedStart = cur;
        break;
      }
    }
    out.push({
      milestoneId: m.id,
      phase: m.name,
      dealName,
      rainDays,
      worstProb,
      suggestedStart,
    });
  }
  return out;
}
