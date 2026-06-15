import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cache the browser Supabase client in module scope so every caller in the
// same tab shares one SupabaseClient — and therefore one GoTrueClient. Two
// instances each take a separate waiter on the `lock:sb-…-auth-token`
// navigator lock; a concurrent getUser() + getSession() across instances
// times out and steals the lock, surfacing as NavigatorLockAcquireTimeoutError
// + AbortError in the console and aborting whichever auth call lost the race.
// Sharing the instance lets the in-process GoTrueClient serialize calls
// itself with no cross-instance contention. The cache is per-module and
// can't leak across tabs.
let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return browserClient;
}
