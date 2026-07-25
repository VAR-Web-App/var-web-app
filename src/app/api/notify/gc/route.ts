// POST /api/notify/gc — fire a GC notification for a client-triggered event.
//
// Two events today:
//   client_signed   → { event, token }         (the sign-link token)
//   payment_recorded→ { event, dealRef, amount? }
//
// The event source is resolved server-side (sign link / deal) so the caller
// can't spoof which org gets notified — and the notice only ever goes to that
// org's OWN configured channels, so there's no data-exfiltration surface.

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import { notifyGc } from "@/lib/notify/gc";
import type { Deal } from "@/types";

export const runtime = "nodejs";

const money = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

interface Body {
  event?: string;
  token?: string;
  dealRef?: string;
  amount?: number;
  clientName?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const db = adminDb();

  if (body.event === "client_signed") {
    if (!body.token) {
      return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
    }
    const snap = await db.collection("client_sign_links").doc(body.token).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "token_not_found" }, { status: 404 });
    }
    const link = snap.data() as {
      org_ref: string;
      deal_ref?: string;
      client_name?: string;
      project_name?: string;
    };
    const who = body.clientName?.trim() || link.client_name || "Your client";
    const proj = link.project_name || "your proposal";
    await notifyGc(link.org_ref, "client_signed", {
      title: "✍️ Proposal signed",
      body: `${who} signed ${proj}.`,
      url: link.deal_ref ? `/deals/${link.deal_ref}` : "/deals",
    });
    return NextResponse.json({ ok: true });
  }

  if (body.event === "payment_recorded") {
    if (!body.dealRef) {
      return NextResponse.json({ ok: false, error: "missing_deal" }, { status: 400 });
    }
    const snap = await db.collection("deals").doc(body.dealRef).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "deal_not_found" }, { status: 404 });
    }
    const deal = snap.data() as Deal;
    const amt = typeof body.amount === "number" ? `${money(body.amount)} ` : "";
    await notifyGc(deal.org_ref, "payment_recorded", {
      title: "💵 Payment recorded",
      body: `${amt}payment logged on ${deal.name}.`,
      url: `/deals/${body.dealRef}/finances`,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown_event" }, { status: 400 });
}
