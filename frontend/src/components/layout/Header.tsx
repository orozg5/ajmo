import Link from "next/link";
import { Settings, LogOut } from "lucide-react";

import Logo from "@/components/brand/Logo";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import LogoutButton from "@/features/auth/components/LogoutButton";

type HeaderProps = {
  authenticated: boolean;
  userEmail?: string | null;
  userAvatarUrl?: string | null;
  userDisplayName?: string | null;
  userUsername?: string | null;
};

function initialsFor(name?: string | null, email?: string | null): string {
  const source = (name ?? email ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Header({
  authenticated,
  userEmail,
  userAvatarUrl,
  userDisplayName,
  userUsername,
}: HeaderProps) {
  const primaryName =
    userDisplayName ?? userUsername ?? userEmail?.split("@")[0] ?? "Signed in";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="flex h-16 w-full items-center justify-between gap-4 px-[clamp(1rem,3vw,3rem)]">
        <Logo />
        {authenticated ? (
          <nav className="flex items-center gap-2" aria-label="Primary">
            <Link
              href="/"
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-subtle transition-colors hover:text-ink hover:bg-muted"
            >
              Plans
            </Link>
            <ThemeToggle />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Open account menu"
                >
                  <Avatar size="default">
                    {userAvatarUrl ? <AvatarImage src={userAvatarUrl} alt="" /> : null}
                    <AvatarFallback>{initialsFor(primaryName, userEmail)}</AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 gap-0 p-0">
                <div className="flex items-center gap-3 px-3 py-3">
                  <Avatar size="default">
                    {userAvatarUrl ? <AvatarImage src={userAvatarUrl} alt="" /> : null}
                    <AvatarFallback>{initialsFor(primaryName, userEmail)}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-ink">{primaryName}</span>
                    {userEmail ? (
                      <span className="truncate text-xs text-ink-subtle">{userEmail}</span>
                    ) : null}
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div className="space-y-0.5 p-1.5">
                  <Button asChild variant="ghost" size="sm" className="h-9 w-full justify-start gap-2.5 px-2">
                    <Link href="/settings">
                      <Settings className="size-4" strokeWidth={1.5} />
                      Settings
                    </Link>
                  </Button>
                </div>
                <div className="h-px bg-border" />
                <div className="p-1.5">
                  <LogoutButton className="h-9 gap-2.5 px-2">
                    <LogOut className="size-4" strokeWidth={1.5} />
                    Log out
                  </LogoutButton>
                </div>
              </PopoverContent>
            </Popover>
          </nav>
        ) : (
          <nav className="flex items-center gap-2" aria-label="Primary">
            <ThemeToggle />
            <Link
              href="/login"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Sign in
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
