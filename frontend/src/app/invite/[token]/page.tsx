import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  let result;
  let errorMessage: string | null = null;
  try {
    result = await acceptInvite(token, session.access_token);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Couldn't accept invite";
  }

  if (result) {
    // redirect throws NEXT_REDIRECT — must run outside the try/catch above.
    redirect(`/plans/${result.plan_id}`);
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-display-lg">Invite unavailable</h1>
      <p className="text-sm text-ink-subtle">{errorMessage ?? "Something went wrong."}</p>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
