import { getPlan } from "@/lib/api";
import ItemSearch from "@/components/ItemSearch";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await getPlan(id);

  // destination is available here and passed as a prop to any future client components
  const destination = plan.destination;

  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-semibold">{plan.title}</h1>

      {destination && <p className="text-muted-foreground">{destination}</p>}

      {plan.date_from && (
        <p className="text-sm">
          {plan.date_from}
          {plan.date_to ? ` → ${plan.date_to}` : ""}
        </p>
      )}

      {plan.description && <p>{plan.description}</p>}

      {destination && <ItemSearch destination={destination} />}
    </main>
  );
}
