// POST /api/push/send-to-sub
//
// Body: { sub_ref: string, payload: { title, body, url?, tag? } }.
//
// Server-side push dispatcher that the existing client-side
// notification flows (assignment, reschedule, RFQ invite in
// project-execution-panel + rfq-panel) call alongside SMS + email.
// The client posts a sub_ref + payload; the server looks up the
// sub via admin SDK, dispatches to every active push subscription,
// and prunes any stale endpoints back to Firestore.
//
// Trust model: same as /api/sms — unauthenticated relay. The risk is
// SMS spam at the Twilio account level; for push it's free per
// message but still abusable for harassment. Acceptable for v1 since
// the same model already governs SMS. Tighten with Firebase auth
// later if we open the API surface beyond first-party UIs.

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import { sendPushToAll } from "@/lib/push";
import type { Distributor } from "@/types";

export const runtime = "nodejs";

interface RequestBody {
  sub_ref: string;
  payload: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
  };
}

export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const { sub_ref } = body;
  if (!sub_ref || !body.payload?.title) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  const db = adminDb();
  const subSnap = await db.collection("distributors").doc(sub_ref).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { ok: false, error: "sub_not_found" },
      { status: 404 },
    );
  }
  const sub = subSnap.data() as Distributor;
  const subscriptions = sub.push_subscriptions ?? [];
  if (subscriptions.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_subscriptions" });
  }

  const stillActive = await sendPushToAll(subscriptions, {
    title: body.payload.title.slice(0, 200),
    body: body.payload.body.slice(0, 500),
    ...(body.payload.url ? { url: body.payload.url } : {}),
    ...(body.payload.tag ? { tag: body.payload.tag } : {}),
  });

  if (stillActive.length !== subscriptions.length) {
    try {
      await db
        .collection("distributors")
        .doc(sub_ref)
        .update({ push_subscriptions: stillActive });
    } catch (e) {
      console.warn("[push/send-to-sub] subscription prune failed", e);
    }
  }

  return NextResponse.json({
    ok: true,
    sent: stillActive.length,
    pruned: subscriptions.length - stillActive.length,
  });
}
