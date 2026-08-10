export interface PublicSupabaseConfig {
  anonKey: string;
  url: string;
}

export function getPublicSupabaseConfig(
  environment: Record<string, string | undefined> = process.env,
): PublicSupabaseConfig {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase public configuration is incomplete.');
  }

  return { anonKey, url };
}
