"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { type PlanDay, type AddItemPayload, type EnrichedItem, type PlanItem, type DestinationResponse } from "@/lib/api";
import ItemCard from "@/features/plans/components/ItemCard";
import ItemSearch from "@/features/plans/components/ItemSearch";

interface PendingItem {
  enrichedItem: EnrichedItem;
  name: string;
  itemType: string;
  destinationId: string;
}

interface Props {
  day: PlanDay;
  planId: string;
  destinations: DestinationResponse[];
  onAddItem: (dayId: string, payload: AddItemPayload) => Promise<PlanItem>;
  onRemoveItem: (dayId: string, itemId: string) => void;
  onUpdateItemNotes: (itemId: string, notes: string | null) => void;
}

export default function DayView({ day, destinations, onAddItem, onRemoveItem, onUpdateItemNotes }: Props) {
  const [pendingItem, setPendingItem] = useState<PendingItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchKey, setSearchKey] = useState(0);

  function makeHandleEnrich(destinationId: string) {
    return (enrichedItem: EnrichedItem, name: string, itemType: string) => {
      setPendingItem({ enrichedItem, name, itemType, destinationId });
    };
  }

  function handleCancel() {
    setPendingItem(null);
    setSearchKey((k) => k + 1);
  }

  async function handleSave() {
    if (!pendingItem) return;
    setIsSaving(true);

    const aiData = pendingItem.enrichedItem;
    const payload: AddItemPayload = {
      item_type: pendingItem.itemType,
      title: pendingItem.name,
      ai_data: aiData,
      destination_id: pendingItem.destinationId,
      location: pendingItem.enrichedItem.location ?? undefined,
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
  const legacyItems = sortedItems.filter((item) => item.destination_id == null);

  return (
    <div className="space-y-4">
      {legacyItems.length > 0 && (
        <div className="space-y-3">
          {legacyItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onRemove={() => onRemoveItem(day.id, item.id)}
              onNotesUpdate={(notes) => onUpdateItemNotes(item.id, notes)}
            />
          ))}
        </div>
      )}

      {destinations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Set a destination on this plan to add enriched items.</p>
      ) : (
        destinations.map((dest) => {
          const destItems = sortedItems.filter((item) => item.destination_id === dest.id);
          return (
            <div key={dest.id} className="space-y-3 pt-2">
              <p className="text-sm font-medium text-muted-foreground">
                {dest.city}, {dest.country}
              </p>
              {destItems.length > 0 && (
                <div className="space-y-3">
                  {destItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onRemove={() => onRemoveItem(day.id, item.id)}
                      onNotesUpdate={(notes) => onUpdateItemNotes(item.id, notes)}
                    />
                  ))}
                </div>
              )}
              <ItemSearch
                key={`${dest.id}-${searchKey}`}
                destination={`${dest.city}, ${dest.country}`}
                destinationId={dest.id}
                onEnrich={makeHandleEnrich(dest.id)}
              />
              {pendingItem?.destinationId === dest.id && (
                <div className="flex items-center gap-3">
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
            </div>
          );
        })
      )}
    </div>
  );
}
