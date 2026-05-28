// SMS notifications for sub-contractor scheduling.
//
// sendSms() POSTs to /api/sms, which relays to Twilio when the server
// has TWILIO_* env vars set. Until then the route no-ops gracefully, so
// the scheduling flow works end-to-end before the carrier account is
// live. Compose* helpers build the message text — keep them short (one
// SMS segment is ~160 chars).

export interface SmsResult {
  ok: boolean;
  delivered: boolean;
  reason?: string;
}

/** Normalize a US phone number to E.164 (+1XXXXXXXXXX). Returns null if
 *  it doesn't look like a 10-digit US number. */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Optional per-call overrides — primarily the per-org from-number used
 *  when a builder graduates to their own Twilio Option C phone line. */
export interface SmsOptions {
  /** E.164 number to send from. Falls back to platform TWILIO_FROM_NUMBER
   *  when undefined. Source: caller's OrgSettings.sms_config.from_number. */
  fromNumberHint?: string;
}

/** Fire-and-forget SMS send. Never throws — failures resolve to
 *  { ok: false } so a notification problem can't break the caller's
 *  primary action (assigning a sub, saving a milestone, etc.). */
export async function sendSms(
  to: string,
  body: string,
  opts?: SmsOptions,
): Promise<SmsResult> {
  try {
    const res = await fetch("/api/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        body,
        from: opts?.fromNumberHint,
      }),
    });
    const data = (await res.json()) as Partial<SmsResult>;
    return {
      ok: res.ok && data.ok === true,
      delivered: data.delivered === true,
      reason: data.reason,
    };
  } catch (e) {
    return {
      ok: false,
      delivered: false,
      reason: e instanceof Error ? e.message : "send_failed",
    };
  }
}

/** YYYY-MM-DD → "Jun 2". Returns "TBD" for missing/invalid input. */
function fmtDate(iso?: string): string {
  if (!iso) return "TBD";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Text a sub gets when assigned to a project phase. */
export function composeAssignmentSms(p: {
  builderName: string;
  projectName: string;
  phaseName: string;
  address?: string;
  startDate?: string;
  endDate?: string;
  scheduleLink?: string;
}): string {
  const prefix = p.builderName ? `${p.builderName}: ` : "";
  const where = p.address ? ` at ${p.address.split("\n")[0]}` : "";
  const window =
    p.startDate || p.endDate
      ? `, ${fmtDate(p.startDate)}–${fmtDate(p.endDate)}`
      : "";
  const link = p.scheduleLink ? ` Your schedule: ${p.scheduleLink}` : "";
  return `${prefix}You're scheduled for ${p.phaseName} on ${p.projectName}${where}${window}.${link}`;
}

/** Text a sub gets when a phase they're on is rescheduled. */
export function composeRescheduleSms(p: {
  builderName: string;
  projectName: string;
  phaseName: string;
  startDate?: string;
  endDate?: string;
  scheduleLink?: string;
}): string {
  const prefix = p.builderName ? `${p.builderName}: ` : "";
  const link = p.scheduleLink ? ` Your schedule: ${p.scheduleLink}` : "";
  return `${prefix}Schedule change — ${p.phaseName} on ${p.projectName} is now ${fmtDate(p.startDate)}–${fmtDate(p.endDate)}.${link}`;
}

/** Text a sub gets inviting them to bid on an RFQ. The link drops
 *  them at /s/{token}/bid/{rfqId} where they review scope + submit. */
export function composeRfqInviteSms(p: {
  builderName: string;
  projectName: string;
  scopeTitle: string;
  bidLink: string;
}): string {
  const prefix = p.builderName ? `${p.builderName}: ` : "";
  return `${prefix}Bid request — ${p.scopeTitle} on ${p.projectName}. Submit your bid: ${p.bidLink}`;
}

/** Text the winning sub gets when the GC awards their bid. */
export function composeRfqAwardSms(p: {
  builderName: string;
  scopeTitle: string;
  projectName: string;
  bidAmount: number;
  portalLink?: string;
}): string {
  const prefix = p.builderName ? `${p.builderName}: ` : "";
  const fmt = `$${Math.round(p.bidAmount).toLocaleString("en-US")}`;
  const tail = p.portalLink ? ` Schedule: ${p.portalLink}` : "";
  return `${prefix}🎉 You've been awarded ${p.scopeTitle} on ${p.projectName} for ${fmt}.${tail}`;
}

/** Text the GC gets when a sub submits a bid. */
export function composeBidArrivedSms(p: {
  builderName: string;
  subName: string;
  scopeTitle: string;
  bidAmount: number;
}): string {
  const prefix = p.builderName ? `${p.builderName}: ` : "";
  const fmt = `$${Math.round(p.bidAmount).toLocaleString("en-US")}`;
  return `${prefix}💰 ${p.subName} bid ${fmt} for ${p.scopeTitle}`;
}

/** Reminder text a sub gets a fixed number of days before their phase
 *  starts. `lead` is the human-readable lead time ("1 week", "2 days")
 *  so the cron job that calls this controls the copy's tone. */
export function composeReminderSms(p: {
  builderName: string;
  projectName: string;
  phaseName: string;
  lead: string;
  startDate?: string;
  scheduleLink?: string;
}): string {
  const prefix = p.builderName ? `${p.builderName}: ` : "";
  const when = p.startDate ? ` (${fmtDate(p.startDate)})` : "";
  const link = p.scheduleLink ? ` Your schedule: ${p.scheduleLink}` : "";
  return `${prefix}Reminder — ${p.phaseName} on ${p.projectName} starts in ${p.lead}${when}.${link}`;
}
