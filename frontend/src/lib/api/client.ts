import { createClient } from "@/lib/supabase/client";
import { createSseClient } from "@/lib/api/generated/core/serverSentEvents.gen";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function getBrowserToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  accessToken?: string | null,
): Promise<T> {
  const token = accessToken !== undefined ? accessToken : await getBrowserToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiSse<T>(
  path: string,
  onEvent: (name: string, data: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await getBrowserToken();
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let errorMessage: string | null = null;

  const { stream } = createSseClient<T>({
    url: `${API_URL}${path}`,
    method: "GET",
    headers,
    signal,
    sseMaxRetryAttempts: 1,
    onSseEvent: (ev) => {
      if (!ev.event) return;
      if (ev.event === "error") {
        const data = ev.data as { message?: string } | undefined;
        errorMessage = data?.message ?? "Stream failed";
        return;
      }
      onEvent(ev.event, ev.data as T);
    },
  });

  for await (const _chunk of stream) {
    // sink — events are delivered via onSseEvent above
  }

  if (errorMessage) throw new Error(errorMessage);
}
