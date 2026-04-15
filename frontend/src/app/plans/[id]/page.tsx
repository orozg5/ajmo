import { getPlan, initializeDays, getDestinations } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import ItineraryPlanner from "@/features/plans/components/ItineraryPlanner";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;

  const [plan, days, destinations] = await Promise.all([
    getPlan(id, token),
    initializeDays(id, token),
    getDestinations(id, token),
  ]);

  return (
    <main className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{plan.title}</h1>
        {plan.destination && <p className="text-muted-foreground">{plan.destination}</p>}
        {plan.date_from && (
          <p className="text-sm text-muted-foreground">
            {plan.date_from}{plan.date_to ? ` → ${plan.date_to}` : ""}
          </p>
        )}
        {plan.description && <p className="text-sm mt-1">{plan.description}</p>}
      </div>
      <ItineraryPlanner plan={plan} initialDays={days} destinations={destinations} />
    </main>
  );
}
