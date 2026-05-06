import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import AppShell from "@/components/layout/AppShell";
import { createClient } from "@/lib/supabase/server";
import { getProfileChrome } from "@/lib/supabase/profile";

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
  title: "Ajmo",
  description: "Collaborative, AI-powered travel planning.",
};

const themeBootstrapScript = `(function(){try{var s=window.localStorage.getItem("ajmo-theme");var t=(s==="light"||s==="dark"||s==="system")?s:"system";var r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var e=document.documentElement;e.classList.remove("light","dark");e.classList.add(r);e.style.colorScheme=r;}catch(_){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  // Middleware already validates the session against the auth server on every request.
  // getSession() reads the (validated) cookie locally — no extra auth-server roundtrip.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const profile = user ? await getProfileChrome(supabase, user.id) : null;
  const displayName = profile?.displayName ?? null;
  const avatarUrl = profile?.avatarUrl ?? null;
  const username = profile?.username ?? null;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}>
        <Providers>
          <AppShell
            authenticated={Boolean(user)}
            userEmail={user?.email ?? null}
            userDisplayName={displayName}
            userAvatarUrl={avatarUrl}
            userUsername={username}
          >
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
