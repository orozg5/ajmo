"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type PlanItem } from "@/lib/api";

const ITEM_TYPE_LABELS: Record<string, string> = {
  attraction: "Attraction",
  restaurant: "Restaurant",
  hotel: "Hotel",
  transport: "Transport",
  activity: "Activity",
};

interface Props {
  item: PlanItem;
  onRemove: () => void;
  onNotesUpdate: (notes: string | null) => void;
}

export default function ItemCard({ item, onRemove, onNotesUpdate }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState(item.notes ?? "");

  const aiData = item.ai_data as Record<string, unknown> | null;
  const description = aiData?.description as string | null | undefined;
  const openingHours = (aiData?.opening_hours ?? aiData?.check_in_time ?? aiData?.schedule) as
    | string
    | null
    | undefined;
  const priceRange = aiData?.price_range as string | null | undefined;

  function handleNotesBlur() {
    onNotesUpdate(notes.trim() === "" ? null : notes.trim());
  }

  return (
    <div className="border rounded-lg p-4 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-semibold truncate">{item.title}</span>
          <span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded shrink-0">
            {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((v) => !v)}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive hover:text-destructive">
            Remove
          </Button>
        </div>
      </div>

      {/* Subtitle */}
      {(item.location || item.start_time) && (
        <p className="text-sm text-muted-foreground truncate">
          {[item.location, item.start_time].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="pt-1 space-y-2 text-sm">
          {description && <p>{description}</p>}
          {openingHours && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Hours: </span>
              {openingHours}
            </p>
          )}
          {priceRange && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Price: </span>
              {priceRange}
            </p>
          )}
          {item.estimated_cost != null && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Est. cost: </span>
              {item.estimated_cost.toLocaleString(undefined, {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              })}
            </p>
          )}
          <div className="space-y-1">
            <p className="font-medium">Notes</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Add your notes here..."
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
