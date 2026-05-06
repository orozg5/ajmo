"use client";

import { useEffect, useState } from "react";

import { fetchTransitDirections, type TransitDirectionsResult } from "@/lib/api";
import { fetchOsrmRoute, type OsrmProfile } from "@/features/map/routing";
import { isAbortError } from "@/lib/utils";

export type SameDayMode = "walk" | "bike" | "drive" | "transit";

export interface SameDayModeOption {
  mode: SameDayMode;
  distanceMeters: number;
  durationSeconds: number;
  transitSummary?: string;
  geometry?: [number, number][];
}

export interface UseSameDayTransportOptionsArgs {
  src: { lat: number; lng: number } | null;
  dst: { lat: number; lng: number } | null;
}

export interface UseSameDayTransportOptionsReturn {
  walk: SameDayModeOption | null;
  bike: SameDayModeOption | null;
  drive: SameDayModeOption | null;
  transit: SameDayModeOption | null;
  isLoading: boolean;
}

interface State {
  walk: SameDayModeOption | null;
  bike: SameDayModeOption | null;
  drive: SameDayModeOption | null;
  transit: SameDayModeOption | null;
  isLoading: boolean;
}

const EMPTY_STATE: State = {
  walk: null,
  bike: null,
  drive: null,
  transit: null,
  isLoading: false,
};

const OSRM_PROFILES: { mode: SameDayMode; profile: OsrmProfile }[] = [
  { mode: "walk", profile: "foot" },
  { mode: "bike", profile: "bike" },
  { mode: "drive", profile: "driving" },
];

export function useSameDayTransportOptions({
  src,
  dst,
}: UseSameDayTransportOptionsArgs): UseSameDayTransportOptionsReturn {
  const [state, setState] = useState<State>(EMPTY_STATE);

  // Effect-driven fetch lifecycle. Source and destination are referenced via
  // their primitive coordinates so changing object identity (e.g. parent
  // re-render with same data) doesn't trigger a refetch.
  useEffect(() => {
    if (!src || !dst) {
      setState(EMPTY_STATE);
      return;
    }

    const controller = new AbortController();
    let pending = OSRM_PROFILES.length + 1;
    setState({ ...EMPTY_STATE, isLoading: true });

    // Each fetch resolves its own slot independently. Without this, a single
    // hung fetch (FOSSGIS frequently rate-limits or stalls) would gate the
    // whole bar behind Promise.allSettled and the spinner would never clear.
    const settleSlot = (mode: SameDayMode, option: SameDayModeOption | null) => {
      if (controller.signal.aborted) return;
      pending -= 1;
      const stillPending = pending;
      setState((prev) => {
        const next: State = { ...prev, [mode]: option };
        const hasAny = next.walk || next.bike || next.drive || next.transit;
        next.isLoading = stillPending > 0 && !hasAny;
        return next;
      });
    };

    for (const { mode, profile } of OSRM_PROFILES) {
      fetchOsrmRoute(src, dst, profile, controller.signal)
        .then((result) =>
          settleSlot(
            mode,
            result
              ? {
                  mode,
                  distanceMeters: result.distanceMeters,
                  durationSeconds: result.durationSeconds,
                }
              : null,
          ),
        )
        .catch((error) => {
          if (isAbortError(error)) return;
          settleSlot(mode, null);
        });
    }

    fetchTransitDirections(src, dst, controller.signal)
      .then((result: TransitDirectionsResult | null) =>
        settleSlot(
          "transit",
          result
            ? {
                mode: "transit",
                distanceMeters: result.distance_meters,
                durationSeconds: result.duration_seconds,
                transitSummary: result.transit_summary,
                geometry: result.geometry,
              }
            : null,
        ),
      )
      .catch((error) => {
        if (isAbortError(error)) return;
        settleSlot("transit", null);
      });

    return () => {
      controller.abort();
    };
    // We compare on primitive coordinates rather than `src`/`dst` object identity
    // so a parent rerender that produces a fresh object with the same lat/lng
    // doesn't kick off a new round of OSRM/Google calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src?.lat, src?.lng, dst?.lat, dst?.lng]);

  return state;
}
