import { getPlan, initializeDays, getDestinations } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import ItineraryPlanner from "@/features/plans/components/itinerary/ItineraryPlanner";
import PlanHeader from "@/features/plans/components/itinerary/PlanHeader";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [
    {
      data: { session },
    },
    {
      data: { user },
    },
  ] = await Promise.all([supabase.auth.getSession(), supabase.auth.getUser()]);
  const token = session?.access_token ?? null;

  const [plan, days, destinations] = await Promise.all([
    getPlan(id, token),
    initializeDays(id, token),
    getDestinations(id, token),
  ]);

  const isOwner = user?.id === plan.owner_id;

  return (
    <div className="space-y-6 py-4 md:py-6">
      <PlanHeader plan={plan} destinations={destinations} isOwner={isOwner} />
      <ItineraryPlanner plan={plan} initialDays={days} destinations={destinations} />
    </div>
  );
}
