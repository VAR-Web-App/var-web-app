// Files an inbound client text onto the right deal — the SMS twin of
// fileUnipileEmail. A text is just a correspondence message with
// source:"sms", so it rides the same `email_messages` collection and shows
// up in the project-grouped "Needs reply" Inbox with no new UI.
//
// Provider-agnostic: the connector (Telnyx today) normalizes its webhook to
// NormalizedInboundSms before calling ingestInboundSms, so swapping carriers
// never touches the matching / filing logic here.
//
// Key difference from email: email resolves the org via the connected inbox,
// but a text resolves the org via the *destination* business number —
// orgRefForNumber() maps a builder's line (OrgSettings.sms_config.from_number)
// back to their org.

import type { Firestore } from "firebase-admin/firestore";
import { matchDealForOrg } from "./email-match";
import { summarizeEmail } from "./email-summary";
import { toE164 } from "./sms";
import { randomUUID } from "crypto";
import { adminStorage, adminBucketName } from "./firebase-admin";

const snippetOf = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 300);
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — matches email attachments

export interface InboundMedia {
  url: string;
  contentType?: string;
  name?: string;
}

/** What every connector must hand ingestInboundSms after parsing its webhook. */
export interface NormalizedInboundSms {
  /** Provider's unique message id — used for idempotent dedup. */
  providerId: string;
  /** Sender's number, any format. */
  from: string;
  /** Destination business line, any format — resolves which org this is for. */
  to: string;
  body: string;
  media: InboundMedia[];
  /** ISO timestamp; defaults to now if the provider omits it. */
  receivedAt?: string;
}

/**
 * Map an inbound destination number back to the org that owns that business
 * line. The number lives on the org's settings doc at
 * `sms_config.from_number` (doc id = org_ref). Returns null if no org has
 * claimed the number — the webhook then has nothing to file against.
 */
export async function orgRefForNumber(
  db: Firestore,
  toNumber: string,
): Promise<string | null> {
  const e164 = toE164(toNumber) ?? toNumber.trim();
  const snap = await db
    .collection("settings")
    .where("sms_config.from_number", "==", e164)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

/**
 * File a normalized inbound text. Matches the deal by the sender's phone
 * (primary signal for SMS), writes an email_messages doc, summarizes matched
 * incoming mail, and pulls any MMS media onto the deal's Files. Idempotent by
 * provider id. Returns the matched deal ref, or null (unassigned/dropped).
 */
export async function ingestInboundSms(
  db: Firestore,
  orgRef: string,
  msg: NormalizedInboundSms,
  summarize = true,
): Promise<string | null> {
  const fromE164 = toE164(msg.from);
  // A valid person texts from a real 10/11-digit number. Marketing short
  // codes (4–6 digits) don't normalize — drop them so they never reach the
  // Inbox or the unassigned queue.
  if (!fromE164) return null;

  const body = (msg.body ?? "").trim();
  const dealRef = await matchDealForOrg(db, orgRef, {
    subject: "",
    text: body,
    phones: [fromE164],
  });

  const id = `sms_${msg.providerId}`.replace(/[^A-Za-z0-9_]/g, "").slice(0, 120);
  const hasMedia = msg.media.length > 0;

  // Only summarize real, matched, incoming client mail (never spend an LLM
  // call on an unassigned stray). SMS has no subject line.
  const ai =
    summarize && dealRef ? await summarizeEmail("", body) : {};

  await db
    .collection("email_messages")
    .doc(id)
    .set(
      {
        id,
        org_ref: orgRef,
        deal_ref: dealRef, // null → unassigned review queue
        status: dealRef ? "matched" : "unassigned",
        from: fromE164,
        from_email: "", // SMS has no email address
        from_phone: fromE164,
        subject: "", // texts have no subject
        snippet: snippetOf(body) || (hasMedia ? "(photo)" : ""),
        body_text: body.slice(0, 20000),
        has_attachments: hasMedia,
        received_at: msg.receivedAt ?? new Date().toISOString(),
        source: "sms",
        direction: "in",
        message_id: msg.providerId,
        provider_id: msg.providerId,
        thread_id: null,
        ...(ai.summary ? { ai_summary: ai.summary } : {}),
        ...(ai.action_items?.length ? { ai_action_items: ai.action_items } : {}),
      },
      { merge: true },
    );

  // MMS photos → the deal's Files (real, matched mail only). Best-effort:
  // a media-fetch failure never blocks filing the message itself.
  if (summarize && dealRef && hasMedia) {
    try {
      await storeSmsMedia(db, dealRef, msg);
    } catch {
      /* best-effort */
    }
  }
  return dealRef;
}

/**
 * Download MMS media and store it on the deal's Files, in the same
 * `attachments` collection the Files panel reads (category "sms"). Idempotent
 * per media index + size-capped, mirroring storeEmailAttachments.
 */
async function storeSmsMedia(
  db: Firestore,
  dealRef: string,
  msg: NormalizedInboundSms,
): Promise<number> {
  const bucket = adminStorage().bucket(adminBucketName());
  let stored = 0;

  for (let i = 0; i < msg.media.length; i++) {
    const m = msg.media[i];
    const docId = `smsatt_${msg.providerId}_${i}`
      .replace(/[^A-Za-z0-9_]/g, "")
      .slice(0, 120);

    const existing = await db.collection("attachments").doc(docId).get();
    if (existing.exists) continue;

    const res = await fetch(m.url);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) continue;

    const contentType =
      m.contentType || res.headers.get("content-type") || "application/octet-stream";
    const ext = contentType.includes("jpeg")
      ? "jpg"
      : contentType.includes("png")
        ? "png"
        : contentType.includes("gif")
          ? "gif"
          : contentType.includes("pdf")
            ? "pdf"
            : "bin";
    const name = (m.name || `text-photo-${i + 1}.${ext}`).replace(/[/\\]/g, "_");

    const path = `deals/${dealRef}/sms/${docId}-${name}`.replace(/\s+/g, "_");
    const token = randomUUID();
    await bucket.file(path).save(buf, {
      contentType,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

    await db.collection("attachments").doc(docId).set({
      id: docId,
      deal_ref: dealRef,
      category: "sms",
      name,
      url,
      size: buf.byteLength,
      storage_path: path,
      uploaded_at: new Date().toISOString(),
      source_message_id: msg.providerId,
    });
    stored += 1;
  }
  return stored;
}
