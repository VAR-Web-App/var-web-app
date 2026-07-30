"use client";

// A small "what is this page?" affordance for page headers. Pairs with the
// sidebar nav tooltips so a first-time builder can orient anywhere. Hover or
// focus the info icon for a one-line explanation.

import { InformationCircleIcon } from "@heroicons/react/24/outline";
import Tooltip from "@/components/tooltip";

export default function HeaderHint({ label }: { label: string }) {
  return (
    <Tooltip label={label} placement="bottom" variant="info">
      <button
        type="button"
        aria-label="About this page"
        className="text-slate-400 transition-colors hover:text-slate-600"
      >
        <InformationCircleIcon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}
