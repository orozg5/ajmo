export function formatDateRange(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (start && end) {
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const startLabel = start.toLocaleDateString("en-US", options);
    const endLabel = end.toLocaleDateString("en-US", { ...options, year: sameYear ? undefined : "numeric" });
    return sameYear ? `${startLabel} → ${endLabel}` : `${startLabel} ${start.getUTCFullYear()} → ${endLabel}`;
  }
  const only = start ?? end;
  return only ? only.toLocaleDateString("en-US", { ...options, year: "numeric" }) : null;
}
