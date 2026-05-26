// POST /api/sub/acknowledge — Sub-side schedule acknowledgment endpoint.
//
// The sub portal at /s/[token] calls this when the sub clicks "Confirm"
// or "Flag conflict" on one of their assigned phases. The token in the
// request body is the *only* auth — the server verifies it resolves to
// a SubScheduleLink, then confirms the milestone_ref is actually in
// that link's assignments before writing. This prevents a holder of
// one sub's token from acking another sub's milestones.
//
// What it writes:
//   1. A new sub_acknowledgments record (audit trail; one row per
//      action, so a "confirmed → later flagged" sequence is preserved).
//   2. Updates the matching assignment on the SubScheduleLink with the
//      latest acknowledgment so the portal renders state without a
//      second collection read.
//
// Failure modes:
//   - Token doesn't resolve → 404
//   - milestone_ref isn't in the link's assignments → 403
//   - admin SDK not configured → 503

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import { toE164 } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import {
  composeConflictNotifyEmail,
  isLikelyEmail,
} from "@/lib/email-compose";
import { sendPushToAll } from "@/lib/push";
import type { SubAcknowledgment, SubScheduleLink } from "@/types/builder";
import type { Deal, OrgSettings } from "@/types";

export const runtime = "nodejs";

interface AcknowledgeBody {
  token: string;
  milestone_ref: string;
  status: "confirmed" | "conflict";
  reason?: string;
}

export async function POST(req: NextRequest) {
  let body: AcknowledgeBody;
  try {
    body = (await req.json()) as AcknowledgeBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const { token, milestone_ref, status } = body;
  if (!token || !milestone_ref || (status !== "confirmed" && status !== "conflict")) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }
  if (status === "conflict" && !body.reason?.trim()) {
    return NextResponse.json(
      { ok: false, error: "reason_required" },
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

  const idx = (link.assignments || []).findIndex(
    (a) => a.milestone_ref === milestone_ref,
  );
  if (idx < 0) {
    return NextResponse.json(
      { ok: false, error: "milestone_not_assigned" },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();
  const reason =
    status === "conflict" ? body.reason!.trim().slice(0, 500) : undefined;
  const matched = link.assignments[idx];

  const ack: SubAcknowledgment = {
    id: db.collection("sub_acknowledgments").doc().id,
    org_ref: link.org_ref,
    deal_ref: "", // set below from milestone lookup
    milestone_ref,
    sub_ref: link.sub_ref,
    token,
    status,
    ...(reason ? { reason } : {}),
    ...(matched.start_date ? { for_start_date: matched.start_date } : {}),
    created_at: now,
  };

  // Resolve deal_ref from the milestone so GC-side queries can filter
  // by deal without an extra hop.
  try {
    const msSnap = await db
      .collection("project_milestones")
      .doc(milestone_ref)
      .get();
    if (msSnap.exists) {
      const ms = msSnap.data() as { deal_ref?: string };
      ack.deal_ref = ms.deal_ref ?? "";
    }
  } catch (e) {
    console.warn("[sub/acknowledge] milestone lookup failed", e);
  }

  await db.collection("sub_acknowledgments").doc(ack.id).set(ack);

  // Patch the matching assignment on the SubScheduleLink so the portal
  // shows the new state without a second query on reload.
  const nextAssignments = link.assignments.map((a, i) =>
    i === idx
      ? {
          ...a,
          acknowledgment: {
            status,
            ...(reason ? { reason } : {}),
            created_at: now,
          },
        }
      : a,
  );
  await db
    .collection("sub_schedule_links")
    .doc(token)
    .update({ assignments: nextAssignments, updated_at: now });

  // Conflict only — text the GC so it doesn't sit unnoticed in the
  // deal page. Failures here don't fail the request; the durable ack
  // record is already written and visible in the GC's UI on next load.
  if (status === "conflict" && ack.deal_ref) {
    void notifyGcOfConflict(ack.deal_ref, link.sub_name, matched, reason);
  }

  return NextResponse.json({ ok: true, ack });
}

async function notifyGcOfConflict(
  dealRef: string,
  subName: string,
  assignment: SubScheduleLink["assignments"][number],
  reason: string | undefined,
): Promise<void> {
  try {
    const db = adminDb();
    const dealSnap = await db.collection("deals").doc(dealRef).get();
    if (!dealSnap.exists) return;
    const deal = dealSnap.data() as Deal;

    const settingsSnap = await db
      .collection("settings")
      .doc(deal.org_ref)
      .get();
    if (!settingsSnap.exists) return;
    const settings = settingsSnap.data() as OrgSettings;

    const builder = settings.company_name?.trim() || "FrameFlow";

    // Email branch — fires whenever org has a valid company_email,
    // independent of SMS. Captures GC alerts even pre-A2P approval.
    if (isLikelyEmail(settings.company_email)) {
      void sendEmail({
        to: settings.company_email!,
        ...composeConflictNotifyEmail({
          builderName: builder,
          subName,
          phaseName: assignment.phase_name,
          projectName: assignment.project_name,
          startDate: assignment.start_date,
          reason,
        }),
      });
    }

    // Push branch — fires for every device the GC has registered via
    // Settings → Instant alerts. Same prune-stale pattern as the
    // bid-arrival path.
    const orgSubscriptions = settings.push_subscriptions ?? [];
    if (orgSubscriptions.length > 0) {
      const stillActive = await sendPushToAll(orgSubscriptions, {
        title: `⚠ ${subName} flagged a conflict`,
        body: `${assignment.phase_name} on ${assignment.project_name}${reason ? ` — "${reason}"` : ""}`,
        url: `/deals/${dealRef}`,
        tag: `conflict-${dealRef}`,
      });
      if (stillActive.length !== orgSubscriptions.length) {
        try {
          await db
            .collection("settings")
            .doc(deal.org_ref)
            .update({ push_subscriptions: stillActive });
        } catch (e) {
          console.warn("[sub/acknowledge] org push prune failed", e);
        }
      }
    }

    // SMS branch — gated on valid phone + Twilio configured.
    const to = toE164(settings.company_phone ?? "");
    if (!to) {
      console.warn(
        "[sub/acknowledge] no E.164 company_phone — SMS GC notify skipped (email may still fire)",
        { dealRef, org: deal.org_ref },
      );
      return;
    }

    const startStr = assignment.start_date
      ? ` (${assignment.start_date})`
      : "";
    const reasonStr = reason ? ` — "${reason}"` : "";
    const body =
      `${builder}: ⚠ ${subName} flagged a conflict on ` +
      `${assignment.phase_name} for ${assignment.project_name}${startStr}${reasonStr}`;

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

    await sendTwilio(to, body.slice(0, 600), from);
  } catch (e) {
    console.warn("[sub/acknowledge] GC notify failed", e);
  }
}

async function sendTwilio(
  to: string,
  body: string,
  from: string | undefined,
): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !from) {
    console.warn("[sub/acknowledge] TWILIO_* env not set — skipping send", {
      to,
    });
    return false;
  }
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  try {
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
      console.warn(
        `[sub/acknowledge] twilio_error_${res.status}`,
        detail.slice(0, 200),
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[sub/acknowledge] twilio_unreachable", e);
    return false;
  }
}
