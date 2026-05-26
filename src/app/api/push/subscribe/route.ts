// POST   /api/push/subscribe?token=X    — register a push subscription
// DELETE /api/push/subscribe?token=X    — remove all subs for this sub
//
// Body (POST): {
//   endpoint: string,
//   keys: { p256dh: string, auth: string },
//   device_label?: string
// }
//
// Trust model: same as the other sub-portal endpoints. The token in
// the query string resolves to a SubScheduleLink; that resolves to
// the distributor; the subscription gets appended to that
// distributor's push_subscriptions list.
//
// Idempotent: re-subscribing with the same endpoint replaces the
// existing record (refreshes subscribed_at). Different endpoints
// stack — a sub with iPhone + iPad sees both.

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import type { Distributor, PushSubscriptionRecord } from "@/types";
import type { SubScheduleLink } from "@/types/builder";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  }

  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "missing_token" },
      { status: 400 },
    );
  }

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    device_label?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const endpoint = (body.endpoint || "").trim();
  const p256dh = (body.keys?.p256dh || "").trim();
  const auth = (body.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { ok: false, error: "missing_subscription_fields" },
      { status: 400 },
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

  const subSnap = await db.collection("distributors").doc(link.sub_ref).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { ok: false, error: "sub_not_found" },
      { status: 404 },
    );
  }
  const sub = subSnap.data() as Distributor;

  const existing = sub.push_subscriptions ?? [];
  // Replace any subscription with the same endpoint; otherwise append.
  const filtered = existing.filter((s) => s.endpoint !== endpoint);
  const record: PushSubscriptionRecord = {
    endpoint,
    keys: { p256dh, auth },
    subscribed_at: new Date().toISOString(),
    ...(body.device_label
      ? { device_label: body.device_label.trim().slice(0, 80) }
      : {}),
  };
  const next = [...filtered, record];

  await db
    .collection("distributors")
    .doc(link.sub_ref)
    .update({ push_subscriptions: next });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  }
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const endpoint = req.nextUrl.searchParams.get("endpoint") ?? "";
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "missing_token" },
      { status: 400 },
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

  const subSnap = await db.collection("distributors").doc(link.sub_ref).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { ok: false, error: "sub_not_found" },
      { status: 404 },
    );
  }
  const sub = subSnap.data() as Distributor;
  const existing = sub.push_subscriptions ?? [];
  // If endpoint is provided, remove only that one; otherwise clear all.
  const next = endpoint
    ? existing.filter((s) => s.endpoint !== endpoint)
    : [];
  await db
    .collection("distributors")
    .doc(link.sub_ref)
    .update({ push_subscriptions: next });
  return NextResponse.json({ ok: true });
}
