import { apiFetch } from "./client";

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
  location: string | null;
}

export interface PlaceSuggestion {
  slug: string;
  name: string;
  destination: string;
  item_type: string;
  description: string | null;
  location: string | null;
  image_url: string | null;
}

export interface AiSuggestion {
  name: string;
  item_type: string;
  one_line: string | null;
  price_hint: string | null;
  slug: string;
  cached: boolean;
  destination_city: string | null;
  enriched?: EnrichedItem | null;
}

export interface AiSuggestionsResult {
  suggestions: AiSuggestion[];
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

export const enrichBatch = (
  items: Array<{ name: string; destination: string; item_type: string }>,
  signal?: AbortSignal,
): Promise<EnrichedItem[]> =>
  apiFetch<EnrichedItem[]>("/ai/enrich-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
    signal,
  });

export const autocompletePlaces = (
  q: string,
  destination: string,
  item_type: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> => {
  const params = new URLSearchParams({ q, destination, item_type });
  return apiFetch<PlaceSuggestion[]>(`/places/autocomplete?${params.toString()}`, { signal });
};

export const getSuggestions = (
  planId: string,
  userId: string,
  forceRefresh = false,
  excludeNames?: string[],
  signal?: AbortSignal,
): Promise<AiSuggestionsResult> =>
  apiFetch<AiSuggestionsResult>("/ai/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_id: planId,
      user_id: userId,
      force_refresh: forceRefresh,
      ...(excludeNames?.length ? { exclude_names: excludeNames } : {}),
    }),
    signal,
  });

export const getNextSuggestion = (
  planId: string,
  userId: string,
  excludeNames: string[],
  signal?: AbortSignal,
): Promise<AiSuggestion> =>
  apiFetch<AiSuggestion>("/ai/suggestions/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_id: planId, user_id: userId, exclude_names: excludeNames }),
    signal,
  });
