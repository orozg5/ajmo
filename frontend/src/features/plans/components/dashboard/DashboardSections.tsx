"use client";

import { type Plan } from "@/lib/api";
import HomeHero from "@/features/plans/components/dashboard/HomeHero";
import TripsExplorer from "@/features/plans/components/dashboard/TripsExplorer";

type DashboardSectionsProps = {
  greetingName: string | null;
  initialOwnerPlans?: Plan[];
  initialMemberPlans?: Plan[];
  initialPublicPlans?: Plan[];
};

export default function DashboardSections({
  greetingName,
  initialOwnerPlans,
  initialMemberPlans,
  initialPublicPlans,
}: DashboardSectionsProps) {
  return (
    <div className="mx-auto w-full space-y-8 px-[clamp(1rem,4vw,3rem)] py-8 md:py-10">
      <HomeHero greetingName={greetingName} ownerPlans={initialOwnerPlans ?? []} />
      <TripsExplorer
        initialOwnerPlans={initialOwnerPlans}
        initialMemberPlans={initialMemberPlans}
        initialPublicPlans={initialPublicPlans}
      />
    </div>
  );
}
