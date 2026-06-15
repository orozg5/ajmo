"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";

import { createClient } from "@/lib/supabase/client";
import { getProfileChrome, type ProfileChrome } from "@/lib/supabase/profile";
import type { PlanRole } from "@/lib/api";
import type { AwarenessUser } from "@/lib/yjs/schema";

export interface PlanCollabValue {
  planId: string;
  doc: Y.Doc | null;
  provider: HocuspocusProvider | null;
  role: PlanRole;
  currentUserId: string | null;
  currentUser: AwarenessUser | null;
}

const Context = createContext<PlanCollabValue | null>(null);

interface ProviderProps {
  planId: string;
  doc: Y.Doc | null;
  provider: HocuspocusProvider | null;
  role: PlanRole;
  children: React.ReactNode;
}

/**
 * Mounted once high in the plan tree (PlanWorkspace). Exposes the live Yjs
 * doc + provider plus the connected user's identity, which `ItemLike`,
 * `ItemRating`, `CommentsSheet`, and the awareness publisher all consume.
 */
export function PlanCollabProvider({
  planId,
  doc,
  provider,
  role,
  children,
}: ProviderProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileChrome | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (cancelled) return;
      if (!user) {
        setCurrentUserId(null);
        setProfile(null);
        return;
      }
      setCurrentUserId(user.id);
      try {
        const chrome = await getProfileChrome(supabase, user.id);
        if (!cancelled) setProfile(chrome);
      } catch {
        if (!cancelled) setProfile(null);
      }
    }

    void load();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      setCurrentUserId(session?.user?.id ?? null);
      if (!session?.user) setProfile(null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const currentUser: AwarenessUser | null = useMemo(() => {
    if (!currentUserId) return null;
    return {
      id: currentUserId,
      displayName: profile?.displayName ?? null,
      username: profile?.username ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    };
  }, [currentUserId, profile]);

  const value: PlanCollabValue = useMemo(
    () => ({ planId, doc, provider, role, currentUserId, currentUser }),
    [planId, doc, provider, role, currentUserId, currentUser],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePlanCollab(): PlanCollabValue {
  const value = useContext(Context);
  if (!value) {
    throw new Error("usePlanCollab must be used inside <PlanCollabProvider>");
  }
  return value;
}

export function useOptionalPlanCollab(): PlanCollabValue | null {
  return useContext(Context);
}
