import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DB_URL = process.env.DATABASE_URL // Format: postgres://user:pass@host:port/db

if (!SUPABASE_URL) throw new Error('Missing env SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing env SUPABASE_SERVICE_ROLE_KEY')
if (!DB_URL) throw new Error('Missing env DATABASE_URL')

async function main() {
  console.log('Applying migration 001_extend_news_briefs.sql...')
  
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'migrations', '001_extend_news_briefs.sql'),
    'utf8'
  )

  const db = postgres(DB_URL, {
    ssl: 'require',
    max: 1
  })

  try {
    await db.unsafe(sql)
    console.log('Migration completed successfully')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

main().catch(console.error)