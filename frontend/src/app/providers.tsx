"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  persistQueryClient,
  type PersistQueryClientOptions,
} from "@tanstack/query-persist-client-core";
import { useEffect, useState } from "react";

import ErrorBoundary from "@/components/layout/ErrorBoundary";
import ThemedToaster from "@/components/theme/ThemedToaster";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryPersister } from "@/lib/offline/queryPersister";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  // Persist only the queries that opt in via `meta: { persist: true }`. This
  // hydrates the cache on cold load (so the plan workspace renders offline
  // from the last known REST snapshot) and writes a debounced snapshot back
  // on every meaningful change. Mount the subscription in an effect so SSR
  // never touches IndexedDB.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // The lower-level persist-client-core ships its own bundled query-core
    // type, which doesn't structurally match the project's installed
    // @tanstack/react-query (versions differ — 5.91 vs 5.99). The runtime
    // shape is identical; cast the options to satisfy the type checker
    // without forcing a version bump that would touch every other query
    // call in the app.
    const options = {
      queryClient,
      persister: queryPersister,
      // Bump if the on-disk shape changes incompatibly — old snapshots will
      // be ignored rather than crash on hydration.
      buster: "ajmo-rq-v1",
      // 24h on-disk lifetime — long enough to bridge most user gaps,
      // short enough that stale plan listings get refreshed on next load.
      maxAge: 24 * 60 * 60 * 1000,
      dehydrateOptions: {
        shouldDehydrateQuery: (query: { meta?: Record<string, unknown> }) =>
          query.meta?.persist === true,
      },
    } as unknown as PersistQueryClientOptions;
    const [unsubscribe] = persistQueryClient(options);
    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <ErrorBoundary>{children}</ErrorBoundary>
        </TooltipProvider>
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
