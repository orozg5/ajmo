"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import ItemCard from "./ItemCard";
import ItemSearch from "./ItemSearch";
import { type PlanDay, type AddItemPayload, type EnrichedItem, type PlanItem } from "@/lib/api";
import { parseCostFromPriceRange } from "@/lib/utils";

interface PendingItem {
  enrichedItem: EnrichedItem;
  name: string;
  itemType: string;
}

interface Props {
  day: PlanDay;
  planId: string;
  destination: string | null;
  onAddItem: (dayId: string, payload: AddItemPayload) => Promise<PlanItem>;
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
    const payload: AddItemPayload = {
      item_type: pendingItem.itemType,
      title: pendingItem.name,
      estimated_cost: parseCostFromPriceRange(aiData.price_range as string | null | undefined),
      ai_data: aiData,
    };

    try {
      await onAddItem(day.id, payload);
      setPendingItem(null);
      setSearchKey((k) => k + 1);
    } catch {
      // keep pending item in place — user can retry
    } finally {
      setIsSaving(false);
    }
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
