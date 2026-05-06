import { redirect } from "next/navigation";

import { getMe } from "@/lib/api";
import type { Profile } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "@/features/settings/components/ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  let profile: Profile;
  try {
    profile = await getMe(session.access_token);
  } catch {
    profile = {
      id: session.user.id,
      username: session.user.email ?? null,
      display_name: null,
      avatar_url: null,
      bio: null,
    };
  }

  return <ProfileForm initialProfile={profile} />;
}
