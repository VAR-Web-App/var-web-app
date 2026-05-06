"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeftIcon,
  TrashIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import AppShell from "@/components/app-shell";
import FloorPlanExtractor from "@/components/floor-plan-extractor";
import ProjectExecutionPanel from "@/components/project-execution-panel";
import PhotoGallery from "@/components/photo-gallery";
import {
  ATTACHMENT_CATEGORIES,
  Attachment,
  Deal,
} from "@/types";
import { BUILDER_STAGES } from "@/types/builder";
import {
  deleteDeal,
  getDeal,
  listAttachments,
  listQuoteLines,
  saveAttachment,
  saveDeal,
  newId,
  deleteAttachment,
} from "@/lib/store";
import type { QuoteLine } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { compareBoms, type CompareResult } from "@/lib/compare";
import type { BomLine } from "@/lib/parsers";

interface ParsedDoc {
  attachment_id: string;
  template_name: string;
  bom: BomLine[];
  metadata: Record<string, string | number | undefined>;
  total: number;
}

export default function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [parsed, setParsed] = useState<Record<string, ParsedDoc>>({});
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([]);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    async function load() {
      const d = await getDeal(id);
      if (!active) return;
      if (!d || d.org_ref !== profile!.org_ref) {
        router.replace("/deals");
        return;
      }
      setDeal(d);
      const [atts, lines] = await Promise.all([listAttachments(id), listQuoteLines(id)]);
      setAttachments(atts);
      setQuoteLines(lines);
      setLoaded(true);
      try {
        const cached = sessionStorage.getItem(`parsed:${id}`);
        if (cached && active) setParsed(JSON.parse(cached));
      } catch {
        // ignore
      }
    }
    void load();
    return () => { active = false; };
  }, [id, router, profile]);

  async function refresh() {
    setAttachments(await listAttachments(id));
  }

  function persistParsed(next: Record<string, ParsedDoc>) {
    setParsed(next);
    try {
      sessionStorage.setItem(`parsed:${id}`, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }

  async function updateDeal(patch: Partial<Deal>) {
    if (!deal) return;
    const next = { ...deal, ...patch, updated_at: new Date().toISOString() };
    setDeal(next); // optimistic
    await saveDeal(next);
  }

  async function onUploadFile(category: Attachment["category"], file: File) {
    if (!deal) return;
    const att: Attachment = {
      id: newId("att"),
      deal_ref: deal.id,
      category,
      name: file.name,
      // Object URL — survives this session only. For real persistence we'd
      // upload to Firebase Storage; not needed for the demo.
      url: URL.createObjectURL(file),
      size: file.size,
      uploaded_at: new Date().toISOString(),
    };
    await saveAttachment(att);
    await refresh();
    // Auto-parse PDFs.
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      void runParse(att, file);
    }
  }

  async function runParse(att: Attachment, file: File) {
    setParsingId(att.id);
    setParseError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      if (!res.ok && res.headers.get("Content-Type")?.includes("application/json")) {
        const j = await res.json();
        throw new Error(j.error ?? "Parse failed");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let result:
        | {
            ok: boolean;
            template_name: string;
            bom: BomLine[];
            metadata: Record<string, string | number | undefined>;
            totals: { parsed_extended_total: number };
          }
        | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          if (!frame.trim()) continue;
          let event = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (event === "result" && data) result = JSON.parse(data);
        }
      }
      if (!result) throw new Error("Parser returned no result");
      const next = {
        ...parsed,
        [att.id]: {
          attachment_id: att.id,
          template_name: result.template_name,
          bom: result.bom,
          metadata: result.metadata,
          total: result.totals.parsed_extended_total,
        },
      };
      persistParsed(next);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsingId(null);
    }
  }

  async function onLoadSampleAttachments() {
    if (!deal) return;
    setParseError(null);
    const samples: Array<{ category: Attachment["category"]; path: string; name: string }> = [
      { category: "customer_quote", path: "/samples/synthetic-quote.pdf", name: "synthetic-quote.pdf" },
      { category: "award_document", path: "/samples/synthetic-award.pdf", name: "synthetic-award.pdf" },
    ];
    for (const s of samples) {
      try {
        const res = await fetch(s.path);
        if (!res.ok) throw new Error(`Could not load ${s.name} (HTTP ${res.status})`);
        const blob = await res.blob();
        const file = new File([blob], s.name, { type: "application/pdf" });
        await onUploadFile(s.category, file);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  async function onDeleteAttachment(att: Attachment) {
    await deleteAttachment(att.id);
    const { [att.id]: _, ...rest } = parsed;
    void _;
    persistParsed(rest);
    await refresh();
  }

  async function onDelete() {
    if (!deal) return;
    if (!confirm(`Delete project "${deal.name}"? This cannot be undone.`)) return;
    await deleteDeal(deal.id);
    router.push("/deals");
  }

  // Auto-comparison: pick the parsed customer_quote and award_document
  // attachments and run the comparison whenever either changes.
  const comparison: CompareResult | null = useMemo(() => {
    if (!deal) return null;
    const quoteAtt = attachments.find((a) => a.category === "customer_quote" && parsed[a.id]);
    const awardAtt = attachments.find((a) => a.category === "award_document" && parsed[a.id]);
    if (!quoteAtt || !awardAtt) return null;
    return compareBoms(parsed[quoteAtt.id].bom, parsed[awardAtt.id].bom);
  }, [attachments, parsed, deal]);

  if (!deal || !loaded) {
    return (
      <AppShell>
        <div className="text-sm text-slate-500">Loading…</div>
      </AppShell>
    );
  }

  const stage = BUILDER_STAGES.find((s) => s.key === deal.stage);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Link
            href="/deals"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Pipeline
          </Link>
        </div>

        <DealHeader
          deal={deal}
          onChangeStage={(s) => updateDeal({ stage: s })}
          onDelete={onDelete}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <FloorPlanExtractor dealId={deal.id} orgRef={deal.org_ref} />

            <AttachmentsCard
              deal={deal}
              attachments={attachments}
              parsed={parsed}
              parsingId={parsingId}
              error={parseError}
              onUploadFile={onUploadFile}
              onLoadSamples={onLoadSampleAttachments}
              onDeleteAttachment={onDeleteAttachment}
              onClearError={() => setParseError(null)}
            />

            <QuoteCard dealId={deal.id} lines={quoteLines} />

            <ProjectExecutionPanel deal={deal} />

            <PhotoGallery dealId={deal.id} orgRef={deal.org_ref} />

            {comparison && <ComparisonCard comparison={comparison} />}

            {!comparison && (
              <PlaceholderCard
                title="Bill-of-Materials Comparison"
                body={
                  Object.keys(parsed).length === 0
                    ? "Drop in a customer quote AND an award PDF above. We'll auto-compare them and surface any line-item discrepancies."
                    : "Comparison runs when this deal has both a parsed customer quote and a parsed award document."
                }
              />
            )}

            <PlaceholderCard
              title="Vendor PO"
              body="Once the comparison is reconciled, the vendor PO is generated per manufacturer with the awarded line items, ship-to, and notes auto-filled. Coming soon."
            />
          </div>

          <div className="space-y-6">
            <DealMetadataCard deal={deal} stageColor={stage?.color ?? ""} />
            <NotesCard deal={deal} onUpdate={(notes) => updateDeal({ notes })} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function DealHeader({
  deal,
  onChangeStage,
  onDelete,
}: {
  deal: Deal;
  onChangeStage: (s: Deal["stage"]) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{deal.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {deal.account_name || "No client"} · {deal.manufacturer || "—"} ·{" "}
          {deal.deal_type === "quotation" ? "Detailed Estimate" : "Ballpark / Budget"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/deals/${deal.id}/portal`}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          title="See what your client sees"
        >
          <EyeIcon className="h-4 w-4" />
          View as client
        </Link>
        <select
          value={deal.stage}
          onChange={(e) => onChangeStage(e.target.value as Deal["stage"])}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          {BUILDER_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={onDelete}
          title="Delete project"
          className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function DealMetadataCard({ deal, stageColor }: { deal: Deal; stageColor: string }) {
  const fmtMoney = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString() : "—");
  const stage = BUILDER_STAGES.find((x) => x.key === deal.stage);

  const items: Array<[string, React.ReactNode]> = [
    ["Stage", <span key="s" className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stageColor}`}>{stage?.label}</span>],
    ["Client", deal.account_name || "—"],
    ["Project Type", deal.manufacturer || "—"],
    ["Primary Sub", deal.distributor_name || "—"],
    ["Job #", deal.solicitation_number || "—"],
    ["Contract / PO #", deal.customer_po || "—"],
    ["Schedule", deal.lead_time || "—"],
    ["Target Start", fmtDate(deal.due_date)],
    ["Contract Signed", fmtDate(deal.award_date)],
    ["Estimate Total", deal.total_quote_value ? fmtMoney(deal.total_quote_value) : "—"],
    ["Contract Total", deal.award_total ? fmtMoney(deal.award_total) : "—"],
    ["Margin", deal.margin_percent ? `${deal.margin_percent.toFixed(1)}%` : "—"],
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Project Details</h2>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 p-6 text-sm">
        {items.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[120px_1fr] items-baseline gap-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="text-slate-900">{value}</dd>
          </div>
        ))}
        {deal.ship_to_address && (
          <div className="grid grid-cols-[120px_1fr] items-baseline gap-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Project Address</dt>
            <dd className="whitespace-pre-line text-slate-900">{deal.ship_to_address}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function NotesCard({ deal, onUpdate }: { deal: Deal; onUpdate: (notes: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(deal.notes);
  useEffect(() => setDraft(deal.notes), [deal.notes]);
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Notes</h2>
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={() => { setDraft(deal.notes); setEditing(false); }}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => { onUpdate(draft); setEditing(false); }}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Edit
          </button>
        )}
      </div>
      <div className="p-6 text-sm">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="block min-h-[100px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <p className="whitespace-pre-line text-slate-700">
            {deal.notes || <span className="italic text-slate-400">No notes yet.</span>}
          </p>
        )}
      </div>
    </section>
  );
}

function AttachmentsCard({
  deal,
  attachments,
  parsed,
  parsingId,
  error,
  onUploadFile,
  onLoadSamples,
  onDeleteAttachment,
  onClearError,
}: {
  deal: Deal;
  attachments: Attachment[];
  parsed: Record<string, ParsedDoc>;
  parsingId: string | null;
  error: string | null;
  onUploadFile: (category: Attachment["category"], file: File) => void;
  onLoadSamples: () => void;
  onDeleteAttachment: (att: Attachment) => void;
  onClearError: () => void;
}) {
  const fmtMoney = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  void deal;
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Attachments &amp; parsed docs</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Drop a PDF in any category. The parser auto-runs on upload and the data flows
            into the deal.
          </p>
        </div>
        <button
          onClick={onLoadSamples}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          Load sample quote + award →
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={onClearError} className="text-xs text-red-600 hover:text-red-800">
            dismiss
          </button>
        </div>
      )}

      <div className="space-y-4 p-6">
        {ATTACHMENT_CATEGORIES.map((cat) => {
          const inCat = attachments.filter((a) => a.category === cat.key);
          return (
            <div key={cat.key} className="rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {cat.label}
                </h3>
                <label className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-700">
                  + Upload
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadFile(cat.key, f);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              {inCat.length === 0 ? (
                <p className="px-4 py-3 text-xs italic text-slate-400">No {cat.label.toLowerCase()}.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {inCat.map((att) => {
                    const p = parsed[att.id];
                    const isParsing = parsingId === att.id;
                    return (
                      <li key={att.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <DocumentTextIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                            <div className="min-w-0">
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline"
                              >
                                {att.name}
                              </a>
                              <p className="text-[11px] text-slate-500">
                                {(att.size / 1024).toFixed(1)} KB ·{" "}
                                {new Date(att.uploaded_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isParsing && (
                              <span className="text-xs italic text-slate-500">parsing…</span>
                            )}
                            {p && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                                <CheckCircleIcon className="h-3.5 w-3.5" />
                                {p.bom.length} line{p.bom.length === 1 ? "" : "s"} · {fmtMoney(p.total)}
                              </span>
                            )}
                            <button
                              onClick={() => onDeleteAttachment(att)}
                              title="Remove"
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {p && p.metadata && (
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                            {Object.entries(p.metadata)
                              .filter(([, v]) => v != null && v !== "")
                              .slice(0, 6)
                              .map(([k, v]) => (
                                <div key={k} className="flex items-baseline gap-1">
                                  <span className="font-medium text-slate-500">{k.replace(/_/g, " ")}:</span>
                                  <span className="truncate text-slate-700">{String(v)}</span>
                                </div>
                              ))}
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
    </section>
  );
}

function ComparisonCard({ comparison }: { comparison: CompareResult }) {
  const fmtMoney = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDelta = (n: number) =>
    `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const issueRows = comparison.matched.filter((r) => r.diff !== "match");
  const matchCount = comparison.matched.length - issueRows.length;
  const totalIssues =
    issueRows.length + comparison.only_in_quote.length + comparison.only_in_award.length;
  const allClean = totalIssues === 0;
  const deltaColor =
    comparison.totals.delta > 0.01
      ? "text-emerald-700"
      : comparison.totals.delta < -0.01
      ? "text-red-700"
      : "text-slate-700";

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        className={`border-b px-6 py-4 ${
          allClean ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="flex items-center gap-3">
            {allClean ? (
              <CheckCircleIcon className="h-6 w-6 flex-shrink-0 text-emerald-600" />
            ) : (
              <ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 text-amber-600" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {allClean
                  ? "Quote and award match"
                  : `${totalIssues} discrepanc${totalIssues === 1 ? "y" : "ies"}`}
              </h2>
              <p className="text-xs text-slate-700">
                {matchCount} matched · {issueRows.length} with issues ·{" "}
                {comparison.only_in_quote.length} only in quote ·{" "}
                {comparison.only_in_award.length} only in award
              </p>
            </div>
          </div>
          <div className="text-right text-xs">
            <span className="text-slate-500">Quote </span>
            <span className="font-semibold text-slate-900">{fmtMoney(comparison.totals.quote_extended)}</span>
            <span className="text-slate-400"> → </span>
            <span className="font-semibold text-slate-900">{fmtMoney(comparison.totals.award_extended)}</span>
            <span className={`ml-2 font-semibold ${deltaColor}`}>
              ({fmtDelta(comparison.totals.delta)})
            </span>
          </div>
        </div>
      </div>

      {issueRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Part &amp; Description</th>
                <th className="px-4 py-3 text-right">Quote</th>
                <th className="px-4 py-3 text-right">Award</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {issueRows.map((row, i) => {
                const qtyChanged = row.quote.qty !== row.award.qty;
                const priceChanged =
                  Math.abs(row.quote.unit_price - row.award.unit_price) > 0.005;
                const extDelta = row.award.extended_price - row.quote.extended_price;
                const labels: string[] = [];
                if (qtyChanged) labels.push("Qty Δ");
                if (priceChanged) labels.push("Price Δ");
                const dColor = extDelta > 0 ? "text-emerald-700" : "text-red-700";
                return (
                  <tr key={i} className="bg-amber-50/30">
                    <td className="px-4 py-3 align-top">
                      <div className="font-mono text-xs text-slate-900">{row.part_number}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{row.award.description}</div>
                    </td>
                    <td className="px-4 py-3 text-right align-top tabular-nums text-xs">
                      {row.quote.qty} × {fmtMoney(row.quote.unit_price)}
                      <div className="text-[11px] text-slate-500">= {fmtMoney(row.quote.extended_price)}</div>
                    </td>
                    <td className="px-4 py-3 text-right align-top tabular-nums text-xs">
                      {row.award.qty} × {fmtMoney(row.award.unit_price)}
                      <div className="text-[11px] text-slate-500">= {fmtMoney(row.award.extended_price)}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs">
                      <div className="font-medium text-amber-900">{labels.join(" + ")}</div>
                      {Math.abs(extDelta) > 0.01 && (
                        <div className={`tabular-nums ${dColor}`}>
                          {fmtDelta(extDelta)} on this line
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {comparison.only_in_quote.map((line, i) => (
                <tr key={`q${i}`} className="bg-amber-50/30">
                  <td className="px-4 py-3 align-top">
                    <div className="font-mono text-xs text-slate-900">{line.part_number}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{line.description}</div>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums text-xs">
                    {line.qty} × {fmtMoney(line.unit_price)}
                    <div className="text-[11px] text-slate-500">= {fmtMoney(line.extended_price)}</div>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums text-xs italic text-slate-400">—</td>
                  <td className="px-4 py-3 align-top text-xs">
                    <div className="font-medium text-amber-900">Only in quote</div>
                    <div className="text-slate-500">customer dropped from award</div>
                  </td>
                </tr>
              ))}
              {comparison.only_in_award.map((line, i) => (
                <tr key={`a${i}`} className="bg-blue-50/30">
                  <td className="px-4 py-3 align-top">
                    <div className="font-mono text-xs text-slate-900">{line.part_number}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{line.description}</div>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums text-xs italic text-slate-400">—</td>
                  <td className="px-4 py-3 text-right align-top tabular-nums text-xs">
                    {line.qty} × {fmtMoney(line.unit_price)}
                    <div className="text-[11px] text-slate-500">= {fmtMoney(line.extended_price)}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-xs">
                    <div className="font-medium text-blue-900">Only in award</div>
                    <div className="text-slate-500">customer added — likely a mod</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {matchCount > 0 && (
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-600">
          <span className="text-emerald-700">✓ {matchCount} more line{matchCount === 1 ? "" : "s"}</span>{" "}
          matched perfectly — nothing to review there.
        </div>
      )}
    </section>
  );
}

function QuoteCard({ dealId, lines }: { dealId: string; lines: QuoteLine[] }) {
  const fmtMoney = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const customerTotal = lines.reduce((s, l) => s + (l.customer_extended || 0), 0);
  const costTotal = lines.reduce((s, l) => s + (l.cost_extended || 0), 0);
  const margin = customerTotal > 0 ? ((customerTotal - costTotal) / customerTotal) * 100 : 0;

  if (lines.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Project Estimate</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Build the estimate you&apos;ll send your client.
            </p>
          </div>
          <Link
            href={`/deals/${dealId}/quote`}
            className="rounded-md bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            Build estimate →
          </Link>
        </div>
        <div className="px-6 py-6 text-center text-sm text-slate-500">
          <p>No line items yet. Add materials, labor, and subs — or upload a floor plan
          (AI will pre-fill structure soon).</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Project Estimate</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {lines.length} line item{lines.length === 1 ? "" : "s"} · saved
          </p>
        </div>
        <Link
          href={`/deals/${dealId}/quote`}
          className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Edit estimate →
        </Link>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-200">
        <div className="px-6 py-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total Cost</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{fmtMoney(costTotal)}</div>
        </div>
        <div className="px-6 py-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Estimate to Client</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-700">
            {fmtMoney(customerTotal)}
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Margin</div>
          <div
            className={`mt-1 text-lg font-semibold tabular-nums ${
              margin >= 15 ? "text-emerald-700" : margin >= 5 ? "text-amber-700" : "text-red-700"
            }`}
          >
            {margin.toFixed(1)}%
          </div>
        </div>
      </div>
    </section>
  );
}

function PlaceholderCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 shadow-sm">
      <div className="flex items-start gap-3">
        <ArrowUpTrayIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{body}</p>
        </div>
      </div>
    </section>
  );
}
