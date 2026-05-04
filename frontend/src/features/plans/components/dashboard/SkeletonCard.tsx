import { Skeleton } from "@/components/ui/skeleton";

export default function SkeletonCard() {
  return (
    <div className="shrink-0 w-44 rounded-2xl border border-border bg-card p-3 flex flex-col gap-2 shadow-sm">
      <div className="flex items-start gap-1.5">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-3 w-28 rounded" />
      </div>
      <Skeleton className="h-3 w-32 rounded" />
      <div className="flex justify-end mt-auto pt-1">
        <Skeleton className="h-6 w-12 rounded" />
      </div>
    </div>
  );
}
