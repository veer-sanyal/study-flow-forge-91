import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Hardcoded external Supabase credentials to bypass Lovable Cloud override
// Project: jrudoteduleeytotmuoy
const EXTERNAL_SUPABASE_URL = 'https://jrudoteduleeytotmuoy.supabase.co';
const EXTERNAL_SUPABASE_KEY = 'sb_publishable_ioViVyQWMWbEenbAlFwO7w_Xfrt6kuZ';

export const supabase = createClient<Database>(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_KEY, {
    auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});
