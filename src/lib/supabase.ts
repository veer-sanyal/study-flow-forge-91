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

// Edge-function helper — calls functions deployed on the External Supabase Project
// We must use the external project URL and Anon Key for these calls to match the project
// where the functions are actually deployed.
export async function invokeEdgeFunction<T = unknown>(
    name: string,
    options: { body?: unknown } = {},
): Promise<{ data: T | null; error: Error | null }> {
    try {
        const { data: { session } } = await supabase.auth.getSession();

        // Use the external Supabase URL for functions
        // Format: https://<project-ref>.supabase.co/functions/v1/<function-name>
        const functionsUrl = `${EXTERNAL_SUPABASE_URL}/functions/v1/${name}`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'apikey': EXTERNAL_SUPABASE_KEY, // Use the external project's anon key
        };

        if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const res = await fetch(functionsUrl, {
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
