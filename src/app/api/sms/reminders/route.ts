// Daily cron handler — fires T-7, T-2, and T-1 SMS reminders for every
// project milestone whose planned_start_date is 7, 2, or 1 day from now.
//
// Wired up via vercel.json (see crons block) to run once a day. Vercel
// includes an `Authorization: Bearer ${CRON_SECRET}` header on the
// scheduled invocation; we verify it so the route can't be triggered
// by anyone with the URL.
//
// What it does, per run:
//   1. Computes target dates: today + 7d, +2d, and +1d (YYYY-MM-DD).
//   2. Queries project_milestones where planned_start_date is in those
//      three values (Firestore `in` query, max 10 values — we use 3).
//   3. For each matching milestone, checks the dedup field
//      (t7_reminded_for_start / t2_reminded_for_start /
//      t1_reminded_for_start). If it already equals the milestone's
//      current planned_start_date, skip — we already reminded for THIS
//      start date.
//   4. Otherwise: fetches the parent Deal + org settings, and for each
//      assigned sub (Distributor) with sms_consent + a valid phone,
//      composes a reminder SMS and ships it through the platform's
//      Twilio config.
//   5. Stamps the dedup field on the milestone so a second cron run
//      on the same day doesn't re-send.
//
// Failures on individual sends are logged but don't abort the run —
// one unreachable sub shouldn't block the others.

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import { composeReminderSms, toE164 } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import { composeReminderEmail, isLikelyEmail } from "@/lib/email-compose";
import { sendPushToAll } from "@/lib/push";
import type { ProjectMilestone } from "@/types/builder";
import type { Deal, Distributor, OrgSettings } from "@/types";

export const runtime = "nodejs";
// Up to 60s — querying milestones across orgs + serial Twilio sends.
export const maxDuration = 60;

interface ReminderResult {
  ok: boolean;
  ran_at: string;
  configured: boolean;
  considered: number;
  sent: number;
  skipped: number;
  errors: number;
  detail?: string;
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// Vercel Cron pings the URL via GET. Accepting both keeps manual
// invocation simple for testing.
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const ran_at = new Date().toISOString();

  // Reject anything that isn't Vercel's scheduled invocation when a
  // CRON_SECRET is configured. Without the secret set, the route runs
  // wide open — easier for local testing, but production should set it.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json(
        { ok: false, ran_at, error: "unauthorized" },
        { status: 401 },
      );
    }
  }

  if (!adminConfigured()) {
    // Graceful no-op — same pattern the SMS send route uses when
    // TWILIO_* env vars aren't set. Returns 200 so Vercel doesn't
    // mark the cron as failing while we're still configuring infra.
    return NextResponse.json<ReminderResult>({
      ok: true,
      ran_at,
      configured: false,
      considered: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
      detail: "FIREBASE_SERVICE_ACCOUNT_KEY not set — skipping run.",
    });
  }

  const db = adminDb();

  // Target dates: T-7, T-2, T-1 from today, as YYYY-MM-DD strings to
  // match what the rest of the app stores.
  const t7Date = ymd(daysFromToday(7));
  const t2Date = ymd(daysFromToday(2));
  const t1Date = ymd(daysFromToday(1));

  // Single Firestore query for all three target dates.
  const snap = await db
    .collection("project_milestones")
    .where("planned_start_date", "in", [t7Date, t2Date, t1Date])
    .get();

  // Cache per-deal data so we don't re-fetch settings + sub list once
  // per milestone if multiple milestones share the same deal.
  const dealCache = new Map<string, Deal | null>();
  const settingsCache = new Map<string, OrgSettings | null>();
  const subCache = new Map<string, Distributor | null>();

  async function getDeal(id: string): Promise<Deal | null> {
    if (dealCache.has(id)) return dealCache.get(id)!;
    const doc = await db.collection("deals").doc(id).get();
    const d = doc.exists ? ({ id: doc.id, ...doc.data() } as Deal) : null;
    dealCache.set(id, d);
    return d;
  }
  async function getSettings(orgRef: string): Promise<OrgSettings | null> {
    if (settingsCache.has(orgRef)) return settingsCache.get(orgRef)!;
    const doc = await db.collection("settings").doc(orgRef).get();
    const s = doc.exists
      ? ({ ...(doc.data() as OrgSettings), org_ref: orgRef })
      : null;
    settingsCache.set(orgRef, s);
    return s;
  }
  async function getSub(id: string): Promise<Distributor | null> {
    if (subCache.has(id)) return subCache.get(id)!;
    const doc = await db.collection("distributors").doc(id).get();
    const d = doc.exists ? ({ id: doc.id, ...doc.data() } as Distributor) : null;
    subCache.set(id, d);
    return d;
  }

  const platformFrom = process.env.TWILIO_FROM_NUMBER;
  const allowedExtra = (process.env.TWILIO_ALLOWED_FROM_NUMBERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let considered = 0;
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const milestoneDoc of snap.docs) {
    const milestone = {
      id: milestoneDoc.id,
      ...milestoneDoc.data(),
    } as ProjectMilestone;
    const startDate = milestone.planned_start_date;
    if (!startDate) continue;

    // Which reminder kind? Matches startDate against the three target
    // dates. Only one runs per pass per milestone since start_date can
    // only equal one of T-7 / T-2 / T-1 on a given day.
    const isT7 = startDate === t7Date;
    const isT2 = startDate === t2Date;
    const isT1 = startDate === t1Date;
    if (!isT7 && !isT2 && !isT1) continue;

    const kind: "t7" | "t2" | "t1" = isT7 ? "t7" : isT2 ? "t2" : "t1";
    const lead = isT7 ? "1 week" : isT2 ? "2 days" : "1 day";
    const dedupField = isT7
      ? "t7_reminded_for_start"
      : isT2
        ? "t2_reminded_for_start"
        : "t1_reminded_for_start";
    const alreadyReminded = milestone[dedupField] === startDate;
    if (alreadyReminded) {
      skipped++;
      continue;
    }

    const assignedSubIds = milestone.assigned_subs ?? [];
    if (assignedSubIds.length === 0) {
      skipped++;
      continue;
    }

    considered++;
    const deal = await getDeal(milestone.deal_ref);
    if (!deal) {
      skipped++;
      continue;
    }
    const settings = await getSettings(deal.org_ref);
    const builderName = settings?.company_name?.trim() || "";

    // Pick the per-org from-number (Option C) if configured, else
    // platform default (Option A).
    const orgFromNumber = settings?.sms_config?.from_number?.trim();
    const fromNumber =
      orgFromNumber &&
      (orgFromNumber === platformFrom || allowedExtra.includes(orgFromNumber))
        ? orgFromNumber
        : platformFrom;

    let anySent = false;

    for (const subId of assignedSubIds) {
      try {
        const sub = await getSub(subId);
        if (!sub) continue;

        const scheduleLink = sub.schedule_token
          ? `https://${getHostHeader(req)}/s/${sub.schedule_token}`
          : undefined;
        const params = {
          builderName,
          projectName: deal.name,
          phaseName: milestone.name,
          lead,
          startDate,
          scheduleLink,
        };

        // SMS — gated on consent + valid phone.
        const to = toE164(sub.phone ?? "");
        if (to && sub.sms_consent === true) {
          const ok = await sendTwilio(
            to,
            composeReminderSms(params),
            fromNumber,
          );
          if (ok) {
            sent++;
            anySent = true;
          } else {
            errors++;
          }
        }

        // Email fallback — gated only on a well-formed address. Sub
        // gets both channels if both are set up; either channel alone
        // is enough to count this milestone as reminded.
        if (isLikelyEmail(sub.email)) {
          const emailRes = await sendEmail({
            to: sub.email!,
            ...composeReminderEmail(params),
          });
          if (emailRes.ok) {
            sent++;
            anySent = true;
          } else if (emailRes.reason && emailRes.reason !== "not_configured") {
            errors++;
          }
        }

        // Web push fallback — fires for every device the sub has
        // subscribed (after they installed the PWA + granted
        // permission). Stale subscriptions get pruned from the
        // returned list and persisted back so the next run doesn't
        // retry dead endpoints.
        const subscriptions = sub.push_subscriptions ?? [];
        if (subscriptions.length > 0) {
          const stillActive = await sendPushToAll(subscriptions, {
            title: `${builderName || "FrameFlow"}: ${milestone.name} starts in ${lead}`,
            body: `${deal.name}${startDate ? ` (${startDate})` : ""}`,
            url: sub.schedule_token ? `/s/${sub.schedule_token}` : "/",
            tag: `reminder-${milestone.id}-${kind}`,
          });
          if (stillActive.length !== subscriptions.length) {
            // Drop the gone subscriptions back to Firestore so we
            // don't retry them next tick.
            try {
              await db
                .collection("distributors")
                .doc(sub.id)
                .update({ push_subscriptions: stillActive });
            } catch (e) {
              console.warn(
                "[sms/reminders] push subscription prune failed",
                e,
              );
            }
          }
          if (stillActive.length > 0) {
            sent++;
            anySent = true;
          }
        }
      } catch (e) {
        errors++;
        console.warn(
          `[sms/reminders] send failed for milestone ${milestone.id} sub ${subId}`,
          e,
        );
      }
    }

    // Stamp dedup even if every sub had no consent / no phone — we
    // attempted this reminder cycle for this start date, no point
    // re-trying every subsequent cron tick today.
    if (anySent || true) {
      try {
        await db
          .collection("project_milestones")
          .doc(milestone.id)
          .update({ [dedupField]: startDate });
      } catch (e) {
        console.warn(
          `[sms/reminders] dedup write failed for ${milestone.id}`,
          e,
        );
      }
    }

    void kind; // kind is captured in dedupField + lead above
  }

  return NextResponse.json<ReminderResult>({
    ok: true,
    ran_at,
    configured: true,
    considered,
    sent,
    skipped,
    errors,
  });
}

function daysFromToday(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getHostHeader(req: NextRequest): string {
  return req.headers.get("host") ?? "frameflow.app";
}

/** Direct Twilio Messages API call — same shape as /api/sms/route.ts
 *  but inlined here so the cron doesn't have to relay through itself. */
async function sendTwilio(
  to: string,
  body: string,
  from: string | undefined,
): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !from) {
    console.warn("[sms/reminders] TWILIO_* env not set — skipping send", { to });
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
        `[sms/reminders] twilio_error_${res.status}`,
        detail.slice(0, 200),
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[sms/reminders] twilio_unreachable", e);
    return false;
  }
}
