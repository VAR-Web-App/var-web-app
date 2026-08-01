// Shared deal-matcher for inbound email. Given an org's deals, find the one
// whose identifier (name / job# / PO# / project address) appears in the
// email's subject+body — longest match wins, very short identifiers ignored.
// Used by both the SendGrid forward-in route and the Unipile inbox sync.

import type { Firestore } from "firebase-admin/firestore";

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
  const hay = `${subject}\n${text}`.toLowerCase();
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
      if (idv.length > bestLen && hay.includes(idv.toLowerCase())) {
        dealRef = d.id;
        bestLen = idv.length;
      }
    }
  }
  return dealRef;
}
