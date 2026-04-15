"use client";

import { useState } from "react";

import { Loader2, Train } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type DestinationResponse, type Plan, type PlanDay } from "@/lib/api";
import { usePlanItinerary } from "@/features/plans/hooks/usePlanItinerary";
import { useDayTransport } from "@/features/plans/hooks/useDayTransport";
import { useCrossCityTransport } from "@/features/plans/hooks/useCrossCityTransport";
import CrossCityTransportPanel from "@/features/plans/components/CrossCityTransportPanel";
import DayView from "@/features/plans/components/DayView";
import SuggestionsStrip from "@/features/plans/components/SuggestionsStrip";

interface Props {
  plan: Plan;
  initialDays: PlanDay[];
  destinations: DestinationResponse[];
}

function hasPendingWithinDayPairs(day: PlanDay, dayDestinations: DestinationResponse[]): boolean {
  for (const dest of dayDestinations) {
    const sectionItems = day.items
      .filter((i) => i.destination_id === dest.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    for (let i = 0; i < sectionItems.length - 1; i++) {
      const curr = sectionItems[i];
      const next = sectionItems[i + 1];
      if (curr.item_type === "transport" || next.item_type === "transport") continue;

      const hasTransportBetween = sectionItems.some(
        (t) =>
          t.item_type === "transport" &&
          (t.sort_order ?? 0) > (curr.sort_order ?? 0) &&
          (t.sort_order ?? 0) < (next.sort_order ?? 0),
      );
      if (!hasTransportBetween) return true;
    }
  }
  return false;
}

export default function ItineraryPlanner({ plan, initialDays, destinations }: Props) {
  const { days, addDay, removeDay, addItem, removeItem, updateItemNotes, isLoading } = usePlanItinerary({
    planId: plan.id,
    initialDays,
  });

  const [activeTab, setActiveTab] = useState<string>(initialDays[0]?.id ?? "");

  const dayTransportHook = useDayTransport({ planId: plan.id });
  const crossCityTransportHook = useCrossCityTransport({ planId: plan.id });

  async function handleAddDay() {
    const newDay = await addDay();
    setActiveTab(newDay.id);
  }

  const activeDay = days.find((d) => d.id === activeTab) ?? days[0];

  function handleOpenCrossCity() {
    crossCityTransportHook.openPanel();
    crossCityTransportHook.fetchSuggestions();
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

  return (
    <div className="space-y-4">
      {destinations.length > 0 && (
        <SuggestionsStrip
          planId={plan.id}
          days={days}
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
              <Train className="h-4 w-4 mr-1" />
              Cross-city transport
            </Button>
          </div>
        )}

      <Tabs value={activeDay?.id ?? ""} onValueChange={setActiveTab}>
        <div className="flex items-center gap-2 flex-wrap">
          <TabsList>
            {days.map((day) => (
              <TabsTrigger key={day.id} value={day.id}>
                Day {day.day_number}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button size="sm" variant="outline" onClick={handleAddDay} disabled={isLoading}>
            + Add day
          </Button>
        </div>

        {days.map((day) => {
          const dayState = dayTransportHook.getDayState(day.id);
          const dayDestinations = destinations.filter((d) => d.days.includes(day.day_number));
          return (
            <TabsContent key={day.id} value={day.id} className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">
                  Day {day.day_number}
                  {day.date ? ` — ${day.date}` : ""}
                  {day.title ? ` · ${day.title}` : ""}
                </h2>
                <div className="flex items-center gap-2">
                  {hasPendingWithinDayPairs(day, dayDestinations) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dayTransportHook.fetchForDay(day.id)}
                      disabled={dayState.isLoading}
                    >
                      {dayState.isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Train className="h-3 w-3 mr-1" />
                      )}
                      Get transport
                    </Button>
                  )}
                  {days.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        removeDay(day.id);
                        if (activeTab === day.id) {
                          const remaining = days.filter((d) => d.id !== day.id);
                          setActiveTab(remaining[0]?.id ?? "");
                        }
                      }}
                    >
                      Remove day
                    </Button>
                  )}
                </div>
              </div>
              <DayView
                day={day}
                planId={plan.id}
                destinations={dayDestinations}
                onAddItem={addItem}
                onRemoveItem={removeItem}
                onUpdateItemNotes={(itemId, notes) => updateItemNotes(day.id, itemId, notes)}
                dayTransport={{
                  suggestions: dayState.suggestions,
                  isFetching: dayState.isLoading,
                  addingKeys: dayTransportHook.addingKeys,
                  onAddTransportOption: (suggestion, optIdx, extra) =>
                    dayTransportHook.addOption(suggestion, optIdx, day.id, addItem, extra),
                  transportPositions: dayTransportHook.transportPositions,
                }}
              />
            </TabsContent>
          );
        })}
      </Tabs>

      <CrossCityTransportPanel
        open={crossCityTransportHook.isOpen}
        onOpenChange={(open) => (open ? crossCityTransportHook.openPanel() : crossCityTransportHook.closePanel())}
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
    </div>
  );
}
