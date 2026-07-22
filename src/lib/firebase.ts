// Firebase client initialization. Single instance — Next.js fast-refresh
// can re-evaluate this file, so we guard against double-init via getApps().
//
// Skipping Analytics intentionally; we don't need it for this stage and
// it pulls in extra bundle weight.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

// Guard the whole init on config presence. During a keyless build (CI or a
// local `next build` without a pulled .env.local), this client module still
// evaluates on the server while prerendering static pages like /_not-found —
// and getAuth() throws `auth/invalid-api-key` on empty config, crashing the
// build. These client instances are only ever used in the browser (where
// NEXT_PUBLIC_* config is always present), so when config is absent we leave
// the exports undefined rather than initializing. Prod (Vercel, config set)
// is unaffected — the branch below runs exactly as before.
let app = undefined as unknown as FirebaseApp;
let db = undefined as unknown as Firestore;
let auth = undefined as unknown as Auth;
let storage = undefined as unknown as FirebaseStorage;

if (firebaseConfig.apiKey) {
  const existing = getApps();
  // If the app already exists, getFirestore was probably already called too
  // (Next.js fast-refresh path). Skip the initializeFirestore() call —
  // calling it twice throws.
  const firestoreInitialized = existing.length > 0;
  app = firestoreInitialized ? existing[0] : initializeApp(firebaseConfig);

  // ignoreUndefinedProperties: true makes setDoc/updateDoc silently drop any
  // fields whose value is undefined, instead of throwing 'Unsupported field
  // value: undefined'. We have several optional fields on Deal/Account that
  // are typed as `T | undefined`, and without this flag every create would
  // fail unless callers explicitly stripped undefined keys.
  //
  // localCache: persistentLocalCache enables IndexedDB-backed offline
  // persistence. Recent reads stay in cache; writes queue locally and
  // replay when network returns. persistentMultipleTabManager keeps
  // the cache coherent across multiple browser tabs of the same app.
  // Defaults to 100 MB cache — plenty for one builder's project history.
  db = firestoreInitialized
    ? getFirestore(app)
    : initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });

  auth = getAuth(app);
  storage = getStorage(app);
}

export { app, db, auth, storage };
