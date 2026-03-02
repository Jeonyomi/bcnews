import fs from 'fs'
import postgres from 'postgres'
import 'dotenv/config'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Missing DATABASE_URL')
const sql = postgres(url, { max: 1 })
const ddl = fs.readFileSync('migrations/005_channel_posts_queue.sql','utf8')
await sql.unsafe(ddl)
console.log('migrate_005_ok')
await sql.end()
