import pkg from '../node_modules/pg/lib/index.js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const { Client } = pkg

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '../.env')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const [k, ...v] = l.split('=')
      return [k.trim(), v.join('=').trim().replace(/^"|"$/g, '')]
    })
)

// Accept DATABASE_URL env var or build from components
const connectionString = process.env.DATABASE_URL || (() => {
  const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
  const password = process.env.DB_PASSWORD
  if (!password) {
    console.error(
      'Provide the database password:\n' +
      '  DB_PASSWORD=your_db_password node scripts/run-migration.mjs\n\n' +
      'Find it in: Supabase dashboard → Settings → Database → Connection string'
    )
    process.exit(1)
  }
  return `postgresql://postgres.${ref}:${password}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
})()

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

const migrationFile = process.argv[2] || 'migration-street-zones.sql'
const sql = readFileSync(resolve(__dir, migrationFile), 'utf8')
console.log(`Migration file: ${migrationFile}`)
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'))

console.log(`Connecting to Supabase...`)

try {
  await client.connect()
  console.log('Connected.\n')

  for (const stmt of statements) {
    await client.query(stmt)
    console.log(`✓ ${stmt.split('\n').find(l => l.trim()).slice(0, 70)}`)
  }

  console.log('\nMigration complete.')
} catch (e) {
  console.error('Migration failed:', e.message)
  process.exit(1)
} finally {
  await client.end()
}
