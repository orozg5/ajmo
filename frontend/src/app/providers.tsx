"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";

import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
// Side-effect import: configures the generated API client with baseUrl + auth interceptor.
import "@/lib/api/generatedSetup";

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
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <ErrorBoundary>{children}</ErrorBoundary>
        </TooltipProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          className="z-[60]"
          toastOptions={{
            classNames: {
              toast: "rounded-xl border border-border bg-card text-ink shadow-sm",
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
