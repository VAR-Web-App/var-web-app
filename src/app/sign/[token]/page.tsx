"use client";

// Public client-sign page. Token in the URL path is the doc ID for a
// client_sign_links record (see firestore.rules for the trust boundary
// — anyone with the token can read + sign once). Renders the proposal
// snapshot the GC sent, captures a typed signature, and writes the
// signature back to the same doc. The GC's project page picks it up
// on next load and auto-advances the deal stage to Contract Signed.
//
// NO auth required. NO redirect to login. The client receives the URL
// in an email from their builder and opens it like any other link.

import { use, useEffect, useMemo, useState } from "react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import {
  getClientSignLink,
  signClientSignLink,
} from "@/lib/store";
import { ClientSignLink, QuoteLine } from "@/types";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMoneyRound = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [link, setLink] = useState<ClientSignLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getClientSignLink(token)
      .then((l) => {
        if (!active) return;
        if (!l) {
          setMissing(true);
        } else {
          setLink(l);
          if (!signatureName && l.client_name) {
            // Pre-fill with client name as a starting point. They can edit.
            setSignatureName(l.client_name);
          }
        }
        setLoaded(true);
      })
      .catch((e) => {
        console.warn("[sign] load failed", e);
        if (active) {
          setMissing(true);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Group line items by phase for display.
  const grouped = useMemo(() => {
    if (!link) return [];
    const out: { phase: string; lines: QuoteLine[]; subtotal: number }[] = [];
    const seen = new Map<string, number>();
    for (const l of link.lines) {
      const phase = l.product_code || "Other";
      let idx = seen.get(phase);
      if (idx === undefined) {
        idx = out.length;
        seen.set(phase, idx);
        out.push({ phase, lines: [], subtotal: 0 });
      }
      out[idx].lines.push(l);
      out[idx].subtotal += l.customer_extended || 0;
    }
    return out;
  }, [link]);

  async function sign() {
    if (!link) return;
    if (!signatureName.trim()) {
      setError("Type your full name to sign.");
      return;
    }
    if (!agreed) {
      setError("Check the box to confirm acceptance.");
      return;
    }
    setSigning(true);
    setError(null);
    try {
      const ua =
        typeof navigator !== "undefined" ? navigator.userAgent : undefined;
      await signClientSignLink(token, {
        signed_by_name: signatureName.trim(),
        signed_user_agent: ua,
      });
      // Reload the link to show the signed state.
      const fresh = await getClientSignLink(token);
      if (fresh) setLink(fresh);
    } catch (e) {
      console.warn("[sign] signing failed", e);
      setError(
        "Couldn't save your signature. The link may have expired — contact your builder."
      );
    } finally {
      setSigning(false);
    }
  }

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="text-sm text-slate-500">Loading proposal…</div>
      </main>
    );
  }

  if (missing || !link) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <p className="text-4xl">📄</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">
          Proposal not available
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          This link may have expired or been replaced with a newer version.
          Reach out to your builder for an updated link.
        </p>
      </main>
    );
  }

  const alreadySigned = !!link.signed_at;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
              Project Proposal
            </div>
            <div className="mt-0.5 text-sm font-semibold text-slate-900">
              {link.business_name}
            </div>
          </div>
          {alreadySigned && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircleIcon className="h-4 w-4" />
              Signed
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <article className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <div className="border-b-2 border-sky-700 pb-5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {link.deal_name}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Prepared for {link.client_name}
              {link.client_address && (
                <span className="text-slate-500"> · {link.client_address}</span>
              )}
            </p>
          </div>

          {link.scope_summary && (
            <section className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Scope
              </h2>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">
                {link.scope_summary}
              </p>
            </section>
          )}

          <section className="mt-6 rounded-lg bg-sky-50 px-5 py-4 ring-1 ring-sky-200">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
              Contract amount
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {fmtMoneyRound(link.contract_amount)}
            </div>
          </section>

          {grouped.length > 0 && (
            <section className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Line items
              </h2>
              <div className="mt-3 space-y-4">
                {grouped.map((g) => (
                  <div key={g.phase}>
                    <div className="mb-1 flex items-baseline justify-between border-b border-slate-200 pb-1">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                        {g.phase}
                      </h3>
                      <span className="text-xs font-semibold tabular-nums text-slate-700">
                        {fmtMoney(g.subtotal)}
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {g.lines.map((l) => (
                        <li
                          key={l.id}
                          className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
                        >
                          <span className="min-w-0 text-slate-800">
                            {l.description || (
                              <em className="text-slate-400">No description</em>
                            )}
                            {l.qty > 1 && (
                              <span className="text-slate-400"> · {l.qty} ×</span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-700">
                            {fmtMoney(l.customer_extended)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-8 border-t border-slate-200 pt-6">
            {alreadySigned ? (
              <div className="rounded-md bg-emerald-50 p-5 ring-1 ring-emerald-200">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-5 w-5 text-emerald-700" />
                  <span className="text-sm font-semibold text-emerald-900">
                    Thanks — proposal signed.
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-emerald-800">
                  Signed by{" "}
                  <strong className="font-semibold">{link.signed_by_name}</strong>
                  {link.signed_at && (
                    <>
                      {" "}
                      on {new Date(link.signed_at).toLocaleDateString()} at{" "}
                      {new Date(link.signed_at).toLocaleTimeString()}
                    </>
                  )}
                  . {link.business_name} has been notified and will follow up
                  with next steps.
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-slate-900">
                  Sign &amp; accept
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  By signing, you authorize {link.business_name} to proceed with
                  the work described above for the contract amount stated.
                </p>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-600">
                      Your full name
                    </label>
                    <input
                      type="text"
                      value={signatureName}
                      onChange={(e) => setSignatureName(e.target.value)}
                      placeholder="Type your name to sign"
                      autoComplete="name"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      style={{ fontFamily: '"Caveat", "Brush Script MT", cursive' }}
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Your typed name serves as your electronic signature.
                    </p>
                  </div>
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-sky-700"
                    />
                    <span>
                      I agree to the scope and contract amount above. I
                      understand this is a binding acceptance.
                    </span>
                  </label>
                  {error && (
                    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                      {error}
                    </p>
                  )}
                  <button
                    onClick={sign}
                    disabled={signing || !signatureName.trim() || !agreed}
                    className="w-full rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {signing
                      ? "Saving…"
                      : `Sign & accept ${fmtMoneyRound(link.contract_amount)}`}
                  </button>
                </div>
              </>
            )}
          </section>
        </article>

        <footer className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
          {link.business_phone && <span>{link.business_phone}</span>}
          {link.business_email && (
            <a
              href={`mailto:${link.business_email}`}
              className="text-slate-600 hover:text-slate-900 hover:underline"
            >
              {link.business_email}
            </a>
          )}
          {link.business_license && (
            <span className="text-slate-400">License #{link.business_license}</span>
          )}
        </footer>
      </main>
    </div>
  );
}
