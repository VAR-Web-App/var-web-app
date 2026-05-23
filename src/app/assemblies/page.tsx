"use client";

import AssemblyForm from "@/components/assembly-form";

export default function AssembliesPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Assembly sandbox</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a parametric assembly, set its properties, and see the
          quantified materials breakdown. Stub data — live cost lookups
          via 1build come once the API key is set up.
        </p>
      </header>

      <AssemblyForm />

      <p className="mt-4 text-xs text-slate-400">
        Stub catalog · placeholder prices, not live · 1build API integration
        comes when the API key is in place.
      </p>
    </div>
  );
}
