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

  useEffect(() => {
    if (typeof window === "undefined") return;
    // persist-client-core's bundled query-core types don't structurally match @tanstack/react-query 5.99 (it ships 5.91). Runtime shape is identical; cast through to avoid a version bump that would touch every query call.
    const options = {
      queryClient,
      persister: queryPersister,
      buster: "ajmo-rq-v1",
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
