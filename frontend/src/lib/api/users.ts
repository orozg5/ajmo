import { apiFetch } from "./client";

export interface UserPreferences {
  user_id: string;
  interest_tags: string[] | null;
  dietary: string[] | null;
  budget: string | null;
  custom_notes: string | null;
}

export type UserPreferencesUpdate = Omit<UserPreferences, "user_id">;

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export interface ProfileUpdate {
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
}

export const getPreferences = (accessToken?: string | null): Promise<UserPreferences> =>
  apiFetch<UserPreferences>("/users/me/preferences", undefined, accessToken);

export const upsertPreferences = (data: UserPreferencesUpdate): Promise<UserPreferences> =>
  apiFetch<UserPreferences>("/users/me/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const getMe = (accessToken?: string | null): Promise<Profile> =>
  apiFetch<Profile>("/users/me", undefined, accessToken);

export const updateMe = (data: ProfileUpdate): Promise<Profile> =>
  apiFetch<Profile>("/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
