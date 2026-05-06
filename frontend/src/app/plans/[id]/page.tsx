import { getPlan, initializeDays, getDestinations, getMyPlanRole } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import PlanWorkspace from "@/features/plans/components/itinerary/PlanWorkspace";
import type { PlanRole } from "@/lib/api";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  const token = session?.access_token ?? null;

  const [plan, days, destinations] = await Promise.all([
    getPlan(id, token),
    initializeDays(id, token),
    getDestinations(id, token),
  ]);

  const isOwner = user?.id === plan.owner_id;
  // Owners are inferred from the plan record; for everyone else hit the role
  // endpoint, which consults plan_members and falls back to public visibility.
  let role: PlanRole = "viewer";
  if (isOwner) {
    role = "owner";
  } else {
    try {
      role = (await getMyPlanRole(id, token)).role;
    } catch {
      role = "viewer";
    }
  }

  return (
    <div className="space-y-6 py-4 md:py-6">
      <PlanWorkspace
        plan={plan}
        initialDays={days}
        destinations={destinations}
        isOwner={isOwner}
        role={role}
      />
    </div>
  );
}
