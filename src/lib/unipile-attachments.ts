// Pulls a filed email's attachments out of Gmail/Outlook (via Unipile) and
// into the deal's Files tab, so the client's photos / plans / signed docs
// live on the project — not stranded in the builder's inbox. Server-side
// (admin SDK + Unipile key). Writes to the same `attachments` collection the
// Files panel reads, under the existing "email" category. Idempotent + size-
// capped + fully best-effort (a failure never affects email filing).

import type { Firestore } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { adminStorage, adminBucketName } from "./firebase-admin";
import { fetchAttachmentBytes, type UnipileEmail } from "./unipile";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function storeEmailAttachments(
  db: Firestore,
  dealRef: string,
  email: UnipileEmail,
): Promise<number> {
  const emailId = email.id;
  const atts = email.attachments ?? [];
  if (!emailId || atts.length === 0) return 0;

  const bucket = adminStorage().bucket(adminBucketName());
  let stored = 0;

  for (const a of atts) {
    const attId = String(a.id ?? "");
    if (!attId) continue;
    const name = String(a.name || a.filename || "attachment").replace(/[/\\]/g, "_");
    if (typeof a.size === "number" && a.size > MAX_BYTES) continue;

    const docId = `unatt_${email.provider_id || emailId}_${attId}`
      .replace(/[^A-Za-z0-9_]/g, "")
      .slice(0, 120);

    // Idempotent — don't re-download/re-store on a re-sync.
    const existing = await db.collection("attachments").doc(docId).get();
    if (existing.exists) continue;

    const fetched = await fetchAttachmentBytes(emailId, attId);
    if (!fetched || fetched.bytes.byteLength > MAX_BYTES) continue;

    const path = `deals/${dealRef}/email/${docId}-${name}`.replace(/\s+/g, "_");
    const token = randomUUID();
    await bucket.file(path).save(Buffer.from(fetched.bytes), {
      contentType: a.mime ? String(a.mime) : fetched.contentType,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

    await db.collection("attachments").doc(docId).set({
      id: docId,
      deal_ref: dealRef,
      category: "email",
      name,
      url,
      size: fetched.bytes.byteLength,
      storage_path: path,
      uploaded_at: new Date().toISOString(),
    });
    stored += 1;
  }
  return stored;
}
