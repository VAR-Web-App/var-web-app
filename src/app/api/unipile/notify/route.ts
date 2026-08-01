// POST /api/unipile/notify — Unipile's account-connection webhook. Fired
// when a builder finishes the hosted-auth flow. Payload:
//   { status: "CREATION_SUCCESS" | "RECONNECTED", account_id, name }
// where `name` is the org_ref we passed when minting the link. We enrich
// with provider + email and store the binding in `email_accounts` so the
// app can show "Gmail connected" and the email-sync layer knows which
// account belongs to which org. Secured by the shared ?key= secret.

import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebase-admin";
import { getAccount, emailFromAccount } from "@/lib/unipile";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.INBOUND_PARSE_SECRET;
  if (secret && req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let body: { status?: string; account_id?: string; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const accountId = body.account_id;
  const orgRef = body.name;
  // Ack 200 on missing fields so Unipile doesn't retry a payload we can't use.
  if (!accountId || !orgRef) {
    return NextResponse.json({ ok: true, ignored: "missing_fields" });
  }

  const acct = await getAccount(accountId);
  const provider = typeof acct?.type === "string" ? acct.type : null;
  const email = emailFromAccount(acct);

  await adminDb()
    .collection("email_accounts")
    .doc(accountId)
    .set(
      {
        account_id: accountId,
        org_ref: orgRef,
        provider,
        email,
        status: body.status ?? "CREATION_SUCCESS",
        connected_at: new Date().toISOString(),
      },
      { merge: true },
    );

  return NextResponse.json({ ok: true, org: orgRef, account: accountId });
}
