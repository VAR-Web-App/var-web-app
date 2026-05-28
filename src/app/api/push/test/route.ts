// POST /api/push/test
//
// Body: { org_ref: string, endpoint: string }
//
// Fires a single test push to one subscription on the org's settings.
// On success, stamps last_test_at so the Settings UI can show "tested
// 2 min ago." On failure (410 Gone), removes the subscription from
// the list since the device clearly unsubscribed.
//
// Trust model: same as other relay endpoints — the action is benign
// (sending a push to a device the org already registered). Worth
// tightening with Firebase auth if we ever expose the API surface.

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import { sendPush } from "@/lib/push";
import type { OrgSettings, PushSubscriptionRecord } from "@/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  }

  let body: { org_ref?: string; endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const orgRef = (body.org_ref || "").trim();
  const endpoint = (body.endpoint || "").trim();
  if (!orgRef || !endpoint) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  const db = adminDb();
  const settingsSnap = await db.collection("settings").doc(orgRef).get();
  if (!settingsSnap.exists) {
    return NextResponse.json(
      { ok: false, error: "settings_not_found" },
      { status: 404 },
    );
  }
  const settings = settingsSnap.data() as OrgSettings;
  const subscriptions = settings.push_subscriptions ?? [];
  const target = subscriptions.find((s) => s.endpoint === endpoint);
  if (!target) {
    return NextResponse.json(
      { ok: false, error: "subscription_not_found" },
      { status: 404 },
    );
  }

  const builderName = settings.company_name?.trim() || "KeystonePro";
  const result = await sendPush(target, {
    title: `${builderName}: test push`,
    body: "If you see this, push notifications are working on this device.",
    tag: "test-push",
  });

  const now = new Date().toISOString();
  if (result.gone) {
    // Device unsubscribed at the OS level — prune the record.
    const nextSubs = subscriptions.filter((s) => s.endpoint !== endpoint);
    await db
      .collection("settings")
      .doc(orgRef)
      .update({ push_subscriptions: nextSubs });
    return NextResponse.json({ ok: false, error: "subscription_gone" });
  }
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.reason || "push_failed",
    });
  }
  // Success — stamp last_test_at on this subscription record.
  const nextSubs: PushSubscriptionRecord[] = subscriptions.map((s) =>
    s.endpoint === endpoint ? { ...s, last_test_at: now } : s,
  );
  await db
    .collection("settings")
    .doc(orgRef)
    .update({ push_subscriptions: nextSubs });
  return NextResponse.json({ ok: true, last_test_at: now });
}
