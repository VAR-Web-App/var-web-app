"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGoogleClick() {
    if (googleSubmitting) return;
    setError(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      router.replace("/deals");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Suppress "popup closed by user" noise — they didn't fail, they bailed.
      if (msg.includes("auth/popup-closed-by-user") || msg.includes("auth/cancelled-popup-request")) {
        return;
      }
      setError(
        msg.includes("auth/unauthorized-domain")
          ? "This site isn't authorized for Google sign-in yet. Use email + password, or contact your admin."
          : "Google sign-in failed. Try again or use email + password.",
      );
    } finally {
      setGoogleSubmitting(false);
    }
  }

  // If already signed in, bounce to the pipeline.
  useEffect(() => {
    if (!loading && user) router.replace("/deals");
  }, [user, loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        if (!companyName.trim()) {
          throw new Error("Company name is required");
        }
        await signUp(email, password, companyName.trim());
      }
      router.replace("/deals");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Firebase error codes are technical; lightly humanize the common ones.
      const friendly = msg
        .replace(/Firebase: Error \(auth\/(.*?)\)\.?/i, (_m, code) => {
          const codes: Record<string, string> = {
            "invalid-email": "That email doesn't look right.",
            "invalid-credential": "Email or password is incorrect.",
            "wrong-password": "Email or password is incorrect.",
            "user-not-found": "No account with that email yet — try signing up?",
            "email-already-in-use": "That email already has an account — try signing in?",
            "weak-password": "Password should be at least 6 characters.",
            "missing-password": "Password is required.",
          };
          return codes[code] ?? `Something went wrong (${code}).`;
        });
      setError(friendly);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <svg
            viewBox="0 0 64 64"
            className="mx-auto mb-3 h-10 w-10"
            aria-label="KeystonePro logo"
          >
            <circle cx="32" cy="32" r="32" fill="#0369a1" />
            <path
              d="M18 40 L32 24 L46 40"
              stroke="#ffffff"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">KeystonePro</h1>
          <p className="mt-1 text-sm text-slate-500">
            Custom home builder — project + estimate + draw management
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex rounded-lg bg-slate-100 p-1 text-sm">
            <button
              onClick={() => { setMode("signin"); setError(null); }}
              className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                mode === "signin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMode("signup"); setError(null); }}
              className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                mode === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <Field label="Company name" required>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Maddox Custom Homes"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  required
                  autoFocus
                />
              </Field>
            )}
            <Field label="Email" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                required
                autoFocus={mode === "signin"}
                autoComplete={mode === "signin" ? "email" : "new-email"}
              />
            </Field>
            <Field label="Password" required>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
              {mode === "signup" && (
                <p className="mt-1 text-[11px] text-slate-500">At least 6 characters.</p>
              )}
            </Field>

            {error && (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            or
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={onGoogleClick}
            disabled={googleSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {googleSubmitting ? "Working…" : "Continue with Google"}
          </button>
        </div>

      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
