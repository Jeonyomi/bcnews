import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const TELEGRAM_BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || ''

const callTelegram = async (method: string, payload: object) => {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('missing_telegram_bot_token')
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await response.json().catch(() => ({} as any))
  if (!response.ok || !json?.ok) throw new Error(`telegram_${method}_failed: ${json?.description || response.statusText}`)
  return json
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const id = Number(body?.id)
    const mode = String(body?.mode || 'delete')
    const replacementText = String(body?.text || 'Retracted by admin')

    if (!Number.isFinite(id) || !['delete', 'edit'].includes(mode)) {
      return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
    }

    const client = createAdminClient()
    const { data: row, error } = await client
      .from('channel_posts')
      .select('id,status,telegram_message_id,telegram_chat_id,target_channel')
      .eq('id', id)
      .single()

    if (error) throw error
    if (!row?.telegram_message_id) return NextResponse.json({ ok: false, error: 'missing_telegram_message_id' }, { status: 400 })

    const chatId = row.telegram_chat_id || row.target_channel

    if (mode === 'delete') {
      await callTelegram('deleteMessage', { chat_id: chatId, message_id: row.telegram_message_id })
    } else {
      await callTelegram('editMessageText', {
        chat_id: chatId,
        message_id: row.telegram_message_id,
        text: replacementText,
      })
    }

    const { data: updated, error: updateErr } = await client
      .from('channel_posts')
      .update({
        status: 'skipped',
        updated_at: new Date().toISOString(),
        approved_by: 'retract',
      })
      .eq('id', id)
      .select('id,status,telegram_message_id,telegram_chat_id')
      .single()

    if (updateErr) throw updateErr
    return NextResponse.json({ ok: true, data: updated })
  } catch (error) {
    console.error('POST /api/channel-posts/retract failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
