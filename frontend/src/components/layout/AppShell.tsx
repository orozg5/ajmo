import type { ReactNode } from "react";

import Header from "@/components/layout/Header";
import PageTransition from "@/components/layout/PageTransition";

type AppShellProps = {
  authenticated: boolean;
  userEmail?: string | null;
  userAvatarUrl?: string | null;
  userDisplayName?: string | null;
  userUsername?: string | null;
  sidebar?: ReactNode;
  children: ReactNode;
};

export default function AppShell({
  authenticated,
  userEmail,
  userAvatarUrl,
  userDisplayName,
  userUsername,
  sidebar,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-ink">
      <Header
        authenticated={authenticated}
        userEmail={userEmail}
        userAvatarUrl={userAvatarUrl}
        userDisplayName={userDisplayName}
        userUsername={userUsername}
      />
      <div className="flex w-full flex-1 gap-0 px-[clamp(1rem,3vw,3rem)]">
        {sidebar}
        <PageTransition>{children}</PageTransition>
      </div>
    </div>
  );
}
