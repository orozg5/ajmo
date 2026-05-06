import { redirect } from "next/navigation";

import SettingsTabs from "@/features/settings/components/SettingsTabs";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-6 md:p-10">
      <header className="space-y-4">
        <div className="space-y-1.5">
          <h1 className="text-display-xl">Settings</h1>
          <p className="text-sm text-ink-subtle">
            Tune your profile and how the AI tailors travel suggestions for you.
          </p>
        </div>
        <SettingsTabs />
      </header>
      {children}
    </div>
  );
}
