"use client";

import { useCallback, useMemo, useState } from "react";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Map as MapIcon, Train } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { type DestinationResponse, type Plan, type PlanItem, type PlanRole } from "@/lib/api";
import { type UsePlanItineraryReturn } from "@/features/plans/hooks/usePlanItinerary";
import { useSameDayTransportInsert } from "@/features/plans/hooks/useSameDayTransportInsert";
import { useCrossCityTransport } from "@/features/plans/hooks/useCrossCityTransport";
import { useHotels } from "@/features/plans/hooks/useHotels";
import PlanMap from "@/features/map/PlanMap";
import { dragEndToReorderEntry } from "@/features/plans/utils/dragEndToReorderEntry";
import CrossCityTransportPanel from "@/features/plans/components/transport/CrossCityTransportPanel";
import DayNotesEditor from "@/features/plans/components/itinerary/DayNotesEditor";
import DayTabs from "@/features/plans/components/itinerary/DayTabs";
import DayView from "@/features/plans/components/itinerary/DayView";
import DragOverlayCard from "@/features/plans/components/itinerary/DragOverlayCard";
import SuggestionsStrip from "@/features/plans/components/search/SuggestionsStrip";
import BookStayDialog from "@/features/plans/components/hotels/BookStayDialog";
import StaysStrip from "@/features/plans/components/hotels/StaysStrip";

interface Props {
  plan: Plan;
  destinations: DestinationResponse[];
  role: PlanRole;
  itinerary: UsePlanItineraryReturn;
}

export default function ItineraryPlanner({ plan, destinations, role, itinerary }: Props) {
  const {
    days,
    removeDay,
    addItem,
    removeItem,
    updateItemNotes,
    reorderItems,
    updateDayNotes,
    isLoading,
    doc,
  } = itinerary;

  const isViewer = role === "viewer";

  const [activeDayId, setActiveDayId] = useState<string>(days[0]?.id ?? "");
  const [isBookStayOpen, setIsBookStayOpen] = useState(false);
  const [editingHotelId, setEditingHotelId] = useState<string | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [isMapDrawerOpen, setIsMapDrawerOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sameDayTransport = useSameDayTransportInsert({ addItem, doc });
  const crossCityTransportHook = useCrossCityTransport({ planId: plan.id });
  const hotels = useHotels(plan.id);

  // Viewers get an unreachable activation distance so drag-drop never fires.
  // Server-side Yjs `readOnly` is the canonical enforcement; this is just UI.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: isViewer ? Number.POSITIVE_INFINITY : 8 },
    }),
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

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const result = dragEndToReorderEntry(event, itemIndex, days);
    if (!result) return;

    try {
      await reorderItems([result.entry]);
    } catch {
      return;
    }
  }

  function handleDragCancel() {
    setActiveDragId(null);
  }

  const activeDragItem = activeDragId ? itemIndex.get(activeDragId) ?? null : null;

  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No days yet — set the trip dates in Settings to add days.
      </p>
    );
  }

  const activeDayHotels = activeDay
    ? hotels.hotels.filter(
        (h) =>
          activeDay.day_number >= h.check_in_day_number &&
          activeDay.day_number <= h.check_out_day_number,
      )
    : [];

  return (
    <>
      <DndContext
        id="itinerary-planner"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="space-y-4">
          {destinations.length > 0 && (
            <SuggestionsStrip
              planId={plan.id}
              days={days}
              destinations={destinations}
              onAddItem={addItem}
              initialSuggestions={plan.suggestions}
            />
          )}

          <DayTabs
            days={days}
            activeDayId={activeDay?.id ?? ""}
            isLoading={isLoading}
            onSelectDay={setActiveDayId}
            onRemoveDay={handleRemoveDay}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_clamp(440px,46vw,820px)]">
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
                  destinations={activeDayDestinations}
                  onAddItem={addItem}
                  onRemoveItem={removeItem}
                  onUpdateItemNotes={(itemId, notes) => updateItemNotes(activeDay.id, itemId, notes)}
                  dayTransport={{
                    addingKeys: sameDayTransport.addingKeys,
                    onAddTransportOption: (srcItem, dstItem, option) =>
                      sameDayTransport.addMode({
                        srcItem,
                        dstItem,
                        dayId: activeDay.id,
                        option,
                      }),
                  }}
                  highlightedItemId={highlightedItemId}
                  onItemHoverChange={handleItemHoverChange}
                />
              </div>
            )}

            <aside className="hidden lg:flex lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:flex-col lg:gap-3">
              {destinations.length > 1 && (
                <button
                  type="button"
                  onClick={handleOpenCrossCity}
                  disabled={crossCityTransportHook.isLoading}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <Train className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-ink">Cross-city transport</span>
                    <span className="text-xs text-ink-subtle">Plan how you'll get between cities</span>
                  </span>
                </button>
              )}
              <div className="min-h-0 flex-1">
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
            </aside>
          </div>
        </div>
        <DragOverlay
          dropAnimation={{
            duration: 220,
            easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
            sideEffects: defaultDropAnimationSideEffects({
              styles: { active: { opacity: "0.4" } },
            }),
          }}
        >
          {activeDragItem ? <DragOverlayCard item={activeDragItem} /> : null}
        </DragOverlay>
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
          <div className="flex flex-1 flex-col gap-3 overflow-hidden px-4 pb-4">
            {destinations.length > 1 && (
              <button
                type="button"
                onClick={handleOpenCrossCity}
                disabled={crossCityTransportHook.isLoading}
                className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/15 disabled:opacity-60"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <Train className="size-5" strokeWidth={1.75} />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-ink">Cross-city transport</span>
                  <span className="text-xs text-ink-subtle">Plan how you'll get between cities</span>
                </span>
              </button>
            )}
            <div className="min-h-0 flex-1">
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
