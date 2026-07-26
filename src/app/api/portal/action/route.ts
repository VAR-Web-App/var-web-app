// POST /api/portal/action — homeowner actions from the no-login portal.
// The token is the only auth: it resolves to a ClientPortalLink, and every
// write is scoped to that link's project. Notifies the builder on each action.
//
//   { token, action: "approve_draw",  milestoneId, signature }
//   { token, action: "approve_co",    coId, signature }
//   { token, action: "reject_co",     coId, reason? }

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import { notifyGc } from "@/lib/notify/gc";
import type { ClientPortalLink, ProjectMilestone, ProjectChangeOrder } from "@/types/builder";

export const runtime = "nodejs";

interface Body {
  token?: string;
  action?: string;
  milestoneId?: string;
  coId?: string;
  signature?: string;
  reason?: string;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const { token, action } = body;
  if (!token || !action) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  if (!adminConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const db = adminDb();
  const linkSnap = await db.collection("client_portal_links").doc(token).get();
  if (!linkSnap.exists) return NextResponse.json({ ok: false, error: "token_not_found" }, { status: 404 });
  const link = linkSnap.data() as ClientPortalLink;
  const now = new Date().toISOString();
  const url = `/deals/${link.deal_ref}`;

  // ── Approve a draw (milestone) ───────────────────────────────
  if (action === "approve_draw") {
    if (!body.milestoneId || !body.signature?.trim()) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }
    const ref = db.collection("project_milestones").doc(body.milestoneId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const m = snap.data() as ProjectMilestone;
    if (m.deal_ref !== link.deal_ref) return NextResponse.json({ ok: false, error: "wrong_project" }, { status: 403 });
    if (m.status === "approved" || m.status === "released") {
      return NextResponse.json({ ok: false, error: "already_approved" }, { status: 409 });
    }
    await ref.update({ status: "approved", approved_at: now, approval_signature: body.signature.trim(), updated_at: now });
    await notifyGc(link.org_ref, "client_signed", {
      title: "✅ Draw approved",
      body: `${link.client_name || "Your client"} approved ${m.name} (${money(m.amount)}) on ${link.project_name}.`,
      url,
    });
    return NextResponse.json({ ok: true });
  }

  // ── Approve / reject a change order ──────────────────────────
  if (action === "approve_co" || action === "reject_co") {
    if (!body.coId) return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    if (action === "approve_co" && !body.signature?.trim()) {
      return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 400 });
    }
    const ref = db.collection("project_change_orders").doc(body.coId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const co = snap.data() as ProjectChangeOrder;
    if (co.deal_ref !== link.deal_ref) return NextResponse.json({ ok: false, error: "wrong_project" }, { status: 403 });
    if (co.status === "approved" || co.status === "rejected") {
      return NextResponse.json({ ok: false, error: "already_decided" }, { status: 409 });
    }
    if (action === "approve_co") {
      await ref.update({ status: "approved", approved_at: now, approval_signature: body.signature!.trim(), updated_at: now });
      await notifyGc(link.org_ref, "client_signed", {
        title: "✅ Change order approved",
        body: `${link.client_name || "Your client"} approved ${co.number} “${co.title}” (${money(co.amount_delta)}) on ${link.project_name}.`,
        url,
      });
    } else {
      await ref.update({ status: "rejected", rejection_reason: body.reason?.trim() || "(no reason given)", updated_at: now });
      await notifyGc(link.org_ref, "client_signed", {
        title: "🚫 Change order rejected",
        body: `${link.client_name || "Your client"} rejected ${co.number} “${co.title}” on ${link.project_name}.`,
        url,
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
