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
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6 md:p-10">
      <div className="space-y-1.5">
        <h1 className="text-display-xl">Travel preferences</h1>
        <p className="text-sm text-ink-subtle">
          These tune what the AI suggests. Fewer generic museum stops, more things you actually like.
        </p>
      </div>
      <PreferencesForm />
    </div>
  );
}
