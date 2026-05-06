import { redirect } from "next/navigation";

import { getPreferences } from "@/lib/api";
import type { UserPreferences } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import PreferencesForm from "@/features/settings/components/PreferencesForm";

const EMPTY_PREFERENCES: UserPreferences = {
  user_id: "",
  interest_tags: null,
  dietary: null,
  budget: null,
  custom_notes: null,
};

export default async function PreferencesPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  let preferences: UserPreferences;
  try {
    preferences = await getPreferences(session.access_token);
  } catch {
    preferences = { ...EMPTY_PREFERENCES, user_id: session.user.id };
  }

  return <PreferencesForm initialPreferences={preferences} />;
}
