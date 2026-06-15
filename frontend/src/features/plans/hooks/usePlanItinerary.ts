"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";

import {
  getDays as apiGetDays,
  removeDay as apiRemoveDay,
  type AddItemPayload,
  type PlanDay,
  type PlanItem,
  type PlanRole,
  type ReorderEntry,
} from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import {
  type ConnectionStatus,
  useYAllDayNotes,
  useYAllItems,
  useYDoc,
} from "@/lib/yjs/hooks";
import {
  addItem as yAddItem,
  clearDayContent as yClearDayContent,
  removeItem as yRemoveItem,
  reorderItems as yReorderItems,
  setDayNotes as ySetDayNotes,
  updateItemNotes as yUpdateItemNotes,
} from "@/lib/yjs/mutations";

export interface UsePlanItineraryOptions {
  planId: string;
  initialDays: PlanDay[];
  role: PlanRole;
}

export interface UsePlanItineraryReturn {
  days: PlanDay[];
  removeDay: (dayId: string) => void;
  addItem: (dayId: string, payload: AddItemPayload) => Promise<PlanItem>;
  removeItem: (dayId: string, itemId: string) => void;
  updateItemNotes: (dayId: string, itemId: string, notes: string | null) => void;
  reorderItems: (entries: ReorderEntry[]) => Promise<PlanItem[]>;
  updateDayNotes: (dayId: string, notes: string | null) => Promise<PlanDay>;
  isLoading: boolean;
  role: PlanRole;
  connectionStatus: ConnectionStatus;
  /** Live Yjs doc for the current plan room. Null until the auth token is
   * resolved and the Hocuspocus provider has been created. Consumers that
   * need to read or write Yjs state directly (e.g. plan-meta broadcast)
   * should guard on null. */
  doc: Y.Doc | null;
  /** The Hocuspocus provider — exposed so the awareness layer can publish
   * presence + typing state. Null until the websocket session is up. */
  provider: HocuspocusProvider | null;
  /** Has the IndexedDB-backed Y.Doc state finished hydrating into the
   * in-memory CRDT. Components that want to fall back to the cached doc
   * when offline (no Hocuspocus sync) gate on this in addition to
   * `connectionStatus`. */
  localLoaded: boolean;
}

type DaysCache = PlanDay[];

function planDaysKey(planId: string): readonly ["plan-itinerary", string] {
  return ["plan-itinerary", planId] as const;
}

function patchDays(
  cache: DaysCache | undefined,
  updater: (days: DaysCache) => DaysCache,
): DaysCache {
  return updater(cache ? [...cache] : []);
}

export function usePlanItinerary({
  planId,
  initialDays,
  role,
}: UsePlanItineraryOptions): UsePlanItineraryReturn {
  const queryClient = useQueryClient();
  const queryKey = planDaysKey(planId);

  // Token grab — Yjs needs it for the websocket auth handshake. The hook
  // re-runs once the session resolves; in the meantime the doc stays null
  // and the hook serves items from initialDays.
  const [token, setToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setToken(data.session?.access_token ?? null);
      setCurrentUserId(data.session?.user?.id ?? null);
    });

    // Supabase auto-refreshes the access token roughly 60s before expiry and
    // emits TOKEN_REFRESHED. We surface the new token to React state so the
    // useYDoc effect tears down the stale Hocuspocus provider and reconnects
    // with a fresh JWT — without this the WebSocket would keep getting 403'd
    // by /internal/collab/authorize once the original token expires.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      setToken(session?.access_token ?? null);
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [planId]);

  const { doc, provider, status: connectionStatus, isSynced, localLoaded } = useYDoc({
    planId,
    token,
    initialRole: role,
  });

  const daysQuery = useQuery<DaysCache>({
    queryKey,
    queryFn: () => apiGetDays(planId),
    initialData: initialDays,
    staleTime: 5_000,
    // Persist so a cold offline open of the plan can render the day skeleton
    // (id, day_number, date, title) before Yjs hydrates from IndexedDB.
    meta: { persist: true },
  });

  const restDays = useMemo(() => daysQuery.data ?? [], [daysQuery.data]);
  const allItems = useYAllItems(doc);
  const allNotes = useYAllDayNotes(doc);

  const days: PlanDay[] = useMemo(() => {
    // Use Yjs as soon as the doc has *any* trustworthy state: either the
    // websocket has confirmed first sync (`isSynced`) OR IndexedDB has
    // hydrated cached local state (`localLoaded`). Before either, fall back
    // to the REST snapshot so the SSR-rendered view survives the first paint.
    //
    // Gating on `isSynced` alone hid the user's offline edits — when the
    // websocket couldn't connect, `isSynced` stayed false, and the UI showed
    // restDays even though the offline edits were sitting in the Y.Doc and
    // IndexedDB. The reconnect then "revealed" the merged Yjs state all at
    // once, which looked like the online user had won.
    if (!doc || (!isSynced && !localLoaded)) return restDays;
    // Items + day-notes come from the doc; the rest of each day (id,
    // day_number, date, title) stays REST-driven.
    return restDays.map((day) => {
      // `in` distinguishes "Yjs explicitly set notes (possibly to '')" from
      // "Yjs has never seen this day" — the latter falls back to REST so
      // SSR-rendered notes survive the first client paint.
      const yNotes = day.id in allNotes ? allNotes[day.id] : null;
      return {
        ...day,
        items: allItems[day.id]
          ? allItems[day.id].map((item) => ({ ...item, plan_id: planId }))
          : day.items.map((item) => ({ ...item, plan_id: planId })),
        notes: yNotes !== null ? yNotes : day.notes ?? null,
      };
    });
  }, [doc, isSynced, localLoaded, restDays, allItems, allNotes, planId]);

  const removeDayMutation = useMutation({
    mutationFn: (dayId: string) => apiRemoveDay(planId, dayId),
    onMutate: async (dayId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<DaysCache>(queryKey);
      queryClient.setQueryData<DaysCache>(queryKey, (cache) =>
        patchDays(cache, (prev) => prev.filter((day) => day.id !== dayId)),
      );
      // Drop any Yjs content scoped to this day so the materializer doesn't
      // try to upsert items pointing at a now-deleted plan_days row.
      if (doc) yClearDayContent(doc, dayId);
      return { previous };
    },
    onError: (_err, _dayId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });

  function handleRemoveDay(dayId: string): void {
    if (role === "viewer") return;
    removeDayMutation.mutate(dayId);
  }

  const isViewer = role === "viewer";

  const addItem = useCallback(
    async (dayId: string, payload: AddItemPayload): Promise<PlanItem> => {
      if (isViewer) throw new Error("Viewers can't add items");
      if (!doc) throw new Error("Collab connection not ready yet");
      const day = restDays.find((entry) => entry.id === dayId);
      const destinationFallback = day
        ? day.items.find((item) => item.destination_id)?.destination_id ?? null
        : null;
      return yAddItem(doc, dayId, payload, {
        addedBy: currentUserId,
        destinationFallback,
      });
    },
    [doc, restDays, currentUserId, isViewer],
  );

  const removeItem = useCallback(
    (_dayId: string, itemId: string) => {
      if (isViewer || !doc) return;
      yRemoveItem(doc, itemId);
    },
    [doc, isViewer],
  );

  const updateItemNotes = useCallback(
    (_dayId: string, itemId: string, notes: string | null) => {
      if (isViewer || !doc) return;
      yUpdateItemNotes(doc, itemId, notes);
    },
    [doc, isViewer],
  );

  const reorderItems = useCallback(
    async (entries: ReorderEntry[]): Promise<PlanItem[]> => {
      if (isViewer || !doc) return [];
      yReorderItems(doc, entries);
      return entries.map((entry) => ({
        id: entry.id,
        plan_id: planId,
        day_id: entry.day_id,
        sort_key: entry.sort_key,
        destination_id: entry.destination_id ?? null,
      }) as unknown as PlanItem);
    },
    [doc, planId, isViewer],
  );

  const updateDayNotes = useCallback(
    async (dayId: string, notes: string | null): Promise<PlanDay> => {
      if (!isViewer && doc) ySetDayNotes(doc, dayId, notes);
      const day = restDays.find((entry) => entry.id === dayId);
      return { ...(day as PlanDay), notes };
    },
    [doc, restDays, isViewer],
  );

  return {
    days,
    removeDay: handleRemoveDay,
    addItem,
    removeItem,
    updateItemNotes,
    reorderItems,
    updateDayNotes,
    isLoading: removeDayMutation.isPending,
    role,
    connectionStatus,
    doc,
    provider,
    localLoaded,
  };
}
