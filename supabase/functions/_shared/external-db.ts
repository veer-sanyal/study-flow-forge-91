/**
 * External Supabase project configuration for edge functions.
 *
 * The Lovable Cloud env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) point to
 * the internal Cloud project.  We override them here so every edge function
 * talks to the user's own Supabase instance instead.
 */

export const EXTERNAL_SUPABASE_URL = "https://jrudoteduleeytotmuoy.supabase.co";

export function getExternalServiceRoleKey(): string {
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing EXTERNAL_SUPABASE_SERVICE_ROLE_KEY secret");
  return key;
}

export function getExternalAnonKey(): string {
  // Publishable key – safe to embed
  return "sb_publishable_ioViVyQWMWbEenbAlFwO7w_Xfrt6kuZ";
}
