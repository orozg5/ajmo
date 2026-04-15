import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import PreferencesForm from "@/features/settings/components/PreferencesForm";

export default async function PreferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="p-8 max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Travel Preferences</h1>
        <p className="text-sm text-muted-foreground mt-1">
          These preferences help the AI suggest places you&apos;ll actually enjoy.
        </p>
      </div>
      <PreferencesForm />
    </main>
  );
}
