import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Hardcoded external Supabase credentials to bypass Lovable Cloud override
// Project: jrudoteduleeytotmuoy
const EXTERNAL_SUPABASE_URL = 'https://jrudoteduleeytotmuoy.supabase.co';
const EXTERNAL_SUPABASE_KEY = 'sb_publishable_ioViVyQWMWbEenbAlFwO7w_Xfrt6kuZ';

// Main client — talks to the external DB for data, auth, storage
export const supabase = createClient<Database>(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_KEY, {
    auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

// Edge-function helper — calls functions deployed on Lovable Cloud
// passing the external-project auth token so edge functions can verify the user
const CLOUD_FUNCTIONS_URL = 'https://mhwofcvmwfsvblsbfgvc.supabase.co/functions/v1';

export async function invokeEdgeFunction<T = unknown>(
    name: string,
    options: { body?: unknown } = {},
): Promise<{ data: T | null; error: Error | null }> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'apikey': CLOUD_KEY,
        };
        if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const res = await fetch(`${CLOUD_FUNCTIONS_URL}/${name}`, {
            method: 'POST',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        const data = await res.json();
        if (!res.ok) {
            return { data: null, error: new Error(data.error || `Edge function error: ${res.status}`) };
        }
        return { data: data as T, error: null };
    } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
}

const CLOUD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1od29mY3Ztd2ZzdmJsc2JmZ3ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODMxNzgsImV4cCI6MjA4NDI1OTE3OH0.3p56D3OGd3nMN2vP8oPzd3vC0oXshkfDyZmJLF2hyTo';