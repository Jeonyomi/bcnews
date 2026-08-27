import fs from 'node:fs'
import postgres from 'postgres'

const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
if (!url) throw new Error('Missing DATABASE_URL or SUPABASE_DB_URL')

const sql = postgres(url, { max: 1 })
const ddl = fs.readFileSync('migrations/008_mbai_breaking_bridge_queue.sql', 'utf8')
await sql.unsafe(ddl)
console.log('Applied migration 008_mbai_breaking_bridge_queue.sql')
await sql.end()
