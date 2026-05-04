import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import AppShell from "@/components/layout/AppShell";
import { createClient } from "@/lib/supabase/server";

import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ajmo — plan trips together",
  description: "Collaborative, AI-assisted travel planning.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = (user?.user_metadata?.display_name as string | undefined) ?? null;
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? null;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}
      >
        <Providers>
          <AppShell
            authenticated={Boolean(user)}
            userEmail={user?.email ?? null}
            userDisplayName={displayName}
            userAvatarUrl={avatarUrl}
          >
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
