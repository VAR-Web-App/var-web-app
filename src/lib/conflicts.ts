// Cross-project sub conflict detection — given a target milestone and
// a candidate sub, flag any other milestones across the org where the
// sub is already booked on overlapping dates.
//
// Pure function — caller loads org-wide milestones once (via
// listAllMilestonesForOrg) and passes them in. Re-runs cheaply on
// assignment changes / date edits.

import type { ProjectMilestone } from "@/types/builder";

export interface SubConflict {
  /** Conflicting milestone. */
  milestone: ProjectMilestone;
  /** Display name of the deal the conflicting milestone belongs to.
   *  Caller-supplied because milestones don't carry the deal name. */
  deal_name: string;
}

export interface ConflictLookup {
  /** Pre-indexed milestones grouped by sub_ref for O(1) per-sub lookups
   *  when the picker scans every distributor. */
  bySubRef: Map<string, ProjectMilestone[]>;
  /** Display names keyed by deal id, so callers can render a friendly
   *  "Maddox Custom" instead of a deal id. */
  dealNames: Map<string, string>;
}

/** Build a one-shot lookup table from the org's milestones + deal-id
 *  → name map. The caller (typically a panel) computes this once on
 *  mount and reuses it per render. */
export function buildConflictLookup(
  milestones: ProjectMilestone[],
  dealNames: Map<string, string>,
): ConflictLookup {
  const bySubRef = new Map<string, ProjectMilestone[]>();
  for (const m of milestones) {
    if (m.status === "released") continue; // paid out — not a conflict
    for (const subId of m.assigned_subs ?? []) {
      const arr = bySubRef.get(subId) ?? [];
      arr.push(m);
      bySubRef.set(subId, arr);
    }
  }
  return { bySubRef, dealNames };
}

/** Find every milestone (excluding the target itself) where the given
 *  sub is already booked on dates that overlap the target's date range.
 *
 *  Overlap rule: two ranges [a,b] and [c,d] overlap when a <= d && c <= b.
 *  Ranges without explicit start/end dates are treated as "no conflict"
 *  — we can't know without dates. The UI surfaces this as a softer warning. */
export function findSubConflicts(
  lookup: ConflictLookup,
  targetMilestone: Pick<
    ProjectMilestone,
    "id" | "planned_start_date" | "planned_end_date"
  >,
  subRef: string,
): SubConflict[] {
  const start = targetMilestone.planned_start_date;
  const end = targetMilestone.planned_end_date;
  if (!start || !end) return [];
  const candidates = lookup.bySubRef.get(subRef) ?? [];
  const out: SubConflict[] = [];
  for (const m of candidates) {
    if (m.id === targetMilestone.id) continue;
    const ms = m.planned_start_date;
    const me = m.planned_end_date;
    if (!ms || !me) continue;
    if (rangesOverlap(start, end, ms, me)) {
      out.push({
        milestone: m,
        deal_name: lookup.dealNames.get(m.deal_ref) ?? "(another project)",
      });
    }
  }
  // Sort by start so the earliest conflict shows first.
  return out.sort((a, b) =>
    (a.milestone.planned_start_date ?? "").localeCompare(
      b.milestone.planned_start_date ?? "",
    ),
  );
}

/** YYYY-MM-DD comparisons work lexically; no Date object needed. */
function rangesOverlap(a: string, b: string, c: string, d: string): boolean {
  return a <= d && c <= b;
}

/** Pretty "Jun 5 – Jun 10" / "Jun 5". Returns "—" for missing dates. */
export function fmtRange(start?: string, end?: string): string {
  const f = (s?: string) => {
    if (!s) return "";
    const [y, m, d] = s.split("-").map(Number);
    if (!y || !m || !d) return s;
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };
  const fs = f(start);
  const fe = f(end);
  if (fs && fe) return fs === fe ? fs : `${fs} – ${fe}`;
  return fs || fe || "—";
}
