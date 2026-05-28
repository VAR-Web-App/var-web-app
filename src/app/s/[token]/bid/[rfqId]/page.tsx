"use client";

// Public sub-side bid submission page. The sub clicks the link in their
// RFQ-invite SMS and lands here. The page validates {token, rfqId} via
// GET /api/sub/bid (server-mediated — RFQs are NOT public-read), then
// shows scope + a bid form. Submit goes through POST /api/sub/bid which
// updates the RFQInvitee and texts the GC.

import { use, useEffect, useRef, useState } from "react";

interface BidAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  uploaded_at: string;
}

interface LoadView {
  rfq_id: string;
  scope_title: string;
  scope_description: string;
  phase: string;
  status: "draft" | "sent" | "comparing" | "awarded" | "closed";
  project_name: string;
  project_address?: string;
  builder_name: string;
  sub_name: string;
  my_bid?: {
    amount?: number;
    notes?: string;
    responded_at?: string;
  };
  attachments: BidAttachment[];
  closed: boolean;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT_MIME =
  "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BidPage({
  params,
}: {
  params: Promise<{ token: string; rfqId: string }>;
}) {
  const { token, rfqId } = use(params);

  const [view, setView] = useState<LoadView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Form state
  const [bidAmount, setBidAmount] = useState("");
  const [bidNotes, setBidNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Attachment state — uploads happen independently of bid submit so a
  // sub can attach a PDF first, then fill out the amount, then submit.
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/sub/bid?token=${encodeURIComponent(token)}&rfqId=${encodeURIComponent(rfqId)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          view?: LoadView;
          error?: string;
        };
        if (!active) return;
        if (!res.ok || !data.ok || !data.view) {
          setLoadError(data.error ?? "load_failed");
        } else {
          setView(data.view);
          if (data.view.my_bid?.amount !== undefined) {
            setBidAmount(String(data.view.my_bid.amount));
          }
          if (data.view.my_bid?.notes) {
            setBidNotes(data.view.my_bid.notes);
          }
        }
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setLoadError("network_error");
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [token, rfqId]);

  async function submit() {
    if (!view) return;
    const amt = parseFloat(bidAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setSubmitError("Enter a valid bid amount.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/sub/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          rfqId,
          bid_amount: amt,
          bid_notes: bidNotes.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setSubmitError(humanError(data.error));
        return;
      }
      setSubmitted(true);
      // Refresh view so the page now shows "you've already submitted".
      setView({
        ...view,
        my_bid: {
          amount: amt,
          ...(bidNotes.trim() ? { notes: bidNotes.trim() } : {}),
          responded_at: new Date().toISOString(),
        },
      });
    } catch {
      setSubmitError("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function upload(file: File) {
    if (!view) return;
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("File is larger than 10 MB.");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("token", token);
      form.append("rfqId", rfqId);
      form.append("file", file);
      const res = await fetch("/api/sub/bid/attach", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        attachment?: BidAttachment;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.attachment) {
        setUploadError(humanError(data.error));
        return;
      }
      setView({
        ...view,
        attachments: [data.attachment, ...view.attachments],
      });
    } catch {
      setUploadError("Network error — try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeAttachment(att: BidAttachment) {
    if (!view) return;
    if (!confirm(`Remove ${att.name}?`)) return;
    setDeletingId(att.id);
    try {
      const res = await fetch(
        `/api/sub/bid/attach?token=${encodeURIComponent(token)}&rfqId=${encodeURIComponent(rfqId)}&attId=${encodeURIComponent(att.id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setUploadError(humanError(data.error));
        return;
      }
      setView({
        ...view,
        attachments: view.attachments.filter((a) => a.id !== att.id),
      });
    } catch {
      setUploadError("Network error — try again.");
    } finally {
      setDeletingId(null);
    }
  }

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="text-sm text-slate-500">Loading…</div>
      </main>
    );
  }

  if (loadError || !view) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <p className="text-4xl">📋</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">
          Bid request unavailable
        </h1>
        <p className="mt-2 text-sm text-slate-600">{humanError(loadError)}</p>
      </main>
    );
  }

  const isClosed = view.closed;
  const hasExistingBid = view.my_bid?.amount !== undefined;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3 sm:px-6 sm:py-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
            Bid request · {view.phase}
          </div>
          <div className="mt-0.5 text-lg font-semibold text-slate-900 sm:text-base">
            {view.scope_title}
          </div>
          <div className="text-xs text-slate-500">
            {view.project_name} · from {view.builder_name || "your builder"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:px-6 sm:py-8">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Scope of work
          </h2>
          {view.scope_description ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
              {view.scope_description}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-slate-500">
              No description provided — contact the builder for details.
            </p>
          )}
          {view.project_address && (
            <p className="mt-3 text-xs text-slate-500">
              📍 {view.project_address.split("\n")[0]}
            </p>
          )}
        </section>

        {isClosed ? (
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            This bid request has been{" "}
            {view.status === "awarded" ? "awarded" : "closed"}. Reach out to{" "}
            {view.builder_name || "the builder"} if you have questions.
          </section>
        ) : submitted || hasExistingBid ? (
          <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="font-semibold">
              ✓ Bid submitted
              {view.my_bid?.responded_at && (
                <span className="ml-2 font-normal text-emerald-700">
                  {new Date(view.my_bid.responded_at).toLocaleString()}
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-emerald-700">
                  Your bid
                </div>
                <div className="font-semibold tabular-nums">
                  ${view.my_bid?.amount?.toLocaleString("en-US")}
                </div>
              </div>
              {view.my_bid?.notes && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700">
                    Notes
                  </div>
                  <div className="text-xs text-slate-800">
                    {view.my_bid.notes}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-emerald-800">
              Need to revise? You can resubmit below — your latest bid replaces
              the previous one.
            </p>
          </section>
        ) : null}

        {!isClosed && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {hasExistingBid ? "Revise your bid" : "Submit your bid"}
            </h2>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Bid amount (USD)
                </span>
                <div className="relative mt-1">
                  <span className="absolute inset-y-0 left-3 flex items-center text-base text-slate-500">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={submitting}
                    className="block min-h-[44px] w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-base tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50"
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Notes (inclusions, exclusions, timeline)
                </span>
                <textarea
                  value={bidNotes}
                  onChange={(e) => setBidNotes(e.target.value)}
                  rows={5}
                  disabled={submitting}
                  placeholder="e.g. Includes materials and labor. Excludes permit fees. Available start week of June 10."
                  maxLength={2000}
                  // text-base (16px) avoids iOS Safari auto-zoom on focus.
                  className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-base focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50 sm:text-sm"
                />
                <span className="mt-1 block text-[10px] text-slate-400">
                  {bidNotes.length}/2000
                </span>
              </label>

              {/* Attachments — optional. Sub can attach itemized PDF,
               *  reference photos, etc. Uploads independent of submit. */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">
                    Attach files {view.attachments.length > 0 && `(${view.attachments.length})`}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    PDF or image · max 10 MB
                  </span>
                </div>
                <div className="mt-1 space-y-2">
                  {view.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-xs font-medium text-sky-700 hover:underline"
                      >
                        📎 {att.name}
                      </a>
                      <span className="shrink-0 text-[10px] text-slate-500">
                        {fmtBytes(att.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(att)}
                        disabled={deletingId === att.id || submitting}
                        className="shrink-0 text-[11px] font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {deletingId === att.id ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  ))}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT_MIME}
                    disabled={uploading || submitting}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                    }}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-sky-700 hover:file:bg-sky-100 disabled:opacity-50"
                  />
                  {uploading && (
                    <p className="text-[11px] text-slate-500">Uploading…</p>
                  )}
                  {uploadError && (
                    <p className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 ring-1 ring-red-200">
                      {uploadError}
                    </p>
                  )}
                </div>
              </div>

              {submitError && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                  {submitError}
                </div>
              )}
              <button
                onClick={submit}
                disabled={submitting || !bidAmount}
                className="flex min-h-[48px] w-full items-center justify-center rounded-md bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 active:bg-sky-900 disabled:cursor-not-allowed disabled:bg-sky-300"
              >
                {submitting
                  ? "Submitting…"
                  : hasExistingBid
                    ? "Update bid"
                    : `Submit bid to ${view.builder_name || "builder"}`}
              </button>
            </div>
          </section>
        )}

        <footer className="text-center text-xs text-slate-400">
          Submitted as {view.sub_name}. Questions? Contact{" "}
          {view.builder_name || "your builder"}.
        </footer>
      </main>
    </div>
  );
}

function humanError(code?: string | null): string {
  switch (code) {
    case "token_not_found":
      return "This link has expired or is invalid.";
    case "rfq_not_found":
      return "This bid request no longer exists.";
    case "not_invited":
      return "You're not on the invitee list for this bid request.";
    case "rfq_closed":
      return "This bid request is already awarded or closed.";
    case "deal_not_found":
      return "The project for this bid request is unavailable.";
    case "not_configured":
      return "Action temporarily unavailable. Try again later.";
    case "file_too_large":
      return "File is larger than 10 MB.";
    case "unsupported_type":
      return "Only PDF or image files are accepted.";
    case "empty_file":
      return "That file appears to be empty.";
    case "invalid_form":
      return "Couldn't read the file. Try a different one.";
    case "attachment_not_found":
      return "That file is already gone.";
    case "not_owned":
      return "You can only remove files you uploaded.";
    case "network_error":
      return "Network error — check your connection and refresh.";
    default:
      return "Couldn't load this bid request. Try refreshing.";
  }
}
