import 'dotenv/config'
import fs from 'node:fs'
import postgres from 'postgres'

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) throw new Error('Missing DATABASE_URL')

const sql = postgres(DB_URL, { ssl: 'require', max: 1 })

try {
  const script = fs.readFileSync(new URL('./disable_old_sources.sql', import.meta.url), 'utf8')
  await sql.unsafe(script)

  const [{ total, enabled }] = await sql`
    select count(*)::int as total,
           sum(case when enabled then 1 else 0 end)::int as enabled
    from public.sources
  `

  console.log(JSON.stringify({ ok: true, total, enabled }))
} finally {
  await sql.end()
}
