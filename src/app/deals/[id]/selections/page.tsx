"use client";

import { use } from "react";
import SelectionsPanel from "@/components/selections-panel";
import ChangeOrdersPanel from "@/components/change-orders-panel";
import DealPageShell, {
  DealLoadingShell,
  DealNotFoundShell,
} from "@/components/deal-page-shell";
import { useDeal } from "@/lib/use-deal";
import PageGuide from "@/components/page-guide";

export default function DealSelectionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { deal, loaded } = useDeal(id);

  if (!loaded) return <DealLoadingShell />;
  if (!deal) return <DealNotFoundShell />;

  return (
    <DealPageShell deal={deal} active="selections">
      <div className="space-y-6">
        <PageGuide
          id="deal-selections"
          title="Selections"
          what="The client's finish choices — flooring, countertops, fixtures — and the change orders they drive."
          steps={[
            "Add a selection with options + an allowance; the client picks and signs in their portal.",
            "A pick over the allowance auto-creates a change order, so the budget stays honest.",
            "Change orders on this project show below, tied back to the selection that caused them.",
          ]}
        />
        <SelectionsPanel deal={deal} />
        <ChangeOrdersPanel deal={deal} />
      </div>
    </DealPageShell>
  );
}
