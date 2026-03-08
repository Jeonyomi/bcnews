import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SENDING_STALE_MINUTES = Number.parseInt(process.env.CHANNEL_SENDING_STALE_MINUTES || '15', 10) || 15

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const staleBefore = new Date(Date.now() - SENDING_STALE_MINUTES * 60 * 1000).toISOString()

const count = async (status, stale = false) => {
  let q = db.from('channel_posts').select('id', { count: 'exact', head: true }).eq('status', status)
  if (stale) q = q.lt('updated_at', staleBefore)
  const res = await q
  return Number(res.count || 0)
}

async function main() {
  const [pending, sending, staleSending, failed] = await Promise.all([
    count('pending'),
    count('sending'),
    count('sending', true),
    count('failed'),
  ])

  const { data: sample } = await db
    .from('channel_posts')
    .select('id,status,updated_at,reason,dedupe_key,article_url')
    .eq('status', 'sending')
    .lt('updated_at', staleBefore)
    .order('updated_at', { ascending: true })
    .limit(10)

  console.log(JSON.stringify({
    ok: true,
    stale_threshold_minutes: SENDING_STALE_MINUTES,
    backlog: { pending, sending, stale_sending: staleSending, failed },
    stale_sample: sample || [],
  }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
