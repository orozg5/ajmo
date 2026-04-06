import { apiFetch } from "./client";
import type { AiSuggestion } from "./ai";

export interface Plan {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  destination: string | null;
  date_from: string | null;
  date_to: string | null;
  is_public: boolean;
  cover_image_url: string | null;
  yjs_state: null;
  created_at: string;
  suggestions: AiSuggestion[] | null;
}

export interface CreatePlanPayload {
  owner_id: string;
  title: string;
  destination?: string;
  description?: string;
  date_from?: string;
  date_to?: string;
  is_public?: boolean;
}

export interface PlanItem {
  id: string;
  plan_id: string;
  day_id: string;
  item_type: string;
  title: string;
  notes: string | null;
  location: string | null;
  start_time: string | null;
  estimated_cost: number | null;
  sort_order: number | null;
  ai_data: Record<string, unknown> | null;
}

export interface PlanDay {
  id: string;
  plan_id: string;
  day_number: number;
  date: string | null;
  title: string | null;
  items: PlanItem[];
}

export interface AddItemPayload {
  item_type: string;
  title: string;
  notes?: string;
  location?: string;
  start_time?: string;
  estimated_cost?: number;
  sort_order?: number;
  ai_data?: Record<string, unknown>;
}

export const createPlan = (data: CreatePlanPayload): Promise<Plan> =>
  apiFetch<Plan>("/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const getPlan = (id: string): Promise<Plan> => apiFetch<Plan>(`/plans/${id}`);

export const initializeDays = (planId: string): Promise<PlanDay[]> =>
  apiFetch<PlanDay[]>(`/plans/${planId}/days/initialize`, { method: "POST" });

export const getDays = (planId: string): Promise<PlanDay[]> => apiFetch<PlanDay[]>(`/plans/${planId}/days`);

export const addDay = (planId: string, dayNumber?: number, date?: string): Promise<PlanDay> =>
  apiFetch<PlanDay>(`/plans/${planId}/days`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day_number: dayNumber ?? null, date: date ?? null }),
  });

export const removeDay = (planId: string, dayId: string): Promise<void> =>
  apiFetch<void>(`/plans/${planId}/days/${dayId}`, { method: "DELETE" });

export const addItem = (planId: string, dayId: string, payload: AddItemPayload): Promise<PlanItem> =>
  apiFetch<PlanItem>(`/plans/${planId}/days/${dayId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const removeItem = (planId: string, itemId: string): Promise<void> =>
  apiFetch<void>(`/plans/${planId}/items/${itemId}`, { method: "DELETE" });

export const updateItemNotes = (planId: string, itemId: string, notes: string | null): Promise<PlanItem> =>
  apiFetch<PlanItem>(`/plans/${planId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
