"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { type ProfileSummary, searchUsers } from "@/lib/api";

const DEBOUNCE_MS = 250;

export interface UseUserSearchReturn {
  query: string;
  setQuery: (next: string) => void;
  results: ProfileSummary[];
  isLoading: boolean;
}

export function useUserSearch(): UseUserSearchReturn {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isFetching } = useQuery<ProfileSummary[]>({
    queryKey: ["social", "users", "search", debounced],
    queryFn: () => searchUsers(debounced),
    enabled: debounced.length > 0,
  });

  return {
    query,
    setQuery,
    results: debounced.length === 0 ? [] : data ?? [],
    isLoading: isFetching && debounced.length > 0,
  };
}
