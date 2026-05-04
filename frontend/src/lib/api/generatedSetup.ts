"use client";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { client } from "./generated/client.gen";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

if (API_URL) {
  client.setConfig({ baseUrl: API_URL });
}

client.interceptors.request.use(async (request) => {
  if (typeof window === "undefined") return request;
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    request.headers.set("Authorization", `Bearer ${token}`);
  }
  return request;
});
