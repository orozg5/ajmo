import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProfileChrome {
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export async function getProfileChrome(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileChrome> {
  const { data } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  return {
    username: (data?.username as string | null | undefined) ?? null,
    displayName: (data?.display_name as string | null | undefined) ?? null,
    avatarUrl: (data?.avatar_url as string | null | undefined) ?? null,
  };
}
