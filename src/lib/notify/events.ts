// Smart Notifications — event registry + channel-routing rules.
//
// Pure + isomorphic (no server imports) so both the server sender
// (lib/notify/gc.ts) and the Settings UI import the same source of truth.
// A GC picks, per event, which channels fire (push / email / SMS), plus an
// optional quiet-hours window that suppresses the interruptive channels
// (push + SMS) while still letting email through.

export interface NotifyChannels {
  push?: boolean;
  email?: boolean;
  sms?: boolean;
}

export interface NotifyEventDef {
  id: string;
  label: string;
  description: string;
  defaults: Required<NotifyChannels>;
}

/** The GC-facing events a builder can be alerted on. SMS defaults off
 *  (costs money + needs a phone on file); push + email default on. */
export const NOTIFY_EVENTS: NotifyEventDef[] = [
  {
    id: "client_signed",
    label: "Client signed proposal",
    description: "A client e-signs a proposal you sent — even at 11pm.",
    defaults: { push: true, email: true, sms: false },
  },
  {
    id: "payment_recorded",
    label: "Payment recorded",
    description: "A draw or deposit payment is logged on a project.",
    defaults: { push: true, email: true, sms: false },
  },
  {
    id: "sub_bid",
    label: "Sub bid received",
    description: "A sub submits a bid on one of your RFQs.",
    defaults: { push: true, email: true, sms: false },
  },
];

export interface NotificationPrefs {
  /** Per-event channel overrides, keyed by event id. Missing keys/channels
   *  fall back to the event's defaults. */
  events?: Record<string, NotifyChannels>;
  quiet_hours?: {
    enabled?: boolean;
    /** "HH:MM" 24h. */
    start?: string;
    end?: string;
    /** IANA tz the window is expressed in. Defaults to America/Chicago. */
    tz?: string;
  };
}

const DEFAULT_TZ = "America/Chicago";

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minutesOfDayInTz(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const min = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + min;
}

/** True when `now` falls inside the org's quiet-hours window (handles
 *  overnight windows like 22:00 → 07:00). */
export function isQuietNow(
  prefs: NotificationPrefs | undefined,
  now: Date = new Date(),
): boolean {
  const q = prefs?.quiet_hours;
  if (!q?.enabled || !q.start || !q.end) return false;
  const s = toMinutes(q.start);
  const e = toMinutes(q.end);
  if (s === null || e === null || s === e) return false;
  const cur = minutesOfDayInTz(now, q.tz || DEFAULT_TZ);
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

/** Resolve which channels should fire for an event, applying per-event
 *  overrides then quiet-hours suppression (push + SMS muted; email kept). */
export function resolveChannels(
  prefs: NotificationPrefs | undefined,
  eventId: string,
  now: Date = new Date(),
): Required<NotifyChannels> {
  const def = NOTIFY_EVENTS.find((e) => e.id === eventId);
  const base = def?.defaults ?? { push: true, email: true, sms: false };
  const o = prefs?.events?.[eventId] ?? {};
  let push = o.push ?? base.push;
  let email = o.email ?? base.email;
  let sms = o.sms ?? base.sms;
  if (isQuietNow(prefs, now)) {
    push = false;
    sms = false;
  }
  return { push, email, sms };
}
