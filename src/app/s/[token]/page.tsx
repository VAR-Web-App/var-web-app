"use client";

// Public sub-schedule page. The token in the URL path is the doc ID of
// a sub_schedule_links record (see firestore.rules — anyone with the
// token can read it). Renders the snapshot of the sub's assignments the
// builder wrote on their last schedule notification.
//
// NO auth required. A sub opens this from the link in their schedule
// text message.

import { use, useEffect, useState } from "react";
import { getSubScheduleLink } from "@/lib/store";
import {
  SubScheduleLink,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_STYLES,
} from "@/types/builder";

/** YYYY-MM-DD → "Mon, Jun 2". Returns "TBD" for missing/invalid input. */
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

export default function SubSchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [link, setLink] = useState<SubScheduleLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    getSubScheduleLink(token)
      .then((l) => {
        if (!active) return;
        if (!l) setMissing(true);
        else setLink(l);
        setLoaded(true);
      })
      .catch((e) => {
        console.warn("[sub-schedule] load failed", e);
        if (active) {
          setMissing(true);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="text-sm text-slate-500">Loading schedule…</div>
      </main>
    );
  }

  if (missing || !link) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <p className="text-4xl">📅</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">
          Schedule not available
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          This link may have expired. Reach out to your builder for an
          updated one.
        </p>
      </main>
    );
  }

  const upcoming = link.assignments.filter((a) => a.status !== "released");
  const done = link.assignments.filter((a) => a.status === "released");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-2xl px-6 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
            Your schedule
          </div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900">
            {link.sub_name}
          </div>
          <div className="text-xs text-slate-500">
            from {link.builder_name || "your builder"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {link.assignments.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              No phases scheduled yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {link.builder_name || "Your builder"} will text you when
              you&apos;re scheduled.
            </p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Upcoming
                </h2>
                <ul className="space-y-2">
                  {upcoming.map((a, i) => (
                    <AssignmentCard key={`u${i}`} a={a} />
                  ))}
                </ul>
              </section>
            )}
            {done.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Completed
                </h2>
                <ul className="space-y-2">
                  {done.map((a, i) => (
                    <AssignmentCard key={`d${i}`} a={a} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <footer className="mt-8 text-center text-xs text-slate-400">
          Updated {new Date(link.updated_at).toLocaleDateString()}. Questions?
          Contact {link.builder_name || "your builder"}.
        </footer>
      </main>
    </div>
  );
}

function AssignmentCard({
  a,
}: {
  a: SubScheduleLink["assignments"][number];
}) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {a.phase_name}
          </p>
          <p className="text-xs text-slate-600">{a.project_name}</p>
          {a.project_address && (
            <p className="mt-0.5 text-xs text-slate-500">
              {a.project_address.split("\n")[0]}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${MILESTONE_STATUS_STYLES[a.status]}`}
        >
          {MILESTONE_STATUS_LABELS[a.status]}
        </span>
      </div>
      <div className="mt-2 text-sm font-medium tabular-nums text-slate-700">
        {fmtDate(a.start_date)} – {fmtDate(a.end_date)}
      </div>
    </li>
  );
}
