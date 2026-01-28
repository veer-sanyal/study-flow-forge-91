import * as fs from 'node:fs'
import * as crypto from 'node:crypto'

function usage(): never {
  console.error('Usage: tsx scripts/ingest/hash-file.ts <file_path>')
  process.exit(1)
}

export function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2]
  if (!filePath) usage()
  process.stdout.write(sha256File(filePath))
}
