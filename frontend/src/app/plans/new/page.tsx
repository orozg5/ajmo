import CreatePlanForm from "@/features/plans/components/CreatePlanForm";

export default function NewPlanPage() {
  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-semibold">New Plan</h1>
      <CreatePlanForm />
    </main>
  );
}
