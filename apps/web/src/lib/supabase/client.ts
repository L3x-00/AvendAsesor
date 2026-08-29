'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getPublicSupabaseConfig } from './config';

export function createBrowserSupabaseClient() {
  const { anonKey, url } = getPublicSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  return createBrowserClient(url, anonKey);
}
