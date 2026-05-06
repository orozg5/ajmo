import { redirect } from "next/navigation";

import { listPlans, type Plan } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { getProfileChrome } from "@/lib/supabase/profile";
import DashboardSections from "@/features/plans/components/dashboard/DashboardSections";

export default async function DashboardPage() {
  const supabase = await createClient();
  // Middleware validates against the auth server; getSession() is local-only.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const user = session.user;
  const token = session.access_token;
  const ownerPromise = listPlans("owner", token).catch(() => [] as Plan[]);
  const memberPromise = listPlans("member", token).catch(() => [] as Plan[]);
  const publicPromise = listPlans("public", token).catch(() => [] as Plan[]);
  const profilePromise = getProfileChrome(supabase, user.id);

  const [initialOwnerPlans, initialMemberPlans, initialPublicPlans, profile] = await Promise.all([
    ownerPromise,
    memberPromise,
    publicPromise,
    profilePromise,
  ]);

  const greetingName =
    profile.displayName?.split(" ")[0] ??
    user.email?.split("@")[0] ??
    null;

  return (
    <DashboardSections
      greetingName={greetingName}
      initialOwnerPlans={initialOwnerPlans}
      initialMemberPlans={initialMemberPlans}
      initialPublicPlans={initialPublicPlans}
    />
  );
}
