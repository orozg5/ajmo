"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  type DestinationResponse,
  type Plan,
  type PlanDay,
  type PlanRole,
} from "@/lib/api";
import { usePlanItinerary } from "@/features/plans/hooks/usePlanItinerary";
import { PlanCollabProvider } from "@/features/plans/hooks/PlanCollabContext";
import { useYPlanMeta } from "@/lib/yjs/hooks";
import AwarenessPublisher from "@/features/plans/components/awareness/AwarenessPublisher";
import ItineraryPlanner from "@/features/plans/components/itinerary/ItineraryPlanner";
import { useConnectionToasts } from "@/features/plans/components/offline/useConnectionToasts";
import PlanHeader from "@/features/plans/components/itinerary/PlanHeader";

interface Props {
  plan: Plan;
  initialDays: PlanDay[];
  destinations: DestinationResponse[];
  isOwner: boolean;
  role: PlanRole;
}

export default function PlanWorkspace({
  plan,
  initialDays,
  destinations,
  isOwner,
  role,
}: Props) {
  const itinerary = usePlanItinerary({ planId: plan.id, initialDays, role });
  const liveMeta = useYPlanMeta(itinerary.doc);
  const queryClient = useQueryClient();
  useConnectionToasts();

  // Date changes ripple through plan_days via the backend's sync_days call.
  // When a peer broadcasts new dates, refetch the days list so day cards
  // appear or disappear without a refresh.
  const liveDateFrom = liveMeta.date_from;
  const liveDateTo = liveMeta.date_to;
  useEffect(() => {
    if (liveDateFrom === undefined && liveDateTo === undefined) return;
    queryClient.invalidateQueries({ queryKey: ["plan-itinerary", plan.id] });
  }, [liveDateFrom, liveDateTo, plan.id, queryClient]);

  return (
    <PlanCollabProvider
      planId={plan.id}
      doc={itinerary.doc}
      provider={itinerary.provider}
      role={role}
    >
      <AwarenessPublisher />
      <PlanHeader
        plan={plan}
        destinations={destinations}
        isOwner={isOwner}
        role={role}
        doc={itinerary.doc}
        provider={itinerary.provider}
        liveMeta={liveMeta}
      />
      <ItineraryPlanner
        plan={plan}
        destinations={destinations}
        role={role}
        itinerary={itinerary}
      />
    </PlanCollabProvider>
  );
}
