"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type EnrichedItem, type PlanItem } from "@/lib/api";

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

  // CrossCityMarker has only cross_city_pair — narrow to EnrichedItem for display fields
  const enriched = item.ai_data && "cross_city_pair" in item.ai_data ? null : (item.ai_data as EnrichedItem | null);
  const description = enriched?.description;
  const openingHours = enriched?.opening_hours ?? enriched?.check_in_time ?? enriched?.schedule;
  const priceRange = enriched?.price_range;
  const location = item.location ?? enriched?.location ?? null;

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
      {(location || item.start_time) && (
        <p className="text-sm text-muted-foreground truncate">
          {[location, item.start_time].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="pt-1 space-y-2 text-sm">
          {description && <p>{description}</p>}
          {openingHours != null && (
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
