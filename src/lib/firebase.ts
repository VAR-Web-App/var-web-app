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

let app: FirebaseApp;
let firestoreInitialized = false;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
  // If the app already exists, getFirestore was probably already called too
  // (Next.js fast-refresh path). Skip the initializeFirestore() call —
  // calling it twice throws.
  firestoreInitialized = true;
}

// ignoreUndefinedProperties: true makes setDoc/updateDoc silently drop any
// fields whose value is undefined, instead of throwing 'Unsupported field
// value: undefined'. We have several optional fields on Deal/Account that
// are typed as `T | undefined`, and without this flag every create would
// fail unless callers explicitly stripped undefined keys.
export const db: Firestore = firestoreInitialized
  ? getFirestore(app)
  : initializeFirestore(app, { ignoreUndefinedProperties: true });

export const auth: Auth = getAuth(app);
export const storage: FirebaseStorage = getStorage(app);
export { app };
