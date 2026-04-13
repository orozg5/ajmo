"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Plan, type PlanDay, type DestinationResponse } from "@/lib/api";
import { usePlanItinerary } from "@/features/plans/hooks/usePlanItinerary";
import DayView from "@/features/plans/components/DayView";
import SuggestionsStrip from "@/features/plans/components/SuggestionsStrip";

interface Props {
  plan: Plan;
  initialDays: PlanDay[];
  destinations: DestinationResponse[];
}

export default function ItineraryPlanner({ plan, initialDays, destinations }: Props) {
  const { days, addDay, removeDay, addItem, removeItem, updateItemNotes, isLoading } = usePlanItinerary({
    planId: plan.id,
    initialDays,
  });

  const [activeTab, setActiveTab] = useState<string>(initialDays[0]?.id ?? "");

  async function handleAddDay() {
    const newDay = await addDay();
    setActiveTab(newDay.id);
  }

  // When days change and activeTab is gone (e.g. deleted), fall back to first day
  const activeDay = days.find((d) => d.id === activeTab) ?? days[0];

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
      {plan.destination && (
        <SuggestionsStrip
          planId={plan.id}
          userId={plan.owner_id}
          destination={plan.destination}
          days={days}
          onAddItem={addItem}
          initialSuggestions={plan.suggestions}
        />
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

        {days.map((day) => (
          <TabsContent key={day.id} value={day.id} className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                Day {day.day_number}
                {day.date ? ` — ${day.date}` : ""}
                {day.title ? ` · ${day.title}` : ""}
              </h2>
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
            <DayView
              day={day}
              planId={plan.id}
              destinations={destinations.filter((d) => d.days.includes(day.day_number))}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onUpdateItemNotes={(itemId, notes) => updateItemNotes(day.id, itemId, notes)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
