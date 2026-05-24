"use client";

import { use } from "react";
import FloorPlanExtractor from "@/components/floor-plan-extractor";
import FilesPanel from "@/components/files-panel";
import DealPageShell, {
  DealLoadingShell,
  DealNotFoundShell,
} from "@/components/deal-page-shell";
import { useDeal } from "@/lib/use-deal";

export default function DealFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { deal, loaded } = useDeal(id);
  if (!loaded) return <DealLoadingShell />;
  if (!deal) return <DealNotFoundShell />;
  return (
    <DealPageShell deal={deal} active="files">
      <div className="space-y-6">
        <FloorPlanExtractor
          dealId={deal.id}
          orgRef={deal.org_ref}
          initialExtraction={
            deal.floor_plan_extraction as unknown as
              | import("@/components/floor-plan-extractor").FloorPlanExtraction
              | undefined
          }
          initialResolvedFlags={deal.resolved_ambiguity_indices}
        />
        <FilesPanel deal={deal} />
      </div>
    </DealPageShell>
  );
}
