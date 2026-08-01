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

export interface MatchInput {
  subject: string;
  text: string;
  /** Participant addresses (from/to/cc), any case — used for client match. */
  emails?: string[];
}

const cleanEmail = (s: unknown): string =>
  typeof s === "string" ? s.trim().toLowerCase() : "";

export async function matchDealForOrg(
  db: Firestore,
  orgRef: string,
  input: MatchInput,
): Promise<string | null> {
  const dealsSnap = await db
    .collection("deals")
    .where("org_ref", "==", orgRef)
    .get();

  // 1) Strongest signal: the email is *with the deal's client*. If any
  //    participant address matches a deal's contact email, file there —
  //    even when the project is never named ("tin roof instead of shingles").
  const parts = new Set((input.emails ?? []).map(cleanEmail).filter(Boolean));
  if (parts.size) {
    for (const d of dealsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const contact = cleanEmail(data.ship_to_poc_email);
      if (contact && parts.has(contact)) return d.id;
    }
  }

  // 2) Fall back to a *distinctive* identifier appearing in subject/body —
  //    the project name, PO#/job#, or project address. Deliberately NOT
  //    client/account/contact NAMES: short, common names ("cmadd", "Webb
  //    Family") match unrelated mail (a Vercel/GitHub notification mentioning
  //    "cmadd123" caught a deal named "cmadd"). Names are covered by the
  //    stronger client-email signal above. Require ≥6 chars as a floor.
  const hay = norm(`${input.subject}\n${input.text}`);
  let dealRef: string | null = null;
  let bestLen = 5;
  for (const d of dealsSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const ids = [
      data.name,
      data.solicitation_number,
      data.customer_po,
      data.ship_to_address,
    ].filter((v): v is string => typeof v === "string" && v.length > 5);
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
