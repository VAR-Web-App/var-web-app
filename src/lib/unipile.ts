// Server-only Unipile client. Unipile is a unified inbox API (Gmail /
// Outlook / IMAP behind one integration). We operate under Unipile's
// CASA-verified Google/Microsoft app, so there's no OAuth security audit
// on our side — the builder just clicks "Connect your inbox" and signs in.
//
// Env: UNIPILE_DSN (e.g. https://api55.unipile.com:18505) + UNIPILE_API_KEY.
// Used by /api/unipile/connect (mint hosted-auth link) and
// /api/unipile/notify (store the connected account). Email sync/send layer
// on top of this comes next.

const DSN = process.env.UNIPILE_DSN;
const API_KEY = process.env.UNIPILE_API_KEY;

export function unipileConfigured(): boolean {
  return !!(DSN && API_KEY);
}

async function unipileFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!DSN || !API_KEY) throw new Error("Unipile not configured");
  const base = DSN.replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "X-API-KEY": API_KEY,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export interface HostedAuthArgs {
  orgRef: string;
  notifyUrl: string;
  successUrl: string;
  failureUrl: string;
  /** ISO 8601 expiry for the link. */
  expiresOn: string;
}

/** Mint a short-lived hosted-auth URL. The builder opens it, picks Google
 *  or Microsoft, and completes the normal OAuth consent. On success Unipile
 *  POSTs { status, account_id, name } to notifyUrl (name === orgRef). */
export async function createHostedAuthLink(a: HostedAuthArgs): Promise<string> {
  const res = await unipileFetch("/api/v1/hosted/accounts/link", {
    method: "POST",
    body: JSON.stringify({
      type: "create",
      // Email providers only (Unipile's enum: GOOGLE | OUTLOOK | MAIL) — not
      // the messaging channels it also offers. MAIL = generic IMAP, which
      // covers Yahoo/ISP mailboxes too.
      providers: ["GOOGLE", "OUTLOOK", "MAIL"],
      api_url: DSN,
      expiresOn: a.expiresOn,
      success_redirect_url: a.successUrl,
      failure_redirect_url: a.failureUrl,
      notify_url: a.notifyUrl,
      name: a.orgRef,
      // Request READ-ONLY mail scope so the consent screen reads "view your
      // email" instead of "read, compose, send, and delete all your email".
      // We only read to file correspondence onto deals. When we add
      // reply-from-your-inbox, escalate to gmail.send / Mail.Send here (a
      // one-time reconnect). Unipile adds its own identity scopes.
      google_scopes: "https://www.googleapis.com/auth/gmail.readonly",
      microsoft_scopes: "Mail.Read",
    }),
  });
  if (!res.ok) {
    throw new Error(`hosted link failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("hosted link response missing url");
  return data.url;
}

export interface UnipileAccount {
  id?: string;
  type?: string; // GOOGLE | MICROSOFT | IMAP | ...
  name?: string;
  [k: string]: unknown;
}

/** Fetch a connected account to enrich our stored record (provider + email).
 *  Best-effort — returns null on any failure. */
export async function getAccount(accountId: string): Promise<UnipileAccount | null> {
  try {
    const res = await unipileFetch(
      `/api/v1/accounts/${encodeURIComponent(accountId)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as UnipileAccount;
  } catch {
    return null;
  }
}

/** Dig an email address out of a Unipile account object. The address lives
 *  under different keys per provider, so probe the likely spots and fall
 *  back to any "@"-looking string field. */
export function emailFromAccount(acct: UnipileAccount | null): string | null {
  if (!acct) return null;
  // Shape (GOOGLE_OAUTH): { name: "you@gmail.com", connection_params: {
  //   mail: { id, username } } }. `name` is the address; the mail source is
  //   the backup.
  const cp = acct.connection_params as
    | { mail?: { id?: string; username?: string } }
    | undefined;
  const candidates: unknown[] = [
    acct.name,
    (acct as Record<string, unknown>).email,
    cp?.mail?.username,
    cp?.mail?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes("@")) return c.toLowerCase();
  }
  return null;
}
