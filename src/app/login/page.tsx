"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-base font-bold text-white">
            B
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Builder</h1>
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
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Just looking?{" "}
          <Link href="/demo" className="font-medium text-sky-700 hover:underline">
            Browse the demo (no account needed)
          </Link>
        </p>
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
