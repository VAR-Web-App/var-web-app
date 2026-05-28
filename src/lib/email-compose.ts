// Email body templates. Pure functions — safe to import on the
// client. The server-side delivery lives in lib/email.ts (which
// imports SendGrid; do NOT import that from client code).

function fmtDate(iso?: string): string {
  if (!iso) return "TBD";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function wrapHtml(p: {
  preheader: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): string {
  const cta = p.ctaUrl
    ? `<p style="margin:24px 0"><a href="${p.ctaUrl}" style="background:#0369a1;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${p.ctaLabel ?? "Open"}</a></p>`
    : "";
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#0369a1;font-weight:600">KeystonePro</div>
<div style="font-size:14px;color:#1e293b;margin-top:8px;line-height:1.5">${p.body}</div>
${cta}
</div>
<div style="text-align:center;margin-top:16px;font-size:11px;color:#64748b">${p.preheader}</div>
</body></html>`;
}

export interface ComposedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface AssignmentEmailParams {
  builderName: string;
  projectName: string;
  phaseName: string;
  address?: string;
  startDate?: string;
  endDate?: string;
  scheduleLink?: string;
}

export function composeAssignmentEmail(
  p: AssignmentEmailParams,
): ComposedEmail {
  const subject = `${p.builderName || "KeystonePro"}: scheduled for ${p.phaseName} on ${p.projectName}`;
  const where = p.address ? ` at ${p.address.split("\n")[0]}` : "";
  const window =
    p.startDate || p.endDate
      ? `, ${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}`
      : "";
  const text =
    `You're scheduled for ${p.phaseName} on ${p.projectName}${where}${window}.` +
    (p.scheduleLink ? `\n\nYour schedule: ${p.scheduleLink}` : "");
  const html = wrapHtml({
    preheader: "Open the link for the full schedule.",
    body: `You're scheduled for <strong>${p.phaseName}</strong> on <strong>${p.projectName}</strong>${where}${window}.`,
    ctaUrl: p.scheduleLink,
    ctaLabel: "View schedule",
  });
  return { subject, text, html };
}

export interface RescheduleEmailParams {
  builderName: string;
  projectName: string;
  phaseName: string;
  startDate?: string;
  endDate?: string;
  scheduleLink?: string;
}

export function composeRescheduleEmail(
  p: RescheduleEmailParams,
): ComposedEmail {
  const subject = `${p.builderName || "KeystonePro"}: schedule change — ${p.phaseName}`;
  const text =
    `Schedule change — ${p.phaseName} on ${p.projectName} is now ${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}.` +
    (p.scheduleLink ? `\n\nYour schedule: ${p.scheduleLink}` : "");
  const html = wrapHtml({
    preheader: "Updated dates inside.",
    body: `Schedule change — <strong>${p.phaseName}</strong> on ${p.projectName} is now <strong>${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}</strong>.`,
    ctaUrl: p.scheduleLink,
    ctaLabel: "View schedule",
  });
  return { subject, text, html };
}

export interface RfqInviteEmailParams {
  builderName: string;
  projectName: string;
  scopeTitle: string;
  bidLink: string;
}

export function composeRfqInviteEmail(
  p: RfqInviteEmailParams,
): ComposedEmail {
  const subject = `${p.builderName || "KeystonePro"}: bid request — ${p.scopeTitle}`;
  const text = `Bid request — ${p.scopeTitle} on ${p.projectName}.\n\nReview scope and submit your bid: ${p.bidLink}`;
  const html = wrapHtml({
    preheader: "Review scope and submit your bid online.",
    body: `Bid request — <strong>${p.scopeTitle}</strong> on <strong>${p.projectName}</strong>.`,
    ctaUrl: p.bidLink,
    ctaLabel: "Submit your bid",
  });
  return { subject, text, html };
}

export interface BidArrivedEmailParams {
  builderName: string;
  subName: string;
  scopeTitle: string;
  bidAmount: number;
  rfqLink?: string;
}

export function composeBidArrivedEmail(
  p: BidArrivedEmailParams,
): ComposedEmail {
  const fmt = `$${Math.round(p.bidAmount).toLocaleString("en-US")}`;
  const subject = `${p.subName} bid ${fmt} for ${p.scopeTitle}`;
  const text =
    `${p.subName} just submitted a bid of ${fmt} for "${p.scopeTitle}".` +
    (p.rfqLink ? `\n\nReview bids: ${p.rfqLink}` : "");
  const html = wrapHtml({
    preheader: `Bid: ${fmt}`,
    body: `<strong>${p.subName}</strong> just submitted a bid of <strong>${fmt}</strong> for "${p.scopeTitle}".`,
    ctaUrl: p.rfqLink,
    ctaLabel: "Review bids",
  });
  return { subject, text, html };
}

export interface RfqAwardEmailParams {
  builderName: string;
  scopeTitle: string;
  projectName: string;
  bidAmount: number;
  /** Sub-portal link they'll use to see project schedule / next steps. */
  portalLink?: string;
}

/** Email the winning sub gets after the GC awards their bid. Tone:
 *  celebratory but professional — they've earned the work, here's
 *  what comes next. */
export function composeRfqAwardEmail(
  p: RfqAwardEmailParams,
): ComposedEmail {
  const fmt = `$${Math.round(p.bidAmount).toLocaleString("en-US")}`;
  const subject = `🎉 You've been awarded: ${p.scopeTitle} (${fmt})`;
  const text =
    `Good news — ${p.builderName || "the builder"} awarded your bid of ${fmt} ` +
    `for "${p.scopeTitle}" on ${p.projectName}.` +
    (p.portalLink ? `\n\nProject schedule + next steps: ${p.portalLink}` : "") +
    `\n\nLook out for an assignment confirmation once the phase is scheduled.`;
  const html = wrapHtml({
    preheader: `${fmt} awarded — congrats.`,
    body:
      `Good news — <strong>${p.builderName || "the builder"}</strong> awarded ` +
      `your bid of <strong>${fmt}</strong> for "${p.scopeTitle}" on ` +
      `<strong>${p.projectName}</strong>. ` +
      `Look out for an assignment confirmation once the phase is scheduled.`,
    ctaUrl: p.portalLink,
    ctaLabel: "Open your portal",
  });
  return { subject, text, html };
}

export interface ReminderEmailParams {
  builderName: string;
  projectName: string;
  phaseName: string;
  lead: string;
  startDate?: string;
  scheduleLink?: string;
}

export function composeReminderEmail(p: ReminderEmailParams): ComposedEmail {
  const when = p.startDate ? ` (${fmtDate(p.startDate)})` : "";
  const subject = `${p.builderName || "KeystonePro"}: ${p.phaseName} starts in ${p.lead}`;
  const text =
    `Reminder — ${p.phaseName} on ${p.projectName} starts in ${p.lead}${when}.` +
    (p.scheduleLink ? `\n\nYour schedule: ${p.scheduleLink}` : "");
  const html = wrapHtml({
    preheader: `Heads-up — starts in ${p.lead}.`,
    body: `Reminder — <strong>${p.phaseName}</strong> on ${p.projectName} starts in <strong>${p.lead}</strong>${when}.`,
    ctaUrl: p.scheduleLink,
    ctaLabel: "View schedule",
  });
  return { subject, text, html };
}

export interface ConflictNotifyEmailParams {
  builderName: string;
  subName: string;
  phaseName: string;
  projectName: string;
  startDate?: string;
  reason?: string;
  dealLink?: string;
}

export function composeConflictNotifyEmail(
  p: ConflictNotifyEmailParams,
): ComposedEmail {
  const startStr = p.startDate ? ` (${fmtDate(p.startDate)})` : "";
  const reasonStr = p.reason ? `\n\nReason: "${p.reason}"` : "";
  const subject = `⚠ ${p.subName} flagged a conflict — ${p.phaseName}`;
  const text =
    `${p.subName} flagged a conflict on ${p.phaseName} for ${p.projectName}${startStr}.${reasonStr}` +
    (p.dealLink ? `\n\nOpen project: ${p.dealLink}` : "");
  const html = wrapHtml({
    preheader: `${p.subName} flagged a conflict`,
    body: `⚠ <strong>${p.subName}</strong> flagged a conflict on <strong>${p.phaseName}</strong> for ${p.projectName}${startStr}.${p.reason ? `<br/><br/><em>"${p.reason}"</em>` : ""}`,
    ctaUrl: p.dealLink,
    ctaLabel: "Open project",
  });
  return { subject, text, html };
}

export function isLikelyEmail(s: string | undefined | null): boolean {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export interface SendEmailResult {
  ok: boolean;
  delivered: boolean;
  reason?: string;
}

/** Client-side wrapper that POSTs a composed email through /api/email.
 *  Mirrors sendSms() in lib/sms.ts. Never throws — failures resolve
 *  to { ok: false } so callers can fire-and-forget. */
export async function sendEmail(
  to: string,
  composed: ComposedEmail,
): Promise<SendEmailResult> {
  if (!isLikelyEmail(to)) {
    return { ok: false, delivered: false, reason: "invalid_email" };
  }
  try {
    const res = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject: composed.subject,
        text: composed.text,
        html: composed.html,
      }),
    });
    const data = (await res.json()) as Partial<SendEmailResult>;
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
