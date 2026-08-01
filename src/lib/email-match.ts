// Shared deal-matcher for inbound email. Given an org's deals, find the one
// whose identifier (name / job# / PO# / project address) appears in the
// email's subject+body — longest match wins, very short identifiers ignored.
// Used by both the SendGrid forward-in route and the Unipile inbox sync.

import type { Firestore } from "firebase-admin/firestore";

// Normalize for tolerant matching: lowercase, fold all dash variants
// (em/en dash etc.) + underscores/slashes to spaces, collapse whitespace.
// Deal names in the app use em dashes ("Webb — Hill Country Cabin") but a
// human types a plain hyphen in an email — without this they never match.
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―−]/g, "-") // unicode dashes → hyphen
    .replace(/[-_/]+/g, " ") // hyphen/underscore/slash → space
    .replace(/\s+/g, " ")
    .trim();
}

export async function matchDealForOrg(
  db: Firestore,
  orgRef: string,
  subject: string,
  text: string,
): Promise<string | null> {
  const dealsSnap = await db
    .collection("deals")
    .where("org_ref", "==", orgRef)
    .get();
  const hay = norm(`${subject}\n${text}`);
  let dealRef: string | null = null;
  let bestLen = 4; // ignore very short identifiers
  for (const d of dealsSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const ids = [
      data.name,
      data.solicitation_number,
      data.customer_po,
      data.ship_to_address,
    ].filter((v): v is string => typeof v === "string" && v.length > 4);
    for (const idv of ids) {
      const n = norm(idv);
      if (n.length > bestLen && hay.includes(n)) {
        dealRef = d.id;
        bestLen = n.length;
      }
    }
  }
  return dealRef;
}
