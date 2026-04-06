import { apiFetch } from "./client";

export interface UserPreferences {
  user_id: string;
  interest_tags: string[] | null;
  dietary: string[] | null;
  budget: string | null;
  custom_notes: string | null;
}

export const getPreferences = (userId: string): Promise<UserPreferences> =>
  apiFetch<UserPreferences>(`/users/me/preferences?${new URLSearchParams({ user_id: userId }).toString()}`);

export const upsertPreferences = (data: UserPreferences): Promise<UserPreferences> =>
  apiFetch<UserPreferences>("/users/me/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
