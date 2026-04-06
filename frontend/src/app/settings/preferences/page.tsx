import PreferencesForm from "@/features/settings/components/PreferencesForm";

export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ user_id?: string }>;
}) {
  const { user_id } = await searchParams;

  if (!user_id) {
    return (
      <main className="p-8">
        <p className="text-sm text-muted-foreground">
          No user ID provided. Add <code>?user_id=&lt;your-uuid&gt;</code> to the URL.
        </p>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Travel Preferences</h1>
        <p className="text-sm text-muted-foreground mt-1">
          These preferences help the AI suggest places you&apos;ll actually enjoy.
        </p>
      </div>
      <PreferencesForm userId={user_id} />
    </main>
  );
}
