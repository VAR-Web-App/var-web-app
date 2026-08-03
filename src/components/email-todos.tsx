"use client";

// "Needs reply" — the Inbox action surface for client email. A received,
// deal-linked message is a to-do until the builder marks it addressed. Each
// row links to the deal and clears itself on "Mark addressed". Self-hides
// when the list is empty.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  EnvelopeIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import {
  watchAttentionEmails,
  markEmailAddressed,
  listDeals,
  logEmailAsRequest,
  listAttachments,
} from "@/lib/store";
import type { Attachment } from "@/types";
import {
  ClipboardDocumentCheckIcon,
  ChevronDownIcon,
  PaperClipIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/lib/auth-context";
import Tooltip from "@/components/tooltip";
import AttachmentViewerModal from "@/components/attachment-viewer-modal";
import ReplyBox from "@/components/reply-box";
import type { EmailMessage } from "@/types/builder";

export default function EmailTodos() {
  const { profile } = useAuth();
  const [items, setItems] = useState<EmailMessage[]>([]);
  const [dealNames, setDealNames] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<EmailMessage | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [attByMsg, setAttByMsg] = useState<Record<string, Attachment[]>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // When an email with attachments is expanded, load the files that were
  // pulled onto its deal from that message, so they show inline.
  useEffect(() => {
    const m = items.find((x) => x.id === openId);
    if (!m || !m.has_attachments || !m.deal_ref || attByMsg[m.id]) return;
    const key = m.message_id || m.id;
    listAttachments(m.deal_ref)
      .then((all) =>
        setAttByMsg((prev) => ({
          ...prev,
          [m.id]: all.filter(
            (a) => a.category === "email" && a.source_message_id === key,
          ),
        })),
      )
      .catch(() => {});
  }, [openId, items, attByMsg]);

  useEffect(() => {
    if (!profile?.org_ref) return;
    listDeals(profile.org_ref)
      .then((deals) =>
        setDealNames(Object.fromEntries(deals.map((d) => [d.id, d.name]))),
      )
      .catch(() => {});
    // Live — new client mail shows up here without a resync or reload.
    const unsub = watchAttentionEmails(profile.org_ref, (emails) => {
      setItems(emails);
      setLoaded(true);
    });
    return unsub;
  }, [profile?.org_ref]);

  async function address(id: string) {
    setItems((prev) => prev.filter((m) => m.id !== id)); // optimistic
    await markEmailAddressed(id).catch(() => {});
  }

  const [logged, setLogged] = useState<Set<string>>(new Set());
  async function logReq(m: EmailMessage) {
    setLogged((prev) => new Set(prev).add(m.id));
    await logEmailAsRequest(m).catch(() => {});
  }

  // Log a single ask (from the AI breakdown) as its own request — one email
  // can hold several unrelated asks, each of which may become its own CO.
  const [loggedAsks, setLoggedAsks] = useState<Set<string>>(new Set());
  async function logAsk(m: EmailMessage, ask: string, key: string) {
    setLoggedAsks((prev) => new Set(prev).add(key));
    await logEmailAsRequest(m, ask).catch(() => {});
  }

  if (!loaded || items.length === 0) return null;

  // Group the flat "needs reply" list by project so the Inbox reads as one
  // section per job (matches the deal-centric mental model). Projects are
  // ordered by most-recent unanswered email; anything not yet tied to a
  // project falls into an "Unassigned" section pinned to the bottom.
  const UNASSIGNED = "__unassigned__";
  const byProject = new Map<string, EmailMessage[]>();
  for (const m of items) {
    const key = m.deal_ref && dealNames[m.deal_ref] ? m.deal_ref : UNASSIGNED;
    const arr = byProject.get(key);
    if (arr) arr.push(m);
    else byProject.set(key, [m]);
  }
  const groups = Array.from(byProject.entries())
    .map(([key, msgs]) => ({
      key,
      name: key === UNASSIGNED ? "Unassigned" : dealNames[key],
      msgs,
      latest: msgs.reduce((max, m) => (m.received_at > max ? m.received_at : max), ""),
    }))
    .sort((a, b) => {
      if (a.key === UNASSIGNED) return 1;
      if (b.key === UNASSIGNED) return -1;
      return b.latest.localeCompare(a.latest);
    });

  return (
    <section className="mb-6 rounded-xl border border-sky-200 bg-sky-50/50 shadow-sm">
      <header className="flex items-center gap-2 border-b border-sky-200 px-4 py-3">
        <EnvelopeIcon className="h-4 w-4 text-sky-700" />
        <h2 className="text-sm font-semibold text-slate-900">Needs reply</h2>
        <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {items.length}
        </span>
        <a
          href="https://mail.google.com/mail/u/0/"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
        >
          Open Gmail ↗
        </a>
      </header>
      <div className="divide-y divide-sky-200">
        {groups.map((g) => {
          const open = !collapsedGroups.has(g.key);
          return (
            <div key={g.key}>
              <button
                onClick={() => toggleGroup(g.key)}
                className="flex w-full items-center gap-2 bg-sky-100/40 px-4 py-2 text-left hover:bg-sky-100/70"
              >
                <ChevronDownIcon
                  className={`h-4 w-4 shrink-0 text-sky-700 transition-transform ${open ? "" : "-rotate-90"}`}
                />
                <span className="truncate text-xs font-bold uppercase tracking-wider text-slate-600">
                  {g.name}
                </span>
                <span className="rounded-full bg-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                  {g.msgs.length}
                </span>
              </button>
              {open && (
                <ul className="divide-y divide-sky-100">
                  {g.msgs.map((m) => {
                    const asks = m.ai_action_items ?? [];
                    const multiAsk = asks.length > 1;
                    return (
                      <li key={m.id} className="px-4 py-3">
              <button
                onClick={() => setOpenId(openId === m.id ? null : m.id)}
                className="flex w-full items-start gap-2 text-left hover:opacity-80"
              >
                <ChevronDownIcon
                  className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${openId === m.id ? "rotate-180" : ""}`}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-sm font-medium text-slate-900">
                    <span className="truncate">
                      {m.subject || "(no subject)"}
                    </span>
                    {m.has_attachments && (
                      <PaperClipIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {m.from || m.from_email}
                    {m.deal_ref && dealNames[m.deal_ref]
                      ? ` · ${dealNames[m.deal_ref]}`
                      : ""}
                  </span>
                  {m.ai_summary && (
                    <span className="mt-0.5 block truncate text-xs italic text-sky-700">
                      {m.ai_summary}
                    </span>
                  )}
                  {multiAsk && openId !== m.id && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      {asks.length} separate asks — expand to log each
                    </span>
                  )}
                </span>
              </button>
              {openId === m.id && (
                <div className="mt-2 space-y-2">
                  {m.ai_action_items && m.ai_action_items.length > 0 && (
                    <ul className="rounded-md bg-sky-50 p-2.5 text-xs text-slate-700 ring-1 ring-sky-100">
                      <li className="mb-1 font-semibold text-slate-500">
                        Asks — log each as its own request:
                      </li>
                      {m.ai_action_items.map((a, i) => {
                        const key = `${m.id}::${i}`;
                        return (
                          <li
                            key={i}
                            className="flex items-start justify-between gap-2 py-0.5"
                          >
                            <span className="flex min-w-0 gap-1.5">
                              <span className="text-sky-600">•</span>
                              <span>{a}</span>
                            </span>
                            {loggedAsks.has(key) ? (
                              <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                                ✓ Logged
                                <Link
                                  href={`/deals/${m.deal_ref}#requests`}
                                  className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-100"
                                >
                                  View →
                                </Link>
                              </span>
                            ) : (
                              <Tooltip
                                label="Log this ask as its own request"
                                placement="left"
                              >
                                <button
                                  onClick={() => void logAsk(m, a, key)}
                                  className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-sky-700 hover:bg-sky-50"
                                >
                                  + Log
                                </button>
                              </Tooltip>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {m.request_ref && (
                    <Link
                      href={`/deals/${m.deal_ref}#requests`}
                      className="inline-flex items-center gap-1 self-start rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" />
                      View logged requests on the project →
                    </Link>
                  )}
                  <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-white p-3 text-xs leading-relaxed text-slate-700 ring-1 ring-sky-100">
                    {m.body_text || m.snippet || "(no message body)"}
                  </div>
                  {m.has_attachments && (
                    <div className="rounded-md border border-slate-200 bg-white p-2.5 text-xs">
                      <p className="mb-1 flex items-center gap-1 font-semibold text-slate-500">
                        <PaperClipIcon className="h-3.5 w-3.5" />
                        Attachments
                      </p>
                      {(attByMsg[m.id] ?? []).map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between gap-2 py-0.5"
                        >
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate font-medium text-slate-800 hover:underline"
                          >
                            {a.name}
                          </a>
                          <span className="shrink-0 text-slate-400">
                            {(a.size / 1024).toFixed(0)} KB
                          </span>
                        </div>
                      ))}
                      <Link
                        href={`/deals/${m.deal_ref}/files`}
                        className="mt-1 inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                      >
                        {attByMsg[m.id] === undefined
                          ? "Saving to Files…"
                          : "Open / parse in Files →"}
                      </Link>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Tooltip label="Open the project" placement="top">
                  <Link
                    href={`/deals/${m.deal_ref}`}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    View project
                  </Link>
                </Tooltip>
                {m.has_attachments && (
                  <Tooltip label="View & parse the attachment" placement="top">
                    <button
                      onClick={() => setViewing(m)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <PaperClipIcon className="h-3.5 w-3.5" />
                      View attachment
                    </button>
                  </Tooltip>
                )}
                <Tooltip label="Reply from here (sends from your inbox)" placement="top">
                  <button
                    onClick={() =>
                      setReplyingId(replyingId === m.id ? null : m.id)
                    }
                    className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                  >
                    <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                    Reply
                  </button>
                </Tooltip>
                {multiAsk ? (
                  <Tooltip
                    label={`This email has ${asks.length} separate asks — expand and log each as its own request`}
                    placement="top"
                  >
                    <button
                      onClick={() => setOpenId(openId === m.id ? null : m.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                    >
                      <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" />
                      {openId === m.id
                        ? "Hide asks"
                        : `${asks.length} asks — expand to log`}
                    </button>
                  </Tooltip>
                ) : logged.has(m.id) || m.request_ref ? (
                  <Tooltip label="Go to the request on the project" placement="top">
                    <Link
                      href={`/deals/${m.deal_ref}#requests`}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" />
                      View request →
                    </Link>
                  </Tooltip>
                ) : (
                  <Tooltip
                    label="Log the whole email as one request"
                    placement="top"
                  >
                    <button
                      onClick={() => void logReq(m)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" />
                      Log request
                    </button>
                  </Tooltip>
                )}
                <Tooltip
                  label="Clear it from your to-do list — the email stays on the project record"
                  placement="top"
                >
                  <button
                    onClick={() => void address(m.id)}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Mark handled
                  </button>
                </Tooltip>
              </div>
              {replyingId === m.id && (
                <div className="mt-2 rounded-md border border-sky-200 bg-white p-2.5">
                  <ReplyBox
                    to={m.from_email}
                    subject={m.subject}
                    replyTo={m.provider_id}
                    dealRef={m.deal_ref}
                    threadId={m.thread_id}
                    onSent={() => setReplyingId(null)}
                  />
                </div>
              )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {viewing && (
        <AttachmentViewerModal
          dealRef={viewing.deal_ref ?? ""}
          orgRef={profile?.org_ref ?? ""}
          dealName={
            (viewing.deal_ref && dealNames[viewing.deal_ref]) || "this project"
          }
          sourceKey={viewing.message_id || viewing.id}
          subject={viewing.subject}
          fromLabel={viewing.from || viewing.from_email}
          toEmail={viewing.from_email}
          replyTo={viewing.provider_id}
          threadId={viewing.thread_id}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}
