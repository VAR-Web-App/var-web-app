// Allowlist for pre-launch QA surfaces (currently the in-app annotation /
// feedback tool). Only these accounts see the tap-to-note button, so real
// clients never get a QA control. Add a tester's email here to grant access;
// remove the whole gate once we don't need the tool anymore.

const TESTERS = new Set(
  [
    "collinjmaddox@gmail.com",
    "cmadd.vesel@gmail.com",
    // Add other testers here (e.g. Barry's email) as they join the run.
  ].map((e) => e.toLowerCase()),
);

/** True if this account should see the pre-launch annotation tool. */
export function canAnnotate(email?: string | null): boolean {
  return !!email && TESTERS.has(email.toLowerCase());
}
