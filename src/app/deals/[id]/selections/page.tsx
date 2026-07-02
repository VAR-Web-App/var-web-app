"use client";

import { use } from "react";
import SelectionsPanel from "@/components/selections-panel";
import ChangeOrdersPanel from "@/components/change-orders-panel";
import DealPageShell, {
  DealLoadingShell,
  DealNotFoundShell,
} from "@/components/deal-page-shell";
import { useDeal } from "@/lib/use-deal";

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
        <SelectionsPanel deal={deal} />
        <ChangeOrdersPanel deal={deal} />
      </div>
    </DealPageShell>
  );
}
