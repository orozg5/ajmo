"use client";

import { useState } from "react";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import { type AddItemPayload, type DestinationResponse, type EnrichedItem, type PlanDay, type PlanItem, type TransportSuggestion } from "@/lib/api";
import { sortItems } from "@/features/plans/utils/sortKeys";
import AddNoteInline from "@/features/plans/components/itinerary/AddNoteInline";
import CrossCityTransitBand from "@/features/plans/components/transport/CrossCityTransitBand";
import InlineTransportBar from "@/features/plans/components/transport/InlineTransportBar";
import ItemCard from "@/features/plans/components/itinerary/ItemCard";
import ItemSearch from "@/features/plans/components/search/ItemSearch";

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
    if (!transport || !source || transport.destination_id !== source.destination_id) continue;
    const transportIdx = result.findIndex((i) => i.id === transportId);
    const [removed] = result.splice(transportIdx, 1);
    const sourceIdx = result.findIndex((i) => i.id === sourceItemId);
    if (sourceIdx === -1) { result.push(removed); continue; }
    result.splice(sourceIdx + 1, 0, removed);
  }
  return result;
}

function computeOrphanedTransportIds(allSortedItems: PlanItem[]): Set<string> {
  const orphaned = new Set<string>();
  for (let i = 0; i < allSortedItems.length; i++) {
    const item = allSortedItems[i];
    if (item.item_type !== "transport") continue;
    const ai = item.ai_data as { same_day_pair?: string } | null;
    const pair = ai?.same_day_pair;
    if (!pair) continue;
    const sourceId = pair.split("->")[0];
    if (!sourceId) continue;

    let prevNonTransport: PlanItem | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (allSortedItems[j].item_type !== "transport") {
        prevNonTransport = allSortedItems[j];
        break;
      }
    }
    if (!prevNonTransport || prevNonTransport.id !== sourceId) {
      orphaned.add(item.id);
    }
  }
  return orphaned;
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
  highlightedItemId?: string | null;
  onItemHoverChange?: (itemId: string, hovered: boolean) => void;
}

export default function DayView({ day, destinations, onAddItem, onRemoveItem, onUpdateItemNotes, dayTransport, highlightedItemId, onItemHoverChange }: Props) {
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

  const rawSorted = sortItems(day.items);
  const positions = dayTransport?.transportPositions;
  const allSortedItems = positions && positions.size > 0 ? applyTransportPositions(rawSorted, positions) : rawSorted;
  const orphanedTransportIds = computeOrphanedTransportIds(allSortedItems);

  const slots: RenderSlot[] = [];

  for (const dest of destinations) {
    const sectionItems = allSortedItems.filter((i) => i.destination_id === dest.id);
    const anchor =
      sectionItems.length > 0
        ? Math.min(...sectionItems.map((i) => i.sort_order ?? Infinity))
        : (dest.sort_order ?? 0) * 100_000;
    slots.push({ kind: "destination", dest, anchor });
  }

  for (const item of allSortedItems) {
    if (item.destination_id == null) {
      slots.push({ kind: "null_item", item, anchor: item.sort_order ?? 0 });
    }
  }

  slots.sort((a, b) => a.anchor - b.anchor);

  const sortableIds = allSortedItems.map((item) => item.id);

  return (
    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      <div className="space-y-3">
        {destinations.length === 0 ? (
          <p className="text-sm text-ink-subtle">Set a destination on this plan to add enriched items.</p>
        ) : (
          slots.map((slot) => {
            if (slot.kind === "null_item") {
              return (
                <ItemCard
                  key={slot.item.id}
                  item={slot.item}
                  onRemove={() => onRemoveItem(day.id, slot.item.id)}
                  onNotesUpdate={(notes) => onUpdateItemNotes(slot.item.id, notes)}
                  isHighlighted={highlightedItemId === slot.item.id}
                  isOrphan={orphanedTransportIds.has(slot.item.id)}
                  onHoverChange={onItemHoverChange}
                />
              );
            }

            const { dest } = slot;
            const sectionItems = allSortedItems.filter((i) => i.destination_id === dest.id);
            const crossCityInSection = sectionItems.filter(
              (i) => Boolean((i.ai_data as { cross_city_pair?: string } | null)?.cross_city_pair),
            );
            const regularInSection = sectionItems.filter(
              (i) => !(i.ai_data as { cross_city_pair?: string } | null)?.cross_city_pair,
            );
            const minRegularSort = regularInSection.length > 0
              ? Math.min(...regularInSection.map((i) => i.sort_order ?? 0))
              : Infinity;
            const arrivals = crossCityInSection.filter((i) => (i.sort_order ?? 0) < minRegularSort);
            const departures = crossCityInSection.filter((i) => (i.sort_order ?? 0) >= minRegularSort);
            const cityLabel = `${dest.city}, ${dest.country}`;

            return (
              <div key={dest.id} className="space-y-3">
                {arrivals.length > 0 && (
                  <CrossCityTransitBand
                    items={arrivals}
                    role="arrival"
                    cityLabel={cityLabel}
                    onRemove={(itemId) => onRemoveItem(day.id, itemId)}
                  />
                )}

                <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                  {cityLabel}
                </p>

                <ItemSearch
                  key={`${dest.id}-${searchKey}`}
                  destination={cityLabel}
                  onEnrich={makeHandleEnrich(dest.id)}
                />
                {pendingItem?.destinationId === dest.id && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
                    <span className="text-sm text-ink-subtle">
                      Ready to save <span className="font-medium text-ink">{pendingItem.name}</span>
                    </span>
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                      Save to Day {day.day_number}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancel}>
                      Cancel
                    </Button>
                  </div>
                )}

                <AddNoteInline
                  onSave={async (title, body) => {
                    await onAddItem(day.id, {
                      item_type: "note",
                      title,
                      notes: body ?? undefined,
                      destination_id: dest.id,
                    });
                  }}
                />

                {regularInSection.length > 0 && (
                  <div className="space-y-3">
                    {regularInSection.map((item, itemIdx) => {
                      const nextItem = regularInSection[itemIdx + 1];
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
                            isHighlighted={highlightedItemId === item.id}
                            isOrphan={orphanedTransportIds.has(item.id)}
                            onHoverChange={onItemHoverChange}
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

                {departures.length > 0 && (
                  <CrossCityTransitBand
                    items={departures}
                    role="departure"
                    cityLabel={cityLabel}
                    onRemove={(itemId) => onRemoveItem(day.id, itemId)}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </SortableContext>
  );
}
