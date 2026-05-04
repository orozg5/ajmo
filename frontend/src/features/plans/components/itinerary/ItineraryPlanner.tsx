"use client";

import { useCallback, useMemo, useState } from "react";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Loader2, Map as MapIcon, Train } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { type DestinationResponse, type Plan, type PlanDay, type PlanItem } from "@/lib/api";
import { usePlanItinerary } from "@/features/plans/hooks/usePlanItinerary";
import { useDayTransport } from "@/features/plans/hooks/useDayTransport";
import { useCrossCityTransport } from "@/features/plans/hooks/useCrossCityTransport";
import { useHotels } from "@/features/plans/hooks/useHotels";
import PlanMap from "@/features/map/PlanMap";
import { dragEndToReorderEntry } from "@/features/plans/utils/dragEndToReorderEntry";
import { hasPendingWithinDayPairs } from "@/features/plans/utils/transportPairs";
import CrossCityTransportPanel from "@/features/plans/components/transport/CrossCityTransportPanel";
import DayNotesEditor from "@/features/plans/components/itinerary/DayNotesEditor";
import DaySidebar from "@/features/plans/components/itinerary/DaySidebar";
import DayView from "@/features/plans/components/itinerary/DayView";
import SuggestionsStrip from "@/features/plans/components/search/SuggestionsStrip";
import BookStayDialog from "@/features/plans/components/hotels/BookStayDialog";
import StaysStrip from "@/features/plans/components/hotels/StaysStrip";

interface Props {
  plan: Plan;
  initialDays: PlanDay[];
  destinations: DestinationResponse[];
}

export default function ItineraryPlanner({ plan, initialDays, destinations }: Props) {
  const {
    days,
    addDay,
    removeDay,
    addItem,
    removeItem,
    updateItemNotes,
    reorderItems,
    updateDayNotes,
    isLoading,
  } = usePlanItinerary({ planId: plan.id, initialDays });

  const [activeDayId, setActiveDayId] = useState<string>(initialDays[0]?.id ?? "");
  const [isBookStayOpen, setIsBookStayOpen] = useState(false);
  const [editingHotelId, setEditingHotelId] = useState<string | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [isMapDrawerOpen, setIsMapDrawerOpen] = useState(false);

  const dayTransportHook = useDayTransport({ planId: plan.id });
  const crossCityTransportHook = useCrossCityTransport({ planId: plan.id });
  const hotels = useHotels(plan.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeDay = days.find((d) => d.id === activeDayId) ?? days[0];
  const activeDayDestinations = activeDay
    ? destinations.filter((d) => d.days.includes(activeDay.day_number))
    : [];

  const itemIndex = useMemo(() => {
    const map = new Map<string, PlanItem>();
    for (const day of days) {
      for (const item of day.items) map.set(item.id, item);
    }
    return map;
  }, [days]);

  async function handleAddDay() {
    const newDay = await addDay();
    setActiveDayId(newDay.id);
  }

  function handleRemoveDay(dayId: string) {
    removeDay(dayId);
    if (activeDayId === dayId) {
      const remaining = days.filter((d) => d.id !== dayId);
      setActiveDayId(remaining[0]?.id ?? "");
    }
  }

  function handleOpenCrossCity() {
    crossCityTransportHook.openPanel();
    crossCityTransportHook.fetchSuggestions();
  }

  const handleItemHover = useCallback((itemId: string | null) => {
    setHighlightedItemId(itemId);
  }, []);

  const handleItemHoverChange = useCallback((itemId: string, hovered: boolean) => {
    setHighlightedItemId((current) => {
      if (hovered) return itemId;
      return current === itemId ? null : current;
    });
  }, []);

  const handleMarkerClick = useCallback((itemId: string) => {
    const targetItem = itemIndex.get(itemId);
    if (targetItem && targetItem.day_id !== activeDayId) {
      setActiveDayId(targetItem.day_id);
    }
    setHighlightedItemId(itemId);
    setIsMapDrawerOpen(false);
  }, [activeDayId, itemIndex]);

  async function handleDragEnd(event: DragEndEvent) {
    const result = dragEndToReorderEntry(event, itemIndex, days);
    if (!result) return;

    try {
      await reorderItems([result.entry]);
    } catch {
      return;
    }

    // F1: Adjacency-based transport suggestions go stale after a reorder.
    // Re-fetch only for days the user already opened, so we don't spontaneously
    // spin up LLM calls for untouched days.
    const affectedDayIds = new Set([result.sourceDayId, result.targetDayId]);
    for (const dayId of affectedDayIds) {
      if (dayTransportHook.hasFetched(dayId)) {
        dayTransportHook.fetchForDay(dayId);
      }
    }
  }

  if (days.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">No days yet.</p>
        <Button size="sm" onClick={handleAddDay} disabled={isLoading}>
          + Add day
        </Button>
      </div>
    );
  }

  const activeDayState = activeDay ? dayTransportHook.getDayState(activeDay.id) : null;
  const showGetTransport = activeDay ? hasPendingWithinDayPairs(activeDay, activeDayDestinations) : false;
  const activeDayHotels = activeDay
    ? hotels.hotels.filter(
        (h) =>
          activeDay.day_number >= h.check_in_day_number &&
          activeDay.day_number <= h.check_out_day_number,
      )
    : [];

  return (
    <>
      <DndContext id="itinerary-planner" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="space-y-3">
          {destinations.length > 0 && (
            <SuggestionsStrip
              planId={plan.id}
              days={days}
              destinations={destinations}
              onAddItem={addItem}
              initialSuggestions={plan.suggestions}
            />
          )}

          {destinations.length > 1 &&
            !(crossCityTransportHook.hasFetched && crossCityTransportHook.suggestions.length === 0) && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenCrossCity}
                  disabled={crossCityTransportHook.isLoading}
                >
                  <Train className="size-4" strokeWidth={1.5} />
                  Cross-city transport
                </Button>
              </div>
            )}

          <div className="grid gap-4 lg:grid-cols-[clamp(220px,16vw,320px)_minmax(0,1fr)_clamp(360px,24vw,560px)]">
            <DaySidebar
              days={days}
              activeDayId={activeDay?.id ?? ""}
              isLoading={isLoading}
              onSelectDay={setActiveDayId}
              onAddDay={handleAddDay}
              onRemoveDay={handleRemoveDay}
            />

            {activeDay && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-display-lg leading-tight">
                    Day {activeDay.day_number}
                    {activeDay.date ? (
                      <span className="ml-2 text-base font-normal text-ink-subtle">— {activeDay.date}</span>
                    ) : null}
                    {activeDay.title ? (
                      <span className="ml-2 text-base font-normal text-ink-subtle">· {activeDay.title}</span>
                    ) : null}
                  </h2>
                  <div className="flex items-center gap-2">
                    {showGetTransport && activeDayState && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => dayTransportHook.fetchForDay(activeDay.id)}
                        disabled={activeDayState.isLoading}
                      >
                        {activeDayState.isLoading ? (
                          <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
                        ) : (
                          <Train className="size-4" strokeWidth={1.5} />
                        )}
                        Get transport
                      </Button>
                    )}
                  </div>
                </div>

                <StaysStrip
                  hotels={activeDayHotels}
                  activeDayNumber={activeDay.day_number}
                  isMutating={hotels.isMutating}
                  onAddStay={() => {
                    setEditingHotelId(null);
                    setIsBookStayOpen(true);
                  }}
                  onEditHotel={(hotelId) => {
                    setEditingHotelId(hotelId);
                    setIsBookStayOpen(true);
                  }}
                  onDeleteHotel={(hotelId) => hotels.deleteHotel(hotelId)}
                />

                <DayNotesEditor
                  dayId={activeDay.id}
                  initial={activeDay.notes}
                  onPersist={updateDayNotes}
                />

                <DayView
                  day={activeDay}
                  planId={plan.id}
                  destinations={activeDayDestinations}
                  onAddItem={addItem}
                  onRemoveItem={removeItem}
                  onUpdateItemNotes={(itemId, notes) => updateItemNotes(activeDay.id, itemId, notes)}
                  dayTransport={
                    activeDayState
                      ? {
                          suggestions: activeDayState.suggestions,
                          isFetching: activeDayState.isLoading,
                          addingKeys: dayTransportHook.addingKeys,
                          onAddTransportOption: (suggestion, optIdx, extra) =>
                            dayTransportHook.addOption(suggestion, optIdx, activeDay.id, addItem, extra),
                          transportPositions: dayTransportHook.transportPositions,
                        }
                      : undefined
                  }
                  highlightedItemId={highlightedItemId}
                  onItemHoverChange={handleItemHoverChange}
                />
              </div>
            )}

            <aside className="hidden lg:block lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
              <PlanMap
                days={days}
                hotels={hotels.hotels}
                activeDayId={activeDayId}
                destinations={destinations}
                highlightedItemId={highlightedItemId}
                onItemHover={handleItemHover}
                onItemClick={handleMarkerClick}
              />
            </aside>
          </div>
        </div>
      </DndContext>

      <Drawer open={isMapDrawerOpen} onOpenChange={setIsMapDrawerOpen}>
        <DrawerTrigger asChild>
          <Button
            size="lg"
            className="fixed bottom-6 right-6 z-40 h-14 rounded-full shadow-lg lg:hidden"
            aria-label="Show map"
          >
            <MapIcon className="size-5" strokeWidth={1.5} />
            Map
          </Button>
        </DrawerTrigger>
        <DrawerContent className="h-[80vh]">
          <DrawerHeader>
            <DrawerTitle>Map</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-hidden px-4 pb-4">
            <PlanMap
              days={days}
              hotels={hotels.hotels}
              activeDayId={activeDayId}
              destinations={destinations}
              highlightedItemId={highlightedItemId}
              onItemHover={handleItemHover}
              onItemClick={handleMarkerClick}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <BookStayDialog
        open={isBookStayOpen}
        onOpenChange={(open) => {
          setIsBookStayOpen(open);
          if (!open) setEditingHotelId(null);
        }}
        planId={plan.id}
        days={days}
        destinations={destinations}
        hotels={hotels}
        editingHotelId={editingHotelId}
      />

      <CrossCityTransportPanel
        open={crossCityTransportHook.isOpen}
        onOpenChange={(open) =>
          open ? crossCityTransportHook.openPanel() : crossCityTransportHook.closePanel()
        }
        suggestions={crossCityTransportHook.suggestions}
        isLoading={crossCityTransportHook.isLoading}
        error={crossCityTransportHook.error}
        days={days}
        destinations={destinations}
        addingKeys={crossCityTransportHook.addingKeys}
        onAddOption={(suggestion, optIdx, dayId, extra) =>
          crossCityTransportHook.addOption(suggestion, optIdx, dayId, addItem, extra)
        }
      />
    </>
  );
}
