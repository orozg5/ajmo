const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

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

export const createPlan = (data: CreatePlanPayload): Promise<Plan> =>
  apiFetch<Plan>("/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const getPlan = (id: string): Promise<Plan> =>
  apiFetch<Plan>(`/plans/${id}`);

export interface EnrichedItem {
  description: string | null;
  opening_hours: string | null;
  price_range: string | null;
  tips: string[] | null;
  cuisine: string | null;
  reservation_tips: string | null;
  amenities: string[] | null;
  check_in_time: string | null;
  booking_tips: string | null;
  schedule: string | null;
  duration: string | null;
}

export const enrichItem = (
  name: string,
  destination: string,
  item_type: string,
  signal?: AbortSignal,
): Promise<EnrichedItem> =>
  apiFetch<EnrichedItem>("/ai/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, destination, item_type }),
    signal,
  });

export interface PlaceSuggestion {
  slug: string;
  name: string;
  destination: string;
  item_type: string;
  description: string | null;
  location: string | null;
  image_url: string | null;
}

export const autocompletePlaces = (
  q: string,
  destination: string,
  item_type: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> => {
  const params = new URLSearchParams({ q, destination, item_type });
  return apiFetch<PlaceSuggestion[]>(`/places/autocomplete?${params.toString()}`, { signal });
};
