import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract a numeric cost from a price_range string (e.g. "€29" → 29). */
export function parseCostFromPriceRange(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  return parseFloat(value.replace(/[^0-9.]/g, "")) || undefined;
}
