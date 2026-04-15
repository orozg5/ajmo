"use client";

export default function SkeletonCard() {
  return (
    <div className="shrink-0 w-44 rounded-lg border bg-card p-3 flex flex-col gap-2 animate-pulse">
      <div className="flex items-start gap-1.5">
        <div className="h-4 w-4 rounded bg-muted" />
        <div className="h-3 w-28 rounded bg-muted" />
      </div>
      <div className="h-3 w-32 rounded bg-muted" />
      <div className="flex justify-end mt-auto pt-1">
        <div className="h-6 w-12 rounded bg-muted" />
      </div>
    </div>
  );
}
