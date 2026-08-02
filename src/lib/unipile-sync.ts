// Files a Unipile email onto the right deal. Order of matching:
//   1. client email / project identifier (email-match)
//   2. thread continuity — a reply in a thread we've already filed belongs to
//      the same deal, even if this message never re-names the project (catches
//      the client's "go ahead, do it" and the architect/spouse replying).
// If still unmatched: obvious automated/bulk mail is dropped (no flood), but
// real human mail is surfaced to the unassigned review queue (deal_ref = null)
// so a stray client/architect address is never lost silently. Idempotent by
// provider/message id. Returns the matched deal, or null.

import type { Firestore } from "firebase-admin/firestore";
import { matchDealForOrg } from "./email-match";
import { htmlToText, type UnipileEmail } from "./unipile";

const snippetOf = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 300);

/** noreply@ / notifications@ / newsletters / bounces … — never queue these. */
function isAutomatedSender(fromEmail: string): boolean {
  const e = fromEmail.toLowerCase();
  if (!e) return true;
  return /(^|[._+-])(no-?reply|do-?not-?reply|donotreply|notifications?|mailer-daemon|postmaster|bounces?|auto(mated)?|alerts?|updates?|newsletters?|digest|noreply)([._+-]|@)/.test(
    e,
  );
}

/** Deal that this thread has already been filed to, if any. */
async function dealForThread(
  db: Firestore,
  orgRef: string,
  threadId: string,
): Promise<string | null> {
  const snap = await db
    .collection("email_messages")
    .where("thread_id", "==", threadId)
    .limit(10)
    .get();
  for (const d of snap.docs) {
    const m = d.data() as { org_ref?: string; deal_ref?: string | null };
    if (m.org_ref === orgRef && m.deal_ref) return m.deal_ref;
  }
  return null;
}

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

  let dealRef = await matchDealForOrg(db, orgRef, { subject, text, emails });
  if (!dealRef && email.thread_id) {
    dealRef = await dealForThread(db, orgRef, email.thread_id);
  }

  const fromEmail = (email.from_attendee?.identifier ?? "").toLowerCase();

  // Unmatched: drop automated/bulk noise; surface real human mail for review.
  if (!dealRef && isAutomatedSender(fromEmail)) return null;

  const dedup =
    email.provider_id ||
    email.id ||
    (email.message_id ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40) ||
    String(Date.now());
  const id = `un_${dedup}`;
  const fromName = email.from_attendee?.display_name ?? "";
  // Mail the builder sent is just log; mail from anyone else is a to-do.
  const direction = self && fromEmail === self ? "out" : "in";

  await db
    .collection("email_messages")
    .doc(id)
    .set(
      {
        id,
        org_ref: orgRef,
        deal_ref: dealRef, // null → unassigned review queue
        status: dealRef ? "matched" : "unassigned",
        from: fromName || fromEmail,
        from_email: fromEmail,
        subject,
        snippet: snippetOf(text),
        body_text: text.slice(0, 20000),
        has_attachments: !!email.has_attachments,
        received_at: email.date ?? new Date().toISOString(),
        source: "unipile",
        direction,
        message_id: email.message_id ?? null,
        thread_id: email.thread_id ?? null,
      },
      { merge: true },
    );
  return dealRef;
}
