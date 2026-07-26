// GET /api/portal/data?token=… — client-safe project snapshot for the no-login
// homeowner portal. The token resolves to a ClientPortalLink; we return only
// the fields a homeowner should see (no internal cost/margin data).

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import type { ClientPortalLink } from "@/types/builder";
import type {
  ProjectMilestone,
  ProjectChangeOrder,
} from "@/types/builder";
import type { Deal } from "@/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  if (!adminConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const db = adminDb();
  const linkSnap = await db.collection("client_portal_links").doc(token).get();
  if (!linkSnap.exists) return NextResponse.json({ ok: false, error: "token_not_found" }, { status: 404 });
  const link = linkSnap.data() as ClientPortalLink;

  const dealSnap = await db.collection("deals").doc(link.deal_ref).get();
  if (!dealSnap.exists) return NextResponse.json({ ok: false, error: "deal_gone" }, { status: 404 });
  const deal = dealSnap.data() as Deal;

  const [msSnap, coSnap] = await Promise.all([
    db.collection("project_milestones").where("deal_ref", "==", link.deal_ref).get(),
    db.collection("project_change_orders").where("deal_ref", "==", link.deal_ref).get(),
  ]);

  const milestones = msSnap.docs
    .map((d) => d.data() as ProjectMilestone)
    .sort((a, b) => a.order - b.order)
    .map((m) => ({
      id: m.id, name: m.name, order: m.order, status: m.status,
      percentage: m.percentage, amount: m.amount,
      planned_start_date: m.planned_start_date ?? null,
      planned_end_date: m.planned_end_date ?? null,
      approved_at: m.approved_at ?? null,
    }));

  const changeOrders = coSnap.docs
    .map((d) => d.data() as ProjectChangeOrder)
    .sort((a, b) => a.number.localeCompare(b.number))
    .map((c) => ({
      id: c.id, number: c.number, title: c.title, description: c.description,
      amount_delta: c.amount_delta, schedule_impact_days: c.schedule_impact_days,
      status: c.status, rejection_reason: c.rejection_reason ?? null,
    }));

  const approvedCoTotal = changeOrders
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + (c.amount_delta || 0), 0);
  const contractValue = (deal.total_quote_value || 0) + approvedCoTotal;

  return NextResponse.json({
    ok: true,
    project: { name: link.project_name, builder_name: link.builder_name, client_name: link.client_name },
    contract_value: contractValue,
    milestones,
    change_orders: changeOrders,
  });
}
