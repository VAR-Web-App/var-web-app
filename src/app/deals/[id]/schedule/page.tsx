"use client";

import { use } from "react";
import ProjectExecutionPanel from "@/components/project-execution-panel";
import PhotoGallery from "@/components/photo-gallery";
import DealPageShell, {
  DealLoadingShell,
  DealNotFoundShell,
} from "@/components/deal-page-shell";
import { useDeal } from "@/lib/use-deal";

export default function DealSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { deal, loaded } = useDeal(id);
  if (!loaded) return <DealLoadingShell />;
  if (!deal) return <DealNotFoundShell />;
  return (
    <DealPageShell deal={deal} active="schedule">
      <div className="space-y-6">
        <ProjectExecutionPanel deal={deal} />
        <PhotoGallery dealId={deal.id} orgRef={deal.org_ref} />
      </div>
    </DealPageShell>
  );
}
