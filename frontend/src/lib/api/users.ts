import { apiFetch } from "./client";

export interface UserPreferences {
  user_id: string;
  interest_tags: string[] | null;
  dietary: string[] | null;
  budget: string | null;
  custom_notes: string | null;
}

export type UserPreferencesUpdate = Omit<UserPreferences, "user_id">;

export const getPreferences = (): Promise<UserPreferences> =>
  apiFetch<UserPreferences>("/users/me/preferences");

export const upsertPreferences = (data: UserPreferencesUpdate): Promise<UserPreferences> =>
  apiFetch<UserPreferences>("/users/me/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
