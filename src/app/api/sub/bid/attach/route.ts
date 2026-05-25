// POST  /api/sub/bid/attach   — sub uploads a file with their bid
// DELETE /api/sub/bid/attach   — sub removes a file they uploaded
//
// Multipart upload from the public bid portal. Same trust model as
// /api/sub/bid: the token resolves to a sub, and we only accept uploads
// when that sub is on the RFQ's invitee list. Files land at
//   attachments/{dealId}/{filename}
// (matching the GC-side path so the deal-page Files view picks them up
// alongside everything else). The Attachment doc carries rfq_ref +
// sub_ref so the RFQ review can pull just this sub's files.
//
// Limits:
//   - 10 MB per file
//   - Accepted MIME: PDF, JPEG, PNG, WebP, HEIC. Everything else 415s.
//
// Storage rules don't need a public-write path — admin SDK bypasses
// them entirely. Public read of the file URL relies on the standard
// Firebase download-token pattern (`?alt=media&token=...`).

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  adminBucketName,
  adminConfigured,
  adminDb,
  adminStorage,
} from "@/lib/firebase-admin";
import type { ProjectRFQ, SubScheduleLink } from "@/types/builder";
import type { Attachment, Deal } from "@/types";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_form" },
      { status: 400 },
    );
  }

  const token = (form.get("token") as string | null) ?? "";
  const rfqId = (form.get("rfqId") as string | null) ?? "";
  const file = form.get("file");
  if (!token || !rfqId || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "empty_file" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "file_too_large" },
      { status: 413 },
    );
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { ok: false, error: "unsupported_type" },
      { status: 415 },
    );
  }

  const resolved = await resolveCaller(token, rfqId);
  if ("error" in resolved) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status },
    );
  }
  const { link, rfq, deal } = resolved;

  // Filename sanitize: keep extension, replace spaces/illegal chars,
  // prepend a short id so two uploads of "scope.pdf" don't collide.
  const safeName = sanitizeFilename(file.name);
  const attId = newId();
  const storagePath = `attachments/${deal.id}/${attId}-${safeName}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const downloadToken = randomUUID();
  const bucket = adminStorage().bucket(adminBucketName());
  await bucket.file(storagePath).save(buf, {
    contentType: mime,
    metadata: {
      contentType: mime,
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });

  const downloadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}` +
    `/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

  const att: Attachment = {
    id: attId,
    deal_ref: deal.id,
    category: "sub_bid",
    name: safeName,
    url: downloadUrl,
    size: file.size,
    uploaded_at: new Date().toISOString(),
    rfq_ref: rfq.id,
    sub_ref: link.sub_ref,
    storage_path: storagePath,
  };
  await adminDb().collection("attachments").doc(attId).set(att);

  return NextResponse.json({ ok: true, attachment: att });
}

export async function DELETE(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  }

  const url = req.nextUrl;
  const token = url.searchParams.get("token") ?? "";
  const rfqId = url.searchParams.get("rfqId") ?? "";
  const attId = url.searchParams.get("attId") ?? "";
  if (!token || !rfqId || !attId) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  const resolved = await resolveCaller(token, rfqId);
  if ("error" in resolved) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status },
    );
  }
  const { link, rfq } = resolved;

  const db = adminDb();
  const attSnap = await db.collection("attachments").doc(attId).get();
  if (!attSnap.exists) {
    return NextResponse.json(
      { ok: false, error: "attachment_not_found" },
      { status: 404 },
    );
  }
  const att = attSnap.data() as Attachment;
  // Only the original sub uploader can delete their own bid file.
  if (
    att.category !== "sub_bid" ||
    att.sub_ref !== link.sub_ref ||
    att.rfq_ref !== rfq.id
  ) {
    return NextResponse.json(
      { ok: false, error: "not_owned" },
      { status: 403 },
    );
  }

  if (att.storage_path) {
    try {
      await adminStorage()
        .bucket(adminBucketName())
        .file(att.storage_path)
        .delete();
    } catch (e) {
      // Storage delete failures shouldn't block the Firestore delete —
      // orphaned bytes are recoverable; orphaned doc references are
      // worse for the UI.
      console.warn("[sub/bid/attach] storage delete failed", e);
    }
  }
  await db.collection("attachments").doc(attId).delete();

  return NextResponse.json({ ok: true });
}

// ── helpers ─────────────────────────────────────────────────────

type Resolved =
  | { error: string; status: number }
  | { rfq: ProjectRFQ; link: SubScheduleLink; deal: Deal };

async function resolveCaller(token: string, rfqId: string): Promise<Resolved> {
  const db = adminDb();
  const linkSnap = await db.collection("sub_schedule_links").doc(token).get();
  if (!linkSnap.exists) return { error: "token_not_found", status: 404 };
  const link = linkSnap.data() as SubScheduleLink;

  const rfqSnap = await db.collection("project_rfqs").doc(rfqId).get();
  if (!rfqSnap.exists) return { error: "rfq_not_found", status: 404 };
  const rfq = { id: rfqSnap.id, ...(rfqSnap.data() as Omit<ProjectRFQ, "id">) };
  if (rfq.org_ref !== link.org_ref) {
    return { error: "not_invited", status: 403 };
  }
  if (!rfq.invitees.some((i) => i.sub_ref === link.sub_ref)) {
    return { error: "not_invited", status: 403 };
  }
  if (rfq.status === "awarded" || rfq.status === "closed") {
    return { error: "rfq_closed", status: 409 };
  }

  const dealSnap = await db.collection("deals").doc(rfq.deal_ref).get();
  if (!dealSnap.exists) return { error: "deal_not_found", status: 404 };
  const deal = { id: dealSnap.id, ...(dealSnap.data() as Omit<Deal, "id">) };
  return { rfq, link, deal };
}

function sanitizeFilename(name: string): string {
  // Strip directory components, collapse whitespace, drop anything that
  // isn't a safe URL/path character. Keeps the extension.
  const base = name.split(/[/\\]/).pop() ?? "file";
  return (
    base
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9._-]/g, "")
      .slice(0, 80) || "file"
  );
}

function newId(): string {
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
