"use client";

import { useEffect, useRef, useState } from "react";
import {
  CameraIcon,
  DocumentArrowUpIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  deleteAttachment,
  listAttachments,
  newId,
  saveAttachment,
} from "@/lib/store";
import { uploadAttachmentFile } from "@/lib/storage";
import type { Attachment } from "@/types";

type DrawCategory = "draw_invoice" | "draw_receipt";

/**
 * Mobile-friendly upload section for the draw page. Builder takes a
 * photo of an invoice or receipt on their phone, it attaches to this
 * milestone so the draw package can bundle everything for the bank.
 *
 * Bytes today live as in-browser object URLs (matching the existing
 * Attachment demo pattern — see types/index.ts). Wiring real Firebase
 * Storage so files survive across sessions/devices is in FEATURES.md.
 */
export default function DrawAttachmentsSection({
  dealId,
  milestoneId,
}: {
  dealId: string;
  milestoneId: string;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultCategory, setDefaultCategory] =
    useState<DrawCategory>("draw_receipt");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const all = await listAttachments(dealId);
      if (!active) return;
      const mine = all.filter(
        (a) =>
          a.milestone_ref === milestoneId &&
          (a.category === "draw_invoice" || a.category === "draw_receipt"),
      );
      setAttachments(mine);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [dealId, milestoneId]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const created: Attachment[] = [];
      for (const file of Array.from(files)) {
        const attId = newId("att");
        const { url, storagePath } = await uploadAttachmentFile(
          file,
          dealId,
          attId,
        );
        const att: Attachment = {
          id: attId,
          deal_ref: dealId,
          milestone_ref: milestoneId,
          category: defaultCategory,
          name: file.name || "attachment",
          url,
          storage_path: storagePath,
          size: file.size,
          uploaded_at: new Date().toISOString(),
        };
        await saveAttachment(att);
        created.push(att);
      }
      setAttachments((prev) => [...prev, ...created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeOne(id: string) {
    setError(null);
    try {
      await deleteAttachment(id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function pickFile(mode: "upload" | "camera") {
    const el = fileInputRef.current;
    if (!el) return;
    if (mode === "camera") {
      el.setAttribute("capture", "environment");
    } else {
      el.removeAttribute("capture");
    }
    el.click();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Invoices & receipts
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Attach sub invoices and supplier receipts to this draw. On a
            phone, &ldquo;Take photo&rdquo; opens the camera.
          </p>
        </div>
        <label className="text-xs text-slate-500">
          Tag as:
          <select
            value={defaultCategory}
            onChange={(e) =>
              setDefaultCategory(e.target.value as DrawCategory)
            }
            className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="draw_receipt">Receipt</option>
            <option value="draw_invoice">Invoice</option>
          </select>
        </label>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
          aria-label="Upload invoice or receipt"
        />
        <button
          type="button"
          onClick={() => pickFile("upload")}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <DocumentArrowUpIcon className="h-4 w-4" />
          Upload file
        </button>
        <button
          type="button"
          onClick={() => pickFile("camera")}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-60"
        >
          <CameraIcon className="h-4 w-4" />
          Take photo
        </button>
        {uploading ? (
          <span className="self-center text-xs text-slate-500">Uploading…</span>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        {!loaded ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : attachments.length === 0 ? (
          <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No invoices or receipts attached yet. Tap &ldquo;Take photo&rdquo; to
            capture one.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {attachments.map((a) => (
              <AttachmentRow
                key={a.id}
                attachment={a}
                onRemove={() => removeOne(a.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AttachmentRow({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const isImage =
    /\.(jpe?g|png|webp|gif|heic)$/i.test(attachment.name) ||
    attachment.url.startsWith("data:image/");
  const sizeKb = (attachment.size / 1024).toFixed(0);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.url}
          alt={attachment.name}
          className="h-14 w-14 flex-shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-semibold uppercase text-slate-500">
          {attachment.name.match(/\.pdf$/i) ? "PDF" : "FILE"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium text-slate-900 hover:text-sky-700"
        >
          {attachment.name}
        </a>
        <p className="text-xs text-slate-500">
          {attachment.category === "draw_invoice" ? "Invoice" : "Receipt"} ·{" "}
          {sizeKb} KB
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
        aria-label="Remove attachment"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}
