import Link from "next/link";
import { Settings, User as UserIcon, LogOut } from "lucide-react";

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
}: HeaderProps) {
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
                  <Avatar size="sm">
                    {userAvatarUrl ? <AvatarImage src={userAvatarUrl} alt="" /> : null}
                    <AvatarFallback>{initialsFor(userDisplayName, userEmail)}</AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1.5">
                <div className="px-2 py-1.5 text-xs text-ink-subtle">
                  {userDisplayName ?? userEmail ?? "Signed in"}
                </div>
                <div className="my-1 h-px bg-border" />
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                  <Link href="/settings/profile">
                    <UserIcon className="size-4" strokeWidth={1.5} />
                    Profile
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                  <Link href="/settings/preferences">
                    <Settings className="size-4" strokeWidth={1.5} />
                    Preferences
                  </Link>
                </Button>
                <div className="my-1 h-px bg-border" />
                <div className="px-1">
                  <LogoutButton>
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
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-subtle transition-colors hover:text-ink hover:bg-muted"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Sign up
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
