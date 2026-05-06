import { apiFetch, apiSse } from "./client";

export interface EnrichedItem {
  place_id: string | null;
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
  image_url: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
  categories: string[] | null;
}

export interface CrossCityMarker {
  cross_city_pair: string;
}

export type SameDayTransportMode = "walk" | "bike" | "drive" | "transit";

export type CrossCityTransportMode = "drive" | "train" | "bus" | "ferry" | "flight";

export interface CrossCityTransportData {
  cross_city_pair: string;
  source_destination_id: string;
  destination_destination_id: string;
  mode: CrossCityTransportMode;
  duration_seconds: number | null;
  distance_meters: number | null;
  is_estimate: boolean;
  transit_summary: string | null;
}

export interface SameDayTransportData {
  same_day_pair: string;
  mode: SameDayTransportMode;
  distance_meters: number;
  duration_seconds: number;
  transit_summary?: string;
  geometry?: [number, number][];
}

export interface PlaceSuggestion {
  slug: string;
  name: string;
  destination: string;
  item_type: string;
  description: string | null;
  location: string | null;
  image_url: string | null;
  lat: number | null;
  lng: number | null;
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

export interface TransportOption {
  mode: CrossCityTransportMode;
  name: string;
  duration_seconds: number | null;
  distance_meters: number | null;
  is_estimate: boolean;
  transit_summary: string | null;
  geometry: [number, number][] | null;
}

export interface TransportSuggestion {
  source_item_id: string | null;
  source_item_title: string | null;
  source_item_location: string | null;
  source_destination_id: string | null;
  destination_item_id: string | null;
  destination_item_title: string | null;
  destination_item_location: string | null;
  destination_destination_id: string | null;
  scope: "cross_city" | null;
  source_day_number: number | null;
  destination_day_number: number | null;
  source_city: string | null;
  destination_city: string | null;
  source_country: string | null;
  destination_country: string | null;
  options: TransportOption[];
}

export interface TransportSuggestionsResult {
  suggestions: TransportSuggestion[];
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
  forceRefresh = false,
  excludeNames?: string[],
  signal?: AbortSignal,
): Promise<AiSuggestionsResult> =>
  apiFetch<AiSuggestionsResult>("/ai/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_id: planId,
      force_refresh: forceRefresh,
      ...(excludeNames?.length ? { exclude_names: excludeNames } : {}),
    }),
    signal,
  });

export const getNextSuggestion = (
  planId: string,
  excludeNames: string[],
  excludeSlugs: string[] = [],
  signal?: AbortSignal,
): Promise<AiSuggestion> =>
  apiFetch<AiSuggestion>("/ai/suggestions/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_id: planId,
      exclude_names: excludeNames,
      exclude_slugs: excludeSlugs,
    }),
    signal,
  });

export const streamCrossCityTransportSuggestions = (
  planId: string,
  onPair: (pair: TransportSuggestion) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const params = new URLSearchParams({ plan_id: planId });
  return apiSse<TransportSuggestion>(
    `/ai/transport-suggestions/stream?${params.toString()}`,
    (name, data) => {
      if (name === "pair") onPair(data);
    },
    signal,
  );
};

