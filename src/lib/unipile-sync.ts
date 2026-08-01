// Files a Unipile email onto a matching deal. Connect-inbox syncs the WHOLE
// mailbox, so unlike the forward-in queue (curated by the builder's forward
// rule) we file MATCHED-ONLY — mail that doesn't mention a project is skipped
// rather than flooding the unassigned queue. Idempotent by provider/message
// id. Returns the deal it filed onto, or null when nothing matched.

import type { Firestore } from "firebase-admin/firestore";
import { matchDealForOrg } from "./email-match";
import { htmlToText, type UnipileEmail } from "./unipile";

const snippetOf = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 300);

export async function fileUnipileEmail(
  db: Firestore,
  orgRef: string,
  email: UnipileEmail,
  selfEmail?: string,
): Promise<string | null> {
  const subject = email.subject ?? "";
  const text =
    email.body_plain?.trim() || (email.body ? htmlToText(email.body) : "");

  // The builder's own address is on every message they send or receive, so
  // exclude it from client matching — only the *other* party identifies the
  // deal.
  const self = (selfEmail ?? "").trim().toLowerCase();
  const emails = [
    email.from_attendee?.identifier,
    ...(email.to_attendees ?? []).map((a) => a.identifier),
    ...(email.cc_attendees ?? []).map((a) => a.identifier),
  ].filter((e): e is string => !!e && e.trim().toLowerCase() !== self);

  const dealRef = await matchDealForOrg(db, orgRef, { subject, text, emails });
  if (!dealRef) return null; // no flood — skip non-project mail

  const dedup =
    email.provider_id ||
    email.id ||
    (email.message_id ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40) ||
    String(Date.now());
  const id = `un_${dedup}`;
  const fromName = email.from_attendee?.display_name ?? "";
  const fromEmail = (email.from_attendee?.identifier ?? "").toLowerCase();
  // Mail the builder sent is just log; mail from anyone else is a to-do.
  const direction = self && fromEmail === self ? "out" : "in";

  await db
    .collection("email_messages")
    .doc(id)
    .set(
      {
        id,
        org_ref: orgRef,
        deal_ref: dealRef,
        status: "matched",
        from: fromName || fromEmail,
        from_email: fromEmail,
        subject,
        snippet: snippetOf(text),
        body_text: text.slice(0, 20000),
        has_attachments: !!email.has_attachments,
        received_at: email.date ?? new Date().toISOString(),
        source: "unipile",
        direction,
      },
      { merge: true },
    );
  return dealRef;
}
