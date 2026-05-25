// /api/sub/bid — sub-side RFQ load + submit.
//
// Two methods, same trust model: the token (resolves to a
// SubScheduleLink for one sub) plus the rfqId together prove the
// caller is an invited sub on that RFQ. We never expose RFQ scope to
// anyone whose token isn't on the invitee list.
//
//   GET  ?token=X&rfqId=Y  → scope + project + existing bid (if any)
//   POST { token, rfqId, bid_amount, bid_notes? } → record bid + notify GC
//
// Failure modes:
//   - token unknown / expired       → 404 token_not_found
//   - rfqId not in this sub's       → 403 not_invited
//     invitee list
//   - admin SDK not configured      → 503 not_configured

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import { composeBidArrivedSms, toE164 } from "@/lib/sms";
import type { ProjectRFQ, RFQInvitee, SubScheduleLink } from "@/types/builder";
import type { Attachment, Deal, OrgSettings } from "@/types";

export const runtime = "nodejs";

interface BidAttachmentView {
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
  status: ProjectRFQ["status"];
  project_name: string;
  project_address?: string;
  builder_name: string;
  sub_name: string;
  /** The invitee's current bid, if they've already submitted. */
  my_bid?: {
    amount?: number;
    notes?: string;
    responded_at?: string;
  };
  /** Files this sub has already attached to this RFQ. Empty array when
   *  the sub hasn't uploaded anything yet. */
  attachments: BidAttachmentView[];
  /** True once the RFQ has been awarded (to anyone). The sub still
   *  sees scope but can't submit / resubmit. */
  closed: boolean;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const token = url.searchParams.get("token") ?? "";
  const rfqId = url.searchParams.get("rfqId") ?? "";
  if (!token || !rfqId) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }
  if (!adminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  }

  const resolved = await resolveCaller(token, rfqId);
  if ("error" in resolved) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status },
    );
  }
  const { rfq, link, invitee, deal } = resolved;

  // Sub's own attachments for this RFQ. Indexed query — composite
  // index added in firestore.indexes.json.
  const attSnap = await adminDb()
    .collection("attachments")
    .where("rfq_ref", "==", rfq.id)
    .where("sub_ref", "==", link.sub_ref)
    .get();
  const attachments: BidAttachmentView[] = attSnap.docs
    .map((d) => d.data() as Attachment)
    .map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      size: a.size,
      uploaded_at: a.uploaded_at,
    }))
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));

  const view: LoadView = {
    rfq_id: rfq.id,
    scope_title: rfq.scope_title,
    scope_description: rfq.scope_description,
    phase: rfq.phase,
    status: rfq.status,
    project_name: deal.name,
    ...(deal.ship_to_address ? { project_address: deal.ship_to_address } : {}),
    builder_name: link.builder_name,
    sub_name: link.sub_name,
    attachments,
    closed: rfq.status === "awarded" || rfq.status === "closed",
    ...(invitee.bid_amount !== undefined ||
    invitee.bid_notes ||
    invitee.responded_at
      ? {
          my_bid: {
            ...(invitee.bid_amount !== undefined
              ? { amount: invitee.bid_amount }
              : {}),
            ...(invitee.bid_notes ? { notes: invitee.bid_notes } : {}),
            ...(invitee.responded_at
              ? { responded_at: invitee.responded_at }
              : {}),
          },
        }
      : {}),
  };
  return NextResponse.json({ ok: true, view });
}

interface SubmitBody {
  token: string;
  rfqId: string;
  bid_amount: number;
  bid_notes?: string;
}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }
  const { token, rfqId, bid_amount } = body;
  if (
    !token ||
    !rfqId ||
    typeof bid_amount !== "number" ||
    !Number.isFinite(bid_amount) ||
    bid_amount <= 0
  ) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }
  if (!adminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  }

  const resolved = await resolveCaller(token, rfqId);
  if ("error" in resolved) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status },
    );
  }
  const { rfq, link, deal } = resolved;

  if (rfq.status === "awarded" || rfq.status === "closed") {
    return NextResponse.json(
      { ok: false, error: "rfq_closed" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const notes = (body.bid_notes ?? "").trim().slice(0, 2000);

  const nextInvitees: RFQInvitee[] = rfq.invitees.map((inv) =>
    inv.sub_ref === link.sub_ref
      ? {
          ...inv,
          status: "responded",
          bid_amount,
          ...(notes ? { bid_notes: notes } : { bid_notes: "" }),
          responded_at: now,
        }
      : inv,
  );

  // Bump the RFQ to "comparing" the moment the first bid lands — gives
  // the GC a clear UI signal something needs their attention. Stays in
  // comparing through subsequent bid arrivals.
  const nextStatus: ProjectRFQ["status"] =
    rfq.status === "sent" ? "comparing" : rfq.status;

  const db = adminDb();
  await db
    .collection("project_rfqs")
    .doc(rfq.id)
    .update({
      invitees: nextInvitees,
      status: nextStatus,
      updated_at: now,
    });

  // Fire-and-forget — text the GC. Failure logged, doesn't fail the
  // sub's submission.
  void notifyGc(deal, link.sub_name, rfq, bid_amount).catch((e) =>
    console.warn("[sub/bid] notify failed", e),
  );

  return NextResponse.json({ ok: true });
}

// ── helpers ─────────────────────────────────────────────────────

type Resolved =
  | { error: string; status: number }
  | {
      rfq: ProjectRFQ;
      link: SubScheduleLink;
      invitee: RFQInvitee;
      deal: Deal;
    };

async function resolveCaller(token: string, rfqId: string): Promise<Resolved> {
  const db = adminDb();
  const linkSnap = await db.collection("sub_schedule_links").doc(token).get();
  if (!linkSnap.exists) {
    return { error: "token_not_found", status: 404 };
  }
  const link = linkSnap.data() as SubScheduleLink;

  const rfqSnap = await db.collection("project_rfqs").doc(rfqId).get();
  if (!rfqSnap.exists) {
    return { error: "rfq_not_found", status: 404 };
  }
  const rfq = { id: rfqSnap.id, ...(rfqSnap.data() as Omit<ProjectRFQ, "id">) };
  if (rfq.org_ref !== link.org_ref) {
    // Cross-org leak guard. Both the SubScheduleLink and the RFQ carry
    // org_ref independently; if they disagree, refuse.
    return { error: "not_invited", status: 403 };
  }

  const invitee = rfq.invitees.find((i) => i.sub_ref === link.sub_ref);
  if (!invitee) {
    return { error: "not_invited", status: 403 };
  }

  const dealSnap = await db.collection("deals").doc(rfq.deal_ref).get();
  if (!dealSnap.exists) {
    return { error: "deal_not_found", status: 404 };
  }
  const deal = { id: dealSnap.id, ...(dealSnap.data() as Omit<Deal, "id">) };
  return { rfq, link, invitee, deal };
}

async function notifyGc(
  deal: Deal,
  subName: string,
  rfq: ProjectRFQ,
  bidAmount: number,
): Promise<void> {
  const db = adminDb();
  const settingsSnap = await db.collection("settings").doc(deal.org_ref).get();
  if (!settingsSnap.exists) return;
  const settings = settingsSnap.data() as OrgSettings;
  const to = toE164(settings.company_phone ?? "");
  if (!to) return;

  const body = composeBidArrivedSms({
    builderName: settings.company_name?.trim() || "FrameFlow",
    subName,
    scopeTitle: rfq.scope_title,
    bidAmount,
  });

  const orgFromNumber = settings.sms_config?.from_number?.trim();
  const platformFrom = process.env.TWILIO_FROM_NUMBER;
  const allowedExtra = (process.env.TWILIO_ALLOWED_FROM_NUMBERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const from =
    orgFromNumber &&
    (orgFromNumber === platformFrom || allowedExtra.includes(orgFromNumber))
      ? orgFromNumber
      : platformFrom;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !from) {
    console.warn("[sub/bid] TWILIO_* env not set — skipping GC notify");
    return;
  }
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    console.warn(`[sub/bid] twilio_error_${res.status}`, detail.slice(0, 200));
  }
}
