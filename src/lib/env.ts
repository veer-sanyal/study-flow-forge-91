export type PublicEnv = {
  supabaseUrl: string
  supabasePublishableKey: string
  supabaseProjectId?: string
  appUrl?: string
}

export function getPublicEnv(): PublicEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const supabaseProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID
  const appUrl = import.meta.env.VITE_APP_URL

  if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL')
  if (!supabasePublishableKey) throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY')

  return { supabaseUrl, supabasePublishableKey, supabaseProjectId, appUrl }
}
