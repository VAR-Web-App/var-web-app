// Standalone proof for the Telnyx connector — no Firestore, no account.
// Generates an Ed25519 keypair, signs a realistic message.received webhook
// the way Telnyx does (`${timestamp}|${body}`), then asserts our verify +
// parse produce the right results (and that tampering is rejected).
//
//   npx tsx scripts/test-telnyx-inbound.ts

import { generateKeyPairSync, sign as edSign, KeyObject } from "crypto";
import { parseTelnyxInbound, verifyTelnyxSignature } from "../src/lib/telnyx";

function rawPublicKeyB64(pub: KeyObject): string {
  // DER SPKI for Ed25519 = 12-byte header + 32-byte raw key. Telnyx hands
  // out the raw 32 bytes, base64 — strip the header to match.
  const der = pub.export({ format: "der", type: "spki" }) as Buffer;
  return der.subarray(der.length - 32).toString("base64");
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pubB64 = rawPublicKeyB64(publicKey);

const webhook = {
  data: {
    event_type: "message.received",
    payload: {
      id: "msg_test_12345",
      direction: "inbound",
      from: { phone_number: "+12105550142" },
      to: [{ phone_number: "+12105559999" }],
      text: "Hey can we swap the master bath tile to the matte white?",
      media: [
        { url: "https://media.telnyx.com/x.jpg", content_type: "image/jpeg" },
      ],
      received_at: "2026-08-03T15:04:05Z",
    },
  },
};
const body = JSON.stringify(webhook);
const ts = "1754233445";
const sig = edSign(null, Buffer.from(`${ts}|${body}`, "utf8"), privateKey).toString("base64");

console.log("Signature verification:");
check("valid signature accepted", verifyTelnyxSignature(body, sig, ts, pubB64));
check("tampered body rejected", !verifyTelnyxSignature(body + " ", sig, ts, pubB64));
check("wrong timestamp rejected", !verifyTelnyxSignature(body, sig, "1754233446", pubB64));
check("empty signature rejected", !verifyTelnyxSignature(body, "", ts, pubB64));

console.log("\nInbound parse:");
const norm = parseTelnyxInbound(body);
check("parsed non-null", norm !== null);
check("from normalized-ready", norm?.from === "+12105550142");
check("to (org line) captured", norm?.to === "+12105559999");
check("body captured", norm?.body.startsWith("Hey can we swap"));
check("provider id captured", norm?.providerId === "msg_test_12345");
check("media captured", norm?.media.length === 1 && norm.media[0].contentType === "image/jpeg");

console.log("\nNon-message events ignored:");
check(
  "delivery receipt → null",
  parseTelnyxInbound(
    JSON.stringify({ data: { event_type: "message.finalized", payload: {} } }),
  ) === null,
);
check("garbage → null", parseTelnyxInbound("not json") === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
