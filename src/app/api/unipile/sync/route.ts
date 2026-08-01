// POST /api/unipile/sync — backfill. Pulls the caller org's recent mail from
// each connected account and files the matches onto deals. Lets the builder
// (and us, for testing) sync existing mail without waiting for the webhook.
// Auth: caller's Firebase ID token → uid = org_ref.

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminConfigured, adminDb } from "@/lib/firebase-admin";
import { unipileConfigured, listEmails } from "@/lib/unipile";
import { fileUnipileEmail } from "@/lib/unipile-sync";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!unipileConfigured() || !adminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let orgRef: string;
  try {
    orgRef = (await adminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = adminDb();
  const accountsSnap = await db
    .collection("email_accounts")
    .where("org_ref", "==", orgRef)
    .get();

  let scanned = 0;
  let filed = 0;
  for (const acc of accountsSnap.docs) {
    const accountId = acc.data().account_id as string;
    const emails = await listEmails(accountId, 30);
    scanned += emails.length;
    for (const email of emails) {
      const dealRef = await fileUnipileEmail(db, orgRef, email);
      if (dealRef) filed += 1;
    }
  }

  return NextResponse.json({ ok: true, accounts: accountsSnap.size, scanned, filed });
}
