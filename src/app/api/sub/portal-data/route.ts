// GET /api/sub/portal-data?token=X
//
// Aggregates the read-only data the sub portal needs for its Payments
// and Documents tabs. Payments and RFQs are auth-gated collections, so
// we server-mediate the reads — same trust model as /api/sub/bid: the
// token resolves to a sub, and we only return records that party_ref
// or invitee_ref back to that sub.

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import type { ProjectRFQ, SubScheduleLink } from "@/types/builder";
import type { Deal, Payment } from "@/types";

export const runtime = "nodejs";

interface PaymentView {
  id: string;
  amount: number;
  date: string;
  method: Payment["method"];
  check_number?: string;
  deal_name: string;
  milestone_name?: string;
  notes?: string;
}

interface AwardedRfqView {
  id: string;
  deal_id: string;
  scope_title: string;
  scope_description: string;
  phase: string;
  project_name: string;
  bid_amount: number;
  bid_notes?: string;
  awarded_at?: string;
}

interface PortalData {
  payments: PaymentView[];
  awarded_rfqs: AwardedRfqView[];
  totals: { paid: number; awarded: number; pending: number };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
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

  const db = adminDb();
  const linkSnap = await db.collection("sub_schedule_links").doc(token).get();
  if (!linkSnap.exists) {
    return NextResponse.json(
      { ok: false, error: "token_not_found" },
      { status: 404 },
    );
  }
  const link = linkSnap.data() as SubScheduleLink;

  // Payments to this sub across every deal in the org. We filter by
  // party_ref + direction up front — Firestore can index both.
  const paymentsSnap = await db
    .collection("payments")
    .where("party_ref", "==", link.sub_ref)
    .where("direction", "==", "out")
    .get();
  const rawPayments = paymentsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Payment, "id">),
  }));

  // Awarded RFQs where this sub is the winner. Same indexed filter.
  const rfqsSnap = await db
    .collection("project_rfqs")
    .where("org_ref", "==", link.org_ref)
    .where("status", "==", "awarded")
    .get();
  const rawRfqs = rfqsSnap.docs
    .map(
      (d) => ({ id: d.id, ...(d.data() as Omit<ProjectRFQ, "id">) }),
    )
    .filter((r) =>
      r.invitees.some(
        (i) => i.sub_ref === link.sub_ref && i.status === "selected",
      ),
    );

  // Resolve every deal we need in one batch — payments may live across
  // many deals, awarded RFQs add a few more. Build a unique id set so
  // we don't re-read the same deal.
  const dealIds = new Set<string>([
    ...rawPayments.map((p) => p.deal_ref),
    ...rawRfqs.map((r) => r.deal_ref),
  ]);
  const dealCache = new Map<string, Deal>();
  await Promise.all(
    Array.from(dealIds).map(async (id) => {
      const snap = await db.collection("deals").doc(id).get();
      if (snap.exists) {
        dealCache.set(id, { id: snap.id, ...(snap.data() as Omit<Deal, "id">) });
      }
    }),
  );

  // Same for milestone names, only for payments that reference one.
  const msIds = new Set<string>();
  for (const p of rawPayments) if (p.milestone_ref) msIds.add(p.milestone_ref);
  const msCache = new Map<string, string>();
  await Promise.all(
    Array.from(msIds).map(async (id) => {
      const snap = await db.collection("project_milestones").doc(id).get();
      if (snap.exists) {
        const data = snap.data() as { name?: string };
        if (data.name) msCache.set(id, data.name);
      }
    }),
  );

  const payments: PaymentView[] = rawPayments
    .map((p) => {
      const deal = dealCache.get(p.deal_ref);
      if (!deal) return null;
      // Org leak guard — only payments tied to deals in this sub's org.
      if (deal.org_ref !== link.org_ref) return null;
      return {
        id: p.id,
        amount: p.amount,
        date: p.date,
        method: p.method,
        ...(p.check_number ? { check_number: p.check_number } : {}),
        deal_name: deal.name,
        ...(p.milestone_ref && msCache.has(p.milestone_ref)
          ? { milestone_name: msCache.get(p.milestone_ref) }
          : {}),
        ...(p.notes ? { notes: p.notes } : {}),
      } as PaymentView;
    })
    .filter((p): p is PaymentView => p !== null)
    .sort((a, b) => b.date.localeCompare(a.date));

  const awarded_rfqs: AwardedRfqView[] = rawRfqs
    .map((r) => {
      const deal = dealCache.get(r.deal_ref);
      if (!deal) return null;
      const inv = r.invitees.find(
        (i) => i.sub_ref === link.sub_ref && i.status === "selected",
      );
      if (!inv || !inv.bid_amount) return null;
      return {
        id: r.id,
        deal_id: r.deal_ref,
        scope_title: r.scope_title,
        scope_description: r.scope_description,
        phase: r.phase,
        project_name: deal.name,
        bid_amount: inv.bid_amount,
        ...(inv.bid_notes ? { bid_notes: inv.bid_notes } : {}),
        ...(inv.responded_at ? { awarded_at: inv.responded_at } : {}),
      } as AwardedRfqView;
    })
    .filter((r): r is AwardedRfqView => r !== null);

  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const awarded = awarded_rfqs.reduce((s, r) => s + r.bid_amount, 0);
  const pending = Math.max(0, awarded - paid);

  const data: PortalData = {
    payments,
    awarded_rfqs,
    totals: { paid, awarded, pending },
  };
  return NextResponse.json({ ok: true, data });
}
