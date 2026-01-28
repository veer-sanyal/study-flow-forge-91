import * as fs from 'node:fs'
import * as path from 'node:path'

type Check = { name: string; ok: boolean }

function exists(p: string): boolean { return fs.existsSync(p) }

function main(): void {
  const root = process.cwd()
  const checks: Check[] = [
    { name: 'package.json exists', ok: exists(path.join(root, 'package.json')) },
    { name: 'vite.config.ts exists', ok: exists(path.join(root, 'vite.config.ts')) },
    { name: 'src/ exists', ok: exists(path.join(root, 'src')) },
    { name: 'supabase/ exists', ok: exists(path.join(root, 'supabase')) },
    { name: '.env.example exists', ok: exists(path.join(root, '.env.example')) },
    { name: '.claude/ exists', ok: exists(path.join(root, '.claude')) },
    { name: 'blueprints/ exists', ok: exists(path.join(root, 'blueprints')) },
    { name: 'scripts/ exists', ok: exists(path.join(root, 'scripts')) },
  ]

  console.log('study-flow-forge-91 — Doctor Report\n')
  for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}`)
  if (checks.some(c => !c.ok)) process.exit(1)
}

main()
