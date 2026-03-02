import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') || 'pending'
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)))

    const client = createAdminClient()
    const { data, error } = await client
      .from('channel_posts')
      .select('id,created_at,status,lane,headline,headline_ko,source_name,article_url,tags,post_text,target_channel,target_admin,telegram_message_id,telegram_chat_id')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return NextResponse.json({ ok: true, data: data || [] })
  } catch (error) {
    console.error('GET /api/channel-posts failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const id = Number(body?.id)
    const action = String(body?.action || '')
    const approvedBy = String(body?.approvedBy || '@master_billybot')
    const telegramMessageId = body?.telegramMessageId != null ? Number(body.telegramMessageId) : null
    const telegramChatId = body?.telegramChatId ? String(body.telegramChatId) : null

    if (!Number.isFinite(id) || !['approve', 'skip'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
    }

    const status = action === 'approve' ? 'posted' : 'skipped'
    const client = createAdminClient()
    const patch: any = {
      status,
      updated_at: new Date().toISOString(),
      approved_by: approvedBy,
    }
    if (status === 'posted') {
      patch.posted_at = new Date().toISOString()
      if (Number.isFinite(telegramMessageId as number)) patch.telegram_message_id = telegramMessageId
      if (telegramChatId) patch.telegram_chat_id = telegramChatId
    }

    const { data, error } = await client
      .from('channel_posts')
      .update(patch)
      .eq('id', id)
      .select('id,status,posted_at,approved_by,telegram_message_id,telegram_chat_id')
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('PATCH /api/channel-posts failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
