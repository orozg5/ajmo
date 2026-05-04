import { redirect } from "next/navigation";

import { listPlans, type Plan } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import DashboardSections from "@/features/plans/components/dashboard/DashboardSections";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [
    {
      data: { session },
    },
    {
      data: { user },
    },
  ] = await Promise.all([supabase.auth.getSession(), supabase.auth.getUser()]);

  if (!session || !user) {
    redirect("/login");
  }

  const token = session.access_token;
  const ownerPromise = listPlans("owner", token).catch(() => [] as Plan[]);
  const publicPromise = listPlans("public", token).catch(() => [] as Plan[]);

  const [initialOwnerPlans, initialPublicPlans] = await Promise.all([
    ownerPromise,
    publicPromise,
  ]);

  const metadataDisplayName =
    (user.user_metadata?.display_name as string | undefined) ?? null;
  const greetingName =
    metadataDisplayName?.split(" ")[0] ??
    user.email?.split("@")[0] ??
    null;
  const greeting = greetingName ? `Welcome back, ${greetingName}.` : "Where next?";

  return (
    <DashboardSections
      greeting={greeting}
      initialOwnerPlans={initialOwnerPlans}
      initialPublicPlans={initialPublicPlans}
    />
  );
}
