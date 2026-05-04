"use client";

import { Laptop, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme/ThemeProvider";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const order = ["light", "dark", "system"] as const;
  const next = order[(order.indexOf(theme) + 1) % order.length];
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;
  return (
    <button
      type="button"
      aria-label={`Theme: ${theme}. Click to switch to ${next}.`}
      onClick={() => setTheme(next)}
      className="inline-flex items-center justify-center rounded-lg border border-border bg-card p-2 text-ink transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} />
    </button>
  );
}
