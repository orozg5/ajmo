"use client";

import { Toaster } from "sonner";

import { useTheme } from "@/components/theme/ThemeProvider";

export default function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme}
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
  );
}
