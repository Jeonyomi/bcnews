import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN
const MAX_SENDS_PER_RUN = Number.parseInt(process.env.CHANNEL_SEND_MAX_PER_RUN || '5', 10) || 5
const SENDING_STALE_MINUTES = Number.parseInt(process.env.CHANNEL_SENDING_STALE_MINUTES || '15', 10) || 15

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
if (!TG_BOT_TOKEN) throw new Error('Missing TG_BOT_TOKEN/TELEGRAM_BOT_TOKEN')

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const sendTelegramMessage = async (text, chatId) => {
  const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.ok) {
    throw new Error(`telegram_send_failed: ${payload?.description || response.statusText}`)
  }

  return {
    messageId: Number(payload.result?.message_id || 0),
    chatId: String(payload.result?.chat?.id || chatId),
  }
}

async function main() {
  const staleBefore = new Date(Date.now() - SENDING_STALE_MINUTES * 60 * 1000).toISOString()
  const { data: stale } = await db
    .from('channel_posts')
    .select('id,lane,dedupe_key,article_url,updated_at,created_at')
    .eq('status', 'sending')
    .lt('updated_at', staleBefore)
    .order('updated_at', { ascending: true })
    .limit(50)

  let recovered = 0
  let recoveredSkippedDuplicate = 0
  for (const row of stale || []) {
    const { data: dup } = await db
      .from('channel_posts')
      .select('id')
      .eq('lane', String(row.lane || 'breaking'))
      .eq('status', 'posted')
      .or(`dedupe_key.eq.${String(row.dedupe_key || '')},article_url.eq.${String(row.article_url || '')}`)
      .neq('id', row.id)
      .limit(1)
      .maybeSingle()

    if (dup?.id) {
      await db.from('channel_posts').update({ status: 'skipped', updated_at: new Date().toISOString(), reason: 'skipped_duplicate' }).eq('id', row.id).eq('status', 'sending')
      recoveredSkippedDuplicate += 1
      continue
    }

    await db.from('channel_posts').update({
      status: 'pending',
      updated_at: new Date().toISOString(),
      reason: `recovered_stale_sending:${String(row.updated_at || row.created_at || '')}`.slice(0, 180),
    }).eq('id', row.id).eq('status', 'sending')
    recovered += 1
  }

  const { data: pending, error } = await db
    .from('channel_posts')
    .select('id,lane,dedupe_key,article_url,post_text,target_channel')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_SENDS_PER_RUN)

  if (error) throw error

  let posted = 0
  let failed = 0
  let skipped = 0

  for (const row of pending || []) {
    const { data: claim } = await db
      .from('channel_posts')
      .update({ status: 'sending', updated_at: new Date().toISOString(), reason: 'sending_worker' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!claim?.id) continue

    const { data: dup } = await db
      .from('channel_posts')
      .select('id')
      .eq('lane', String(row.lane || 'breaking'))
      .eq('status', 'posted')
      .or(`dedupe_key.eq.${String(row.dedupe_key || '')},article_url.eq.${String(row.article_url || '')}`)
      .neq('id', row.id)
      .limit(1)
      .maybeSingle()

    if (dup?.id) {
      await db.from('channel_posts').update({ status: 'skipped', updated_at: new Date().toISOString(), reason: 'skipped_duplicate' }).eq('id', row.id)
      skipped += 1
      continue
    }

    try {
      const sent = await sendTelegramMessage(String(row.post_text || ''), String(row.target_channel || ''))
      await db.from('channel_posts').update({
        status: 'posted',
        updated_at: new Date().toISOString(),
        posted_at: new Date().toISOString(),
        telegram_message_id: sent.messageId,
        telegram_chat_id: sent.chatId,
        reason: 'posted_auto',
      }).eq('id', row.id).eq('status', 'sending')
      posted += 1
    } catch (e) {
      await db.from('channel_posts').update({
        status: 'failed',
        updated_at: new Date().toISOString(),
        reason: `failed_send:${String(e?.message || e)}`.slice(0, 180),
      }).eq('id', row.id)
      failed += 1
    }
  }

  console.log(JSON.stringify({ ok: true, stale_threshold_minutes: SENDING_STALE_MINUTES, recovery: { scanned: (stale || []).length, recovered, skipped_duplicate: recoveredSkippedDuplicate }, scanned: (pending || []).length, posted, failed, skipped }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
