"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import ItemCard from "@/components/ItemCard";
import ItemSearch from "@/components/ItemSearch";
import { type PlanDay, type AddItemPayload, type EnrichedItem } from "@/lib/api";

interface PendingItem {
  enrichedItem: EnrichedItem;
  name: string;
  itemType: string;
}

interface Props {
  day: PlanDay;
  planId: string;
  destination: string | null;
  onAddItem: (dayId: string, payload: AddItemPayload) => void;
  onRemoveItem: (dayId: string, itemId: string) => void;
  onUpdateItemNotes: (itemId: string, notes: string | null) => void;
}

export default function DayView({ day, destination, onAddItem, onRemoveItem, onUpdateItemNotes }: Props) {
  const [pendingItem, setPendingItem] = useState<PendingItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchKey, setSearchKey] = useState(0);

  function handleEnrich(enrichedItem: EnrichedItem, name: string, itemType: string) {
    setPendingItem({ enrichedItem, name, itemType });
  }

  function handleCancel() {
    setPendingItem(null);
    setSearchKey((k) => k + 1);
  }

  async function handleSave() {
    if (!pendingItem) return;
    setIsSaving(true);

    const aiData = pendingItem.enrichedItem as unknown as Record<string, unknown>;
    const rawCost = aiData.price_range as string | null | undefined;
    // Attempt to parse a numeric cost from price_range (e.g. "€29" → 29)
    const parsedCost = rawCost ? parseFloat(rawCost.replace(/[^0-9.]/g, "")) || undefined : undefined;

    const payload: AddItemPayload = {
      item_type: pendingItem.itemType,
      title: pendingItem.name,
      location: pendingItem.enrichedItem.location ?? undefined,
      estimated_cost: parsedCost,
      ai_data: aiData,
    };

    onAddItem(day.id, payload);
    setPendingItem(null);
    setSearchKey((k) => k + 1);
    setIsSaving(false);
  }

  const sortedItems = [...day.items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <div className="space-y-4">
      {sortedItems.length > 0 && (
        <div className="space-y-3">
          {sortedItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onRemove={() => onRemoveItem(day.id, item.id)}
              onNotesUpdate={(notes) => onUpdateItemNotes(item.id, notes)}
            />
          ))}
        </div>
      )}

      <div className="pt-2">
        <p className="text-sm font-medium text-muted-foreground mb-3">Add an item</p>
        {destination ? (
          <>
            <ItemSearch key={searchKey} destination={destination} onEnrich={handleEnrich} />
            {pendingItem && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Ready to save <span className="font-medium">{pendingItem.name}</span>
                </span>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  Save to Day {day.day_number}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Set a destination on this plan to add enriched items.</p>
        )}
      </div>
    </div>
  );
}
