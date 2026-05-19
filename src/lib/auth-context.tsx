"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

// Profile is the per-user record we keep in Firestore at users/{uid}.
// Stores the user's org membership + display info. Auth identity (email,
// password, password resets) stays in Firebase Auth — we never touch it.
export interface UserProfile {
  uid: string;
  email: string;
  display_name?: string;
  org_ref: string;
  role: "owner" | "member";
  created_at?: string;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  /** Throws on failure (caller catches and renders the message). */
  signIn: (email: string, password: string) => Promise<void>;
  /** Creates Auth user + Firestore org doc + user profile. Throws on failure. */
  signUp: (
    email: string,
    password: string,
    companyName: string,
  ) => Promise<void>;
  /** Google OAuth sign-in. Creates org + profile on first sign-in.
   *  Throws on failure (caller catches). */
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Pull the matching profile doc. If somehow missing (e.g. a partial
        // signup), the calling page should redirect to a "complete signup"
        // flow — for now we just leave profile null and surface "loading".
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          if (snap.exists()) {
            setProfile(snap.data() as UserProfile);
          } else {
            setProfile(null);
          }
        } catch (e) {
          console.error("Failed to load user profile:", e);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signUp(email: string, password: string, companyName: string) {
    // Create the auth user first — this throws on duplicate email or weak
    // password before we touch Firestore, so we don't end up with an org
    // record without a backing user. Note: createUserWithEmailAndPassword
    // immediately fires onAuthStateChanged with the new user. Our listener
    // tries to read users/{uid}, which doesn't exist yet — it sets profile
    // to null. We compensate by setting the profile state explicitly after
    // the docs are written below, so callers see a populated profile by
    // the time signUp resolves.
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    // Use the new uid as the org id for personal/single-user orgs. When we
    // add team invites later, additional members get added via the existing
    // org's id, not by minting new ones.
    const orgRef = uid;
    await setDoc(doc(db, "orgs", orgRef), {
      id: orgRef,
      name: companyName,
      owner_uid: uid,
      created_at: serverTimestamp(),
    });
    const profileDoc: UserProfile = {
      uid,
      email,
      display_name: companyName,
      org_ref: orgRef,
      role: "owner",
    };
    await setDoc(doc(db, "users", uid), {
      ...profileDoc,
      created_at: serverTimestamp(),
    });
    // Set profile state synchronously so pages don't get stuck on Loading…
    // waiting for the listener to re-fetch.
    setProfile(profileDoc);
  }

  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const uid = cred.user.uid;
    // First-time Google sign-in: bootstrap the org + profile so the user
    // doesn't land on a broken /deals waiting for a profile that never
    // appears. Subsequent sign-ins skip this since the docs already exist.
    const profileSnap = await getDoc(doc(db, "users", uid));
    if (!profileSnap.exists()) {
      const orgRef = uid;
      const displayName = cred.user.displayName || cred.user.email || "My Company";
      await setDoc(doc(db, "orgs", orgRef), {
        id: orgRef,
        name: displayName,
        owner_uid: uid,
        created_at: serverTimestamp(),
      });
      const profileDoc: UserProfile = {
        uid,
        email: cred.user.email || "",
        display_name: displayName,
        org_ref: orgRef,
        role: "owner",
      };
      await setDoc(doc(db, "users", uid), {
        ...profileDoc,
        created_at: serverTimestamp(),
      });
      setProfile(profileDoc);
    }
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
