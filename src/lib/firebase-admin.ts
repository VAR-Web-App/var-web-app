// Firebase Admin SDK — server-side Firestore access without user auth.
//
// Used by background jobs (Vercel Crons, webhooks) where there's no
// signed-in user but we still need to read/write Firestore. The client
// SDK in src/lib/firebase.ts requires auth context; this admin client
// bypasses it via a service account.
//
// Init is lazy + idempotent — calling adminDb() multiple times in the
// same serverless instance reuses the existing app. If
// FIREBASE_SERVICE_ACCOUNT_KEY isn't set, this throws on first use so
// callers can decide whether to no-op gracefully.
//
// Set up:
//   1. Firebase Console → Project Settings → Service Accounts →
//      Generate new private key (downloads a JSON)
//   2. Paste the entire JSON into Vercel env vars as
//      FIREBASE_SERVICE_ACCOUNT_KEY (Production + Preview)
//   3. Redeploy

import {
  initializeApp,
  getApps,
  cert,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

let _app: App | null = null;

function getAdminApp(): App {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0];
    return _app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY env var is not set — admin SDK can't initialize.",
    );
  }
  let credentials: ServiceAccount;
  try {
    credentials = JSON.parse(raw) as ServiceAccount;
  } catch (e) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  _app = initializeApp({ credential: cert(credentials) });
  return _app;
}

/** Lazy Firestore handle for server-side reads/writes. Throws if the
 *  service-account env var isn't set; callers can catch and degrade. */
export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

/** Lazy Storage handle. Uses the default bucket from the service
 *  account project (matches FIREBASE_STORAGE_BUCKET if set, otherwise
 *  the project's `{projectId}.appspot.com`). */
export function adminStorage(): Storage {
  return getStorage(getAdminApp());
}

/** The default bucket name. Set FIREBASE_STORAGE_BUCKET in Vercel if
 *  your project uses a non-default bucket name; otherwise the SDK
 *  derives it from the service account's project_id. */
export function adminBucketName(): string {
  const explicit = process.env.FIREBASE_STORAGE_BUCKET;
  if (explicit) return explicit;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (raw) {
      const parsed = JSON.parse(raw) as { project_id?: string };
      if (parsed.project_id) return `${parsed.project_id}.appspot.com`;
    }
  } catch {
    // fall through
  }
  throw new Error(
    "Could not determine Storage bucket — set FIREBASE_STORAGE_BUCKET",
  );
}

/** Best-effort check used by gated routes to decide whether to do real
 *  work or return a "not configured" response. */
export function adminConfigured(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
}
