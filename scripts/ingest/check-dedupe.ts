import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

function getRequired(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

async function main(): Promise<void> {
  const hash = process.argv[2]
  if (!hash) {
    console.error('Usage: tsx scripts/ingest/check-dedupe.ts <sha256_hash>')
    process.exit(1)
  }

  const url = getRequired('VITE_SUPABASE_URL')
  const serviceKey = getRequired('SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, serviceKey)

  // NOTE: If your table name differs, do NOT guess. Print guidance and exit.
  const { data, error } = await supabase
    .from('source_materials')
    .select('id, source_hash')
    .eq('source_hash', hash)
    .limit(1)

  if (error) throw new Error(error.message)

  console.log(JSON.stringify({ exists: (data?.length ?? 0) > 0, row: data?.[0] ?? null }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
