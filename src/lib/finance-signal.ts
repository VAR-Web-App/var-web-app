// A red/amber signal a Finances panel surfaces up to the tab's attention strip.
// Each panel stays the single source of truth for its own alert; it just emits
// the current one (or null) so the strip can aggregate them at the top —
// UX_PRINCIPLES governor: keep the alerts always-visible, hoist them first.

export interface FinanceSignal {
  severity: "red" | "amber";
  /** Short headline, e.g. "Thin margin". */
  label: string;
  /** Supporting figure, e.g. "12.1% projected". */
  detail: string;
}
