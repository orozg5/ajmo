import { apiFetch } from "./client";
import type { AiSuggestion, CrossCityMarker, EnrichedItem, SameDayMarker } from "./ai";

export type PlanVisibility = "private" | "link" | "friends" | "public";

export interface DestinationSummary {
  id: string;
  city: string;
  country: string;
  sort_order: number;
}

export interface Plan {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  date_from: string | null;
  date_to: string | null;
  visibility: PlanVisibility;
  cover_image_path: string | null;
  cover_image_url: string | null;
  yjs_state: null;
  created_at: string;
  suggestions: AiSuggestion[] | null;
  destinations: DestinationSummary[] | null;
}

export interface CreatePlanPayload {
  title: string;
  description?: string;
  date_from?: string;
  date_to?: string;
  visibility?: PlanVisibility;
  cover_image_path?: string;
  cover_image_url?: string;
}

export interface UpdatePlanPayload {
  title?: string;
  description?: string;
  date_from?: string;
  date_to?: string;
  visibility?: PlanVisibility;
  cover_image_path?: string;
  cover_image_url?: string;
}

export type PlanScope = "owner" | "member" | "public";

export interface PlanItem {
  id: string;
  plan_id: string;
  day_id: string;
  item_type: string;
  title: string;
  notes: string | null;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  sort_key: string | null;
  sort_order: number | null;
  ai_data: EnrichedItem | CrossCityMarker | SameDayMarker | null;
  destination_id: string | null;
}

export interface PlanDay {
  id: string;
  plan_id: string;
  day_number: number;
  date: string | null;
  title: string | null;
  notes: string | null;
  items: PlanItem[];
}

export interface AddItemPayload {
  item_type: string;
  title: string;
  notes?: string;
  location?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  sort_key?: string;
  sort_order?: number;
  ai_data?: EnrichedItem | CrossCityMarker | SameDayMarker | null;
  destination_id?: string;
}

export interface ReorderEntry {
  id: string;
  sort_key: string;
  day_id: string;
  destination_id?: string | null;
}

export interface PlanHotel {
  id: string;
  plan_id: string;
  place_id: string | null;
  destination_id: string | null;
  check_in_day_number: number;
  check_out_day_number: number;
  check_in_time: string | null;
  check_out_time: string | null;
  notes: string | null;
  sort_key: string | null;
  created_at: string | null;
  place_name: string | null;
  place_image_url: string | null;
  place_description: string | null;
  place_location: string | null;
  place_check_in_time: string | null;
  place_price_range: string | null;
  place_lat: number | null;
  place_lng: number | null;
}

export interface CreateHotelPayload {
  place_id?: string | null;
  destination_id?: string | null;
  check_in_day_number: number;
  check_out_day_number: number;
  check_in_time?: string | null;
  check_out_time?: string | null;
  notes?: string | null;
  sort_key?: string | null;
}

export type UpdateHotelPayload = Partial<CreateHotelPayload>;

export interface DestinationResponse {
  id: string;
  plan_id: string;
  country: string;
  city: string;
  sort_order: number;
  days: number[];
  created_at: string;
}

export interface CreateDestinationPayload {
  country: string;
  city: string;
  sort_order: number;
  day_numbers: number[];
}

export const createPlan = (data: CreatePlanPayload): Promise<Plan> =>
  apiFetch<Plan>("/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const updatePlan = (id: string, data: UpdatePlanPayload): Promise<Plan> =>
  apiFetch<Plan>(`/plans/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const getPlan = (id: string, accessToken?: string | null): Promise<Plan> =>
  apiFetch<Plan>(`/plans/${id}`, undefined, accessToken);

export const listPlans = (
  scope: PlanScope = "owner",
  accessToken?: string | null,
): Promise<Plan[]> => {
  const params = new URLSearchParams({ scope });
  return apiFetch<Plan[]>(`/plans?${params.toString()}`, undefined, accessToken);
};

export const initializeDays = (planId: string, accessToken?: string | null): Promise<PlanDay[]> =>
  apiFetch<PlanDay[]>(`/plans/${planId}/days/initialize`, { method: "POST" }, accessToken);

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

export const reorderItems = (planId: string, entries: ReorderEntry[]): Promise<PlanItem[]> =>
  apiFetch<PlanItem[]>(`/plans/${planId}/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: entries }),
  });

export const updateDay = (
  planId: string,
  dayId: string,
  patch: { title?: string | null; notes?: string | null },
): Promise<PlanDay> =>
  apiFetch<PlanDay>(`/plans/${planId}/days/${dayId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

export const listHotels = (planId: string): Promise<PlanHotel[]> =>
  apiFetch<PlanHotel[]>(`/plans/${planId}/hotels`);

export const createHotel = (planId: string, payload: CreateHotelPayload): Promise<PlanHotel> =>
  apiFetch<PlanHotel>(`/plans/${planId}/hotels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const updateHotel = (planId: string, hotelId: string, payload: UpdateHotelPayload): Promise<PlanHotel> =>
  apiFetch<PlanHotel>(`/plans/${planId}/hotels/${hotelId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const deleteHotel = (planId: string, hotelId: string): Promise<void> =>
  apiFetch<void>(`/plans/${planId}/hotels/${hotelId}`, { method: "DELETE" });

export const getDestinations = (planId: string, accessToken?: string | null): Promise<DestinationResponse[]> =>
  apiFetch<DestinationResponse[]>(`/plans/${planId}/destinations`, undefined, accessToken);

export const createDestination = (
  planId: string,
  payload: CreateDestinationPayload,
): Promise<DestinationResponse> =>
  apiFetch<DestinationResponse>(`/plans/${planId}/destinations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
