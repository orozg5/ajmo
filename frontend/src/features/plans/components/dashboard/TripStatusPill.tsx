import { cn } from "@/lib/utils";
import {
  TRIP_STATUS_ICON,
  TRIP_STATUS_LABEL,
  type TripStatus,
} from "@/features/plans/utils/tripStatus";

// Intentionally configurable — colour treatments per status pill.
const STATUS_TONE: Record<TripStatus, string> = {
  upcoming: "bg-secondary/15 text-secondary ring-secondary/25",
  ongoing: "bg-primary/15 text-primary ring-primary/30",
  past: "bg-muted text-ink-subtle ring-border",
  undated: "bg-accent/20 text-accent-foreground ring-accent/35",
};

type TripStatusPillProps = {
  status: TripStatus;
  className?: string;
};

export default function TripStatusPill({ status, className }: TripStatusPillProps): React.JSX.Element {
  const Icon = TRIP_STATUS_ICON[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        STATUS_TONE[status],
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={1.75} />
      {TRIP_STATUS_LABEL[status]}
    </span>
  );
}
