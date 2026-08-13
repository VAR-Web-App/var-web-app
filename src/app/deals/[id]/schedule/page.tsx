"use client";

import { use } from "react";
import ProjectExecutionPanel from "@/components/project-execution-panel";
import PhotoGallery from "@/components/photo-gallery";
import DealPageShell, {
  DealLoadingShell,
  DealNotFoundShell,
} from "@/components/deal-page-shell";
import { useDeal } from "@/lib/use-deal";
import PageGuide from "@/components/page-guide";

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
        <PageGuide
          id="deal-schedule"
          title="Schedule"
          what="This project's phases and photo timeline — the build's progress in one place."
          steps={[
            "Mark a phase complete to trigger its draw; the client approves it in their portal.",
            "Assign subs to phases here; they get a text + a login-free schedule link.",
            "Progress photos upload to the timeline so the client and lender can follow along.",
          ]}
        />
        <ProjectExecutionPanel deal={deal} />
        <PhotoGallery dealId={deal.id} orgRef={deal.org_ref} />
      </div>
    </DealPageShell>
  );
}
