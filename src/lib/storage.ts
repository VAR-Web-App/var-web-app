// Firebase Storage helpers — upload + delete for attachments and photos.
//
// Bytes used to live as in-browser object URLs (URL.createObjectURL),
// which evaporate the moment the tab closes. These helpers wire the same
// flow to a real Storage bucket so invoices/receipts/photos survive a
// reload and a device switch.
//
// Path layout:
//   attachments/{dealId}/{attachmentId}-{safeName}
//   photos/{dealId}/{photoId}-{safeName}
//
// Both delete paths are best-effort: a missing Storage object doesn't
// block the Firestore record deletion, because seeing a ghost record
// after a partial delete is worse than seeing an orphaned file in the
// bucket that storage rules already prevent the public from listing.

"use client";

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { storage } from "./firebase";

export interface UploadResult {
  /** Permanent download URL — safe to store on a Firestore record. */
  url: string;
  /** Storage path (e.g. "attachments/deal_abc/att_xyz-invoice.pdf") — pass
   *  back to deleteUploadedFile when the record is removed. */
  storagePath: string;
}

/** Strip the bits of a filename that play badly with Storage paths
 *  (slashes, control chars). Keeps dots/dashes/underscores intact for
 *  recognizable file names in the bucket. */
function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
}

/** Upload a file under attachments/{dealId}/{recordId}-{name}. */
export async function uploadAttachmentFile(
  file: File,
  dealId: string,
  recordId: string,
): Promise<UploadResult> {
  const storagePath = `attachments/${dealId}/${recordId}-${safeName(file.name)}`;
  return uploadAndUrl(file, storagePath);
}

/** Upload a photo under photos/{dealId}/{photoId}-{name}. */
export async function uploadPhotoFile(
  file: File,
  dealId: string,
  photoId: string,
): Promise<UploadResult> {
  const storagePath = `photos/${dealId}/${photoId}-${safeName(file.name)}`;
  return uploadAndUrl(file, storagePath);
}

async function uploadAndUrl(file: File, path: string): Promise<UploadResult> {
  const handle = ref(storage, path);
  await uploadBytes(handle, file, { contentType: file.type || undefined });
  const url = await getDownloadURL(handle);
  return { url, storagePath: path };
}

/** Best-effort delete. Swallows "object not found" so a partially-deleted
 *  record (Firestore gone but Storage missing) still removes cleanly. */
export async function deleteUploadedFile(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    if (code === "storage/object-not-found") return;
    console.warn("[storage] delete failed", storagePath, e);
  }
}
