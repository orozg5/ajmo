"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type LogoutButtonProps = {
  children?: ReactNode;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
  className?: string;
};

export default function LogoutButton({
  children,
  variant = "ghost",
  size = "sm",
  className,
}: LogoutButtonProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant={variant} size={size} onClick={handleLogout} className={`w-full justify-start ${className ?? ""}`}>
      {children ?? "Sign out"}
    </Button>
  );
}
