/**
 * External Supabase project configuration for edge functions.
 *
 * The Lovable Cloud env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) point to
 * the internal Cloud project.  We override them here so every edge function
 * talks to the user's own Supabase instance instead.
 */

// Use standard SUPABASE_URL if available (automatic in Edge Runtime), otherwise fallback to hardcoded
export const EXTERNAL_SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://jrudoteduleeytotmuoy.supabase.co";

export function getExternalServiceRoleKey(): string {
  // Try standard service role key first (automatic in Edge Runtime)
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY secret");
  return key;
}

export function getExternalAnonKey(): string {
  // Try standard anon key first (automatic in Edge Runtime)
  const key = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY");
  if (!key) {
    // Fallback to the previously hardcoded key if env vars are missing (though unlikely in prod)
    return "sb_publishable_ioViVyQWMWbEenbAlFwO7w_Xfrt6kuZ";
  }
  return key;
}
