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
    // record without a backing user.
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
    await setDoc(doc(db, "users", uid), {
      uid,
      email,
      display_name: companyName,
      org_ref: orgRef,
      role: "owner",
      created_at: serverTimestamp(),
    });
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
