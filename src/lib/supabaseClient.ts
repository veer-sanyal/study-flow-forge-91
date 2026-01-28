import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'
import { getPublicEnv } from '@/lib/env'

export function makeSupabaseClient() {
  const env = getPublicEnv()
  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey)
}
