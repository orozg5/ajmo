"use client";

import { useState } from "react";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import { type AddItemPayload, type DestinationResponse, type EnrichedItem, type PlanDay, type PlanItem } from "@/lib/api";
import { sortItems } from "@/features/plans/utils/sortKeys";
import AddNoteInline from "@/features/plans/components/itinerary/AddNoteInline";
import InlineTransportBar from "@/features/plans/components/transport/InlineTransportBar";
import ItemCard from "@/features/plans/components/itinerary/ItemCard";
import ItemSearch from "@/features/plans/components/search/ItemSearch";
import { type SameDayModeOption } from "@/features/plans/hooks/useSameDayTransportOptions";

interface PendingItem {
  enrichedItem: EnrichedItem;
  name: string;
  itemType: string;
  destinationId: string;
}

export interface DayTransportContext {
  addingKeys: Set<string>;
  onAddTransportOption: (
    srcItem: PlanItem,
    dstItem: PlanItem,
    option: SameDayModeOption,
  ) => void;
}

type RenderSlot =
  | { kind: "destination"; dest: DestinationResponse; anchor: number }
  | { kind: "null_item"; item: PlanItem; anchor: number };

interface Props {
  day: PlanDay;
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
      place_id: pendingItem.enrichedItem.place_id ?? undefined,
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

  const allSortedItems = sortItems(day.items);

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

  const sortableIds = allSortedItems
    .filter((i) => i.item_type !== "transport")
    .map((item) => item.id);

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
                  onHoverChange={onItemHoverChange}
                />
              );
            }

            const { dest } = slot;
            const sectionItems = allSortedItems.filter((i) => i.destination_id === dest.id);
            // Direction is data, not heuristic: an item is an arrival in the
            // section whose city is its destination_destination_id, and a
            // departure in the section whose city is its source_destination_id.
            // Falls back to the legacy sort_order vs section-min split for any
            // items written before these fields existed.
            const crossCityMeta = (item: PlanItem) =>
              item.ai_data as
                | { cross_city_pair?: string; source_destination_id?: string; destination_destination_id?: string }
                | null;
            const crossCityInSection = sectionItems.filter(
              (i) => Boolean(crossCityMeta(i)?.cross_city_pair),
            );
            const regularInSection = sectionItems.filter(
              (i) => !crossCityMeta(i)?.cross_city_pair,
            );
            const minRegularSort = regularInSection.length > 0
              ? Math.min(...regularInSection.map((i) => i.sort_order ?? 0))
              : Infinity;
            const arrivals = crossCityInSection.filter((i) => {
              const meta = crossCityMeta(i);
              if (meta?.destination_destination_id) return meta.destination_destination_id === dest.id;
              if (meta?.source_destination_id) return false;
              return (i.sort_order ?? 0) < minRegularSort;
            });
            const departures = crossCityInSection.filter((i) => {
              const meta = crossCityMeta(i);
              if (meta?.source_destination_id) return meta.source_destination_id === dest.id;
              if (meta?.destination_destination_id) return false;
              return (i.sort_order ?? 0) >= minRegularSort;
            });
            const cityLabel = `${dest.city}, ${dest.country}`;

            return (
              <div key={dest.id} className="space-y-3">
                {arrivals.length > 0 && (
                  <div className="space-y-1">
                    {arrivals.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onRemove={() => onRemoveItem(day.id, item.id)}
                        onNotesUpdate={(notes) => onUpdateItemNotes(item.id, notes)}
                        isHighlighted={highlightedItemId === item.id}
                        onHoverChange={onItemHoverChange}
                      />
                    ))}
                  </div>
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
                      const showBar =
                        Boolean(nextItem) &&
                        item.item_type !== "transport" &&
                        nextItem?.item_type !== "transport";
                      const pairKey = nextItem ? `${item.id}-${nextItem.id}` : "";
                      const isAdding = pairKey
                        ? dayTransport?.addingKeys.has(pairKey) ?? false
                        : false;

                      return (
                        <div key={item.id}>
                          <ItemCard
                            item={item}
                            onRemove={() => onRemoveItem(day.id, item.id)}
                            onNotesUpdate={(notes) => onUpdateItemNotes(item.id, notes)}
                            isHighlighted={highlightedItemId === item.id}
                            onHoverChange={onItemHoverChange}
                          />
                          {showBar && nextItem ? (
                            <InlineTransportBar
                              src={item}
                              dst={nextItem}
                              isAdding={isAdding}
                              onAdd={(option) => {
                                dayTransport?.onAddTransportOption(item, nextItem, option);
                              }}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {departures.length > 0 && (
                  <div className="space-y-1">
                    {departures.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onRemove={() => onRemoveItem(day.id, item.id)}
                        onNotesUpdate={(notes) => onUpdateItemNotes(item.id, notes)}
                        isHighlighted={highlightedItemId === item.id}
                        onHoverChange={onItemHoverChange}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </SortableContext>
  );
}
