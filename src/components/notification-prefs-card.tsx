"use client";

// Settings → Smart Notifications routing. Per-event channel toggles
// (push / email / SMS) + a quiet-hours window. Persists on every change so
// there's nothing to remember to Save (mirrors the push opt-in card).

import { saveSettings } from "@/lib/store";
import type { OrgSettings } from "@/types";
import {
  NOTIFY_EVENTS,
  type NotifyChannels,
  type NotificationPrefs,
} from "@/lib/notify/events";

type Channel = keyof NotifyChannels;
const CHANNELS: { key: Channel; label: string }[] = [
  { key: "push", label: "Push" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
];

export default function NotificationPrefsCard({
  settings,
  onChange,
}: {
  settings: OrgSettings;
  onChange: (s: OrgSettings) => void;
}) {
  const prefs: NotificationPrefs = settings.notification_prefs ?? {};

  function update(next: NotificationPrefs) {
    const nextSettings = { ...settings, notification_prefs: next };
    onChange(nextSettings);
    void saveSettings(nextSettings);
  }

  function channelOn(eventId: string, ch: Channel): boolean {
    const def = NOTIFY_EVENTS.find((e) => e.id === eventId)!.defaults[ch];
    return prefs.events?.[eventId]?.[ch] ?? def;
  }

  function toggle(eventId: string, ch: Channel) {
    const events = { ...(prefs.events ?? {}) };
    const cur = events[eventId] ?? {};
    events[eventId] = { ...cur, [ch]: !channelOn(eventId, ch) };
    update({ ...prefs, events });
  }

  const quiet = prefs.quiet_hours ?? {};
  function setQuiet(patch: Partial<NonNullable<NotificationPrefs["quiet_hours"]>>) {
    update({ ...prefs, quiet_hours: { ...quiet, ...patch } });
  }

  return (
    <div className="space-y-5">
      {/* Per-event routing */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="pb-2 font-medium">Notify me when…</th>
              {CHANNELS.map((c) => (
                <th key={c.key} className="w-16 pb-2 text-center font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFY_EVENTS.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-slate-800">{e.label}</div>
                  <div className="text-xs text-slate-500">{e.description}</div>
                </td>
                {CHANNELS.map((c) => (
                  <td key={c.key} className="py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={channelOn(e.id, c.key)}
                      onChange={() => toggle(e.id, c.key)}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      aria-label={`${e.label} — ${c.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        SMS needs a phone number on file (Business info) and can incur carrier
        costs. Push goes to devices you&rsquo;ve enabled above.
      </p>

      {/* Quiet hours */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            checked={!!quiet.enabled}
            onChange={(ev) => setQuiet({ enabled: ev.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          Quiet hours
        </label>
        <p className="mt-1 text-xs text-slate-500">
          During this window, push + SMS are held back — email still comes
          through so nothing is missed.
        </p>
        {quiet.enabled && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">From</span>
            <input
              type="time"
              value={quiet.start ?? "22:00"}
              onChange={(ev) => setQuiet({ start: ev.target.value })}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <span className="text-slate-600">to</span>
            <input
              type="time"
              value={quiet.end ?? "07:00"}
              onChange={(ev) => setQuiet({ end: ev.target.value })}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}
