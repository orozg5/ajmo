import { getPlan, initializeDays } from "@/lib/api";
import ItineraryPlanner from "@/features/plans/components/ItineraryPlanner";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [plan, days] = await Promise.all([
    getPlan(id),
    initializeDays(id),
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
      <ItineraryPlanner plan={plan} initialDays={days} />
    </main>
  );
}
