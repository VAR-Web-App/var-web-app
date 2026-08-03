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
      // Read to file correspondence + send to reply inline. Comma-separated
      // (space fails Unipile's validator). Send scope makes the consent
      // screen mention sending — the tradeoff for reply-from-the-app.
      google_scopes:
        "https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.send",
      microsoft_scopes: "Mail.Read,Mail.Send",
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

export interface UnipileEmail {
  id?: string;
  provider_id?: string;
  message_id?: string;
  thread_id?: string;
  date?: string;
  subject?: string;
  body?: string; // HTML
  body_plain?: string;
  has_attachments?: boolean;
  from_attendee?: { display_name?: string; identifier?: string };
  to_attendees?: Array<{ display_name?: string; identifier?: string }>;
  cc_attendees?: Array<{ display_name?: string; identifier?: string }>;
  attachments?: Array<{
    id?: string;
    name?: string;
    filename?: string;
    size?: number;
    mime?: string;
    extension?: string;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
}

/** Send an email (or a reply) from a connected account. `replyTo` is the
 *  provider_id of the message being replied to (threads it in Gmail/Outlook).
 *  Returns { ok, error } — ok:false with a 403-ish error means the account
 *  was connected read-only and needs a reconnect to grant send. */
export async function sendEmail(
  accountId: string,
  args: { to: string; subject: string; body: string; replyTo?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await unipileFetch("/api/v1/emails", {
      method: "POST",
      body: JSON.stringify({
        account_id: accountId,
        to: [{ identifier: args.to }],
        subject: args.subject,
        body: args.body,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
    });
    if (res.ok) return { ok: true };
    const text = await res.text();
    return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

/** Download one email attachment's raw bytes from Unipile. Best-effort. */
export async function fetchAttachmentBytes(
  emailId: string,
  attachmentId: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  try {
    const res = await unipileFetch(
      `/api/v1/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    if (!res.ok) return null;
    return {
      bytes: await res.arrayBuffer(),
      contentType: res.headers.get("content-type") || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

/** List recent emails for a connected account (newest first). Best-effort. */
export async function listEmails(
  accountId: string,
  limit = 20,
): Promise<UnipileEmail[]> {
  try {
    const res = await unipileFetch(
      `/api/v1/emails?account_id=${encodeURIComponent(accountId)}&limit=${limit}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: UnipileEmail[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

/** Crude HTML→text for email bodies (snippets + matching). */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
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
