import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import Providers from "./providers";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/features/auth/components/LogoutButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ajmo",
  description: "Web application for collaborative travel planning",
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

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          {user && (
            <header className="border-b px-6 py-3 flex items-center justify-between">
              <span className="text-sm font-medium">Ajmo</span>
              <LogoutButton />
            </header>
          )}
          {children}
        </Providers>
      </body>
    </html>
  );
}
