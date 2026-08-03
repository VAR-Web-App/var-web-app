// Telnyx SMS connector. Normalizes Telnyx's inbound webhook to the shape
// ingestInboundSms expects, verifies the webhook signature (Ed25519), and
// sends outbound texts. This is the one provider-specific file — the ingest
// pipeline downstream is carrier-agnostic, so a future connector (Sakari,
// Twilio) just implements the same normalize/verify/send trio.
//
// Env:
//   TELNYX_API_KEY            — bearer token for outbound sends
//   TELNYX_PUBLIC_KEY         — base64 Ed25519 public key (Portal → account)
//                               used to verify inbound webhook signatures
//   TELNYX_MESSAGING_PROFILE_ID (optional) — for outbound, if not implied

import { createPublicKey, verify as edVerify } from "crypto";
import type { NormalizedInboundSms } from "./sms-ingest";

export function telnyxConfigured(): boolean {
  return !!process.env.TELNYX_API_KEY;
}

interface TelnyxInboundPayload {
  id?: string;
  from?: { phone_number?: string };
  to?: Array<{ phone_number?: string }>;
  text?: string;
  media?: Array<{ url?: string; content_type?: string }>;
  received_at?: string;
  direction?: string;
}

interface TelnyxWebhook {
  data?: {
    event_type?: string;
    payload?: TelnyxInboundPayload;
  };
}

/**
 * Parse a Telnyx webhook body into a NormalizedInboundSms. Returns null for
 * anything that isn't an inbound `message.received` (delivery receipts,
 * outbound echoes) so the route can 200-ack and ignore it.
 */
export function parseTelnyxInbound(raw: string): NormalizedInboundSms | null {
  let hook: TelnyxWebhook;
  try {
    hook = JSON.parse(raw) as TelnyxWebhook;
  } catch {
    return null;
  }
  const evt = hook.data?.event_type;
  const p = hook.data?.payload;
  if (evt !== "message.received" || !p) return null;
  if (p.direction && p.direction !== "inbound") return null;

  const from = p.from?.phone_number ?? "";
  const to = p.to?.[0]?.phone_number ?? "";
  if (!from || !to) return null;

  return {
    providerId: p.id ?? "",
    from,
    to,
    body: p.text ?? "",
    media: (p.media ?? [])
      .filter((m) => !!m.url)
      .map((m) => ({ url: m.url as string, contentType: m.content_type })),
    receivedAt: p.received_at,
  };
}

/**
 * Verify a Telnyx webhook's Ed25519 signature. Telnyx signs
 * `${timestamp}|${rawBody}` and sends the base64 signature in
 * `telnyx-signature-ed25519` with the unix seconds in `telnyx-timestamp`.
 * The public key (base64, 32 raw bytes) comes from the Telnyx portal.
 *
 * Returns false on any malformed input so a bad/spoofed request is rejected.
 */
export function verifyTelnyxSignature(
  rawBody: string,
  signatureB64: string,
  timestamp: string,
  publicKeyB64: string,
): boolean {
  try {
    if (!signatureB64 || !timestamp || !publicKeyB64) return false;
    const rawKey = Buffer.from(publicKeyB64, "base64");
    if (rawKey.length !== 32) return false;
    // Wrap the raw 32-byte Ed25519 key in its DER SPKI header so Node can
    // build a KeyObject from it.
    const der = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      rawKey,
    ]);
    const key = createPublicKey({ key: der, format: "der", type: "spki" });
    const signed = Buffer.from(`${timestamp}|${rawBody}`, "utf8");
    return edVerify(null, signed, key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** Send an outbound text via Telnyx. Returns delivered:false with a reason
 *  when the API key isn't configured, so callers degrade gracefully. */
export async function sendTelnyxSms(args: {
  from: string;
  to: string;
  text: string;
}): Promise<{ ok: boolean; delivered: boolean; reason?: string }> {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    return { ok: true, delivered: false, reason: "telnyx_not_configured" };
  }
  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: args.from, to: args.to, text: args.text }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, delivered: false, reason: `telnyx_error_${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true, delivered: true };
  } catch (e) {
    return {
      ok: false,
      delivered: false,
      reason: e instanceof Error ? e.message : "telnyx_unreachable",
    };
  }
}
