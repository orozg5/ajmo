"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { type AddItemPayload, type DestinationResponse, type EnrichedItem, type PlanDay, type PlanItem, type TransportSuggestion } from "@/lib/api";
import InlineTransportBar from "@/features/plans/components/InlineTransportBar";
import ItemCard from "@/features/plans/components/ItemCard";
import ItemSearch from "@/features/plans/components/ItemSearch";

interface PendingItem {
  enrichedItem: EnrichedItem;
  name: string;
  itemType: string;
  destinationId: string;
}

export interface DayTransportContext {
  suggestions: Map<string, TransportSuggestion>;
  isFetching: boolean;
  addingKeys: Set<string>;
  onAddTransportOption: (
    suggestion: TransportSuggestion,
    optionIndex: number,
    extra?: { destinationId?: string; sortOrder?: number },
  ) => void;
  transportPositions?: Map<string, string>;
}

function applyTransportPositions(sortedItems: PlanItem[], positions: Map<string, string>): PlanItem[] {
  const result = [...sortedItems];
  for (const [transportId, sourceItemId] of positions) {
    const transport = result.find((i) => i.id === transportId);
    const source = result.find((i) => i.id === sourceItemId);
    // Cross-destination transport: let sort_order handle placement, don't re-order
    if (!transport || !source || transport.destination_id !== source.destination_id) continue;
    const transportIdx = result.findIndex((i) => i.id === transportId);
    const [removed] = result.splice(transportIdx, 1);
    const sourceIdx = result.findIndex((i) => i.id === sourceItemId);
    if (sourceIdx === -1) { result.push(removed); continue; }
    result.splice(sourceIdx + 1, 0, removed);
  }
  return result;
}

type RenderSlot =
  | { kind: "destination"; dest: DestinationResponse; anchor: number }
  | { kind: "null_item"; item: PlanItem; anchor: number };

interface Props {
  day: PlanDay;
  planId: string;
  destinations: DestinationResponse[];
  onAddItem: (dayId: string, payload: AddItemPayload) => Promise<PlanItem>;
  onRemoveItem: (dayId: string, itemId: string) => void;
  onUpdateItemNotes: (itemId: string, notes: string | null) => void;
  dayTransport?: DayTransportContext;
}

export default function DayView({ day, destinations, onAddItem, onRemoveItem, onUpdateItemNotes, dayTransport }: Props) {
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

  // All items sorted globally by sort_order, then within-destination transport items
  // that were added this session are re-ordered to appear right after their source item.
  const rawSorted = [...day.items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const positions = dayTransport?.transportPositions;
  const allSortedItems = positions && positions.size > 0 ? applyTransportPositions(rawSorted, positions) : rawSorted;

  // Build render slots: destination sections and null-destination items interleaved by anchor.
  // The anchor for a destination section is the minimum sort_order of its items — this
  // ensures same-day cross-city transport items (null destination_id + midpoint sort_order)
  // naturally land between the two city sections when sorted alongside them.
  const slots: RenderSlot[] = [];

  for (const dest of destinations) {
    const sectionItems = allSortedItems.filter((i) => i.destination_id === dest.id);
    const anchor =
      sectionItems.length > 0
        ? Math.min(...sectionItems.map((i) => i.sort_order ?? Infinity))
        : (dest.sort_order ?? 0) * 100_000; // push empty sections after populated ones
    slots.push({ kind: "destination", dest, anchor });
  }

  for (const item of allSortedItems) {
    if (item.destination_id == null) {
      slots.push({ kind: "null_item", item, anchor: item.sort_order ?? 0 });
    }
  }

  slots.sort((a, b) => a.anchor - b.anchor);

  return (
    <div className="space-y-4">
      {destinations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Set a destination on this plan to add enriched items.</p>
      ) : (
        slots.map((slot) => {
          if (slot.kind === "null_item") {
            // Null-destination items render inline in their sort_order position.
            // This includes same-day cross-city transport items added from the modal.
            return (
              <ItemCard
                key={slot.item.id}
                item={slot.item}
                onRemove={() => onRemoveItem(day.id, slot.item.id)}
                onNotesUpdate={(notes) => onUpdateItemNotes(slot.item.id, notes)}
              />
            );
          }

          // Destination section
          const { dest } = slot;
          const sectionItems = allSortedItems.filter((i) => i.destination_id === dest.id);

          return (
            <div key={dest.id} className="space-y-3 pt-2">
              <p className="text-sm font-medium text-muted-foreground">
                {dest.city}, {dest.country}
              </p>

              {sectionItems.length > 0 && (
                <div>
                  {sectionItems.map((item, itemIdx) => {
                    const nextItem = sectionItems[itemIdx + 1];
                    const suggestion = dayTransport?.suggestions.get(item.id);
                    const isAdding = suggestion
                      ? (dayTransport?.addingKeys.has(`${suggestion.source_item_id}-${suggestion.destination_item_id}`) ?? false)
                      : false;

                    return (
                      <div key={item.id}>
                        <ItemCard
                          item={item}
                          onRemove={() => onRemoveItem(day.id, item.id)}
                          onNotesUpdate={(notes) => onUpdateItemNotes(item.id, notes)}
                        />
                        {nextItem && item.item_type !== "transport" && nextItem.item_type !== "transport" && (
                          <InlineTransportBar
                            suggestion={suggestion}
                            isFetching={dayTransport?.isFetching ?? false}
                            isAdding={isAdding}
                            onAdd={(optIdx) => {
                              if (suggestion && dayTransport) {
                                dayTransport.onAddTransportOption(suggestion, optIdx, {
                                  destinationId: item.destination_id ?? undefined,
                                  sortOrder:
                                    item.sort_order != null && nextItem.sort_order != null
                                      ? Math.floor((item.sort_order + nextItem.sort_order) / 2)
                                      : undefined,
                                });
                              }
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
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
