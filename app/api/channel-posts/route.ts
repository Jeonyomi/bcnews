import { NextResponse } from 'next/server'
import { isChannelPostsAdmin, CHANNEL_POSTS_ADMIN_ACTOR } from '@/lib/channelPostsAdmin'
import { createAdminClient } from '@/lib/supabase'
import { SENDING_STALE_MINUTES } from '@/lib/channelPosting'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isChannelPostsAdmin(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  try {
    const url = new URL(request.url)
    const status = (url.searchParams.get('status') || '').trim()
    const debug = url.searchParams.get('debug') === '1'
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)))

    const client = createAdminClient()
    let query = client
      .from('channel_posts')
      .select('id,created_at,status,lane,headline,headline_ko,source_name,article_url,tags,post_text,target_channel,target_admin,telegram_message_id,telegram_chat_id,reason')

    if (status) query = query.eq('status', status)

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    if (debug) {
      let countQuery = client.from('channel_posts').select('id', { count: 'exact', head: true })
      if (status) countQuery = countQuery.eq('status', status)
      const counted = await countQuery
      const staleBefore = new Date(Date.now() - SENDING_STALE_MINUTES * 60 * 1000).toISOString()
      const [pendingCount, sendingCount, staleSendingCount, failedCount] = await Promise.all([
        client.from('channel_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        client.from('channel_posts').select('id', { count: 'exact', head: true }).eq('status', 'sending'),
        client.from('channel_posts').select('id', { count: 'exact', head: true }).eq('status', 'sending').lt('updated_at', staleBefore),
        client.from('channel_posts').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ])
      return NextResponse.json({ ok: true, data: data || [], meta: { status: status || 'all', count: counted.count || 0, stale_threshold_minutes: SENDING_STALE_MINUTES, backlog: { pending: pendingCount.count || 0, sending: sendingCount.count || 0, stale_sending: staleSendingCount.count || 0, failed: failedCount.count || 0 } } })
    }

    return NextResponse.json({ ok: true, data: data || [] })
  } catch (error) {
    console.error('GET /api/channel-posts failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  if (!isChannelPostsAdmin(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json().catch(() => ({}))
    const id = Number(body?.id)
    const action = String(body?.action || '')
    // Approval is an operator annotation, not proof of Telegram delivery.
    // Receipt fields and actor names supplied by the caller are never trusted.

    if (!Number.isFinite(id) || !['approve', 'skip'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
    }

    const status = action === 'approve' ? 'pending' : 'skipped'
    const client = createAdminClient()
    const patch = {
      status,
      updated_at: new Date().toISOString(),
      approved_by: CHANNEL_POSTS_ADMIN_ACTOR,
    }

    const { data, error } = await client
      .from('channel_posts')
      .update(patch)
      .eq('id', id)
      .eq('status', 'pending')
      .select('id,status,posted_at,approved_by,telegram_message_id,telegram_chat_id,reason')
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ ok: false, error: 'state_conflict' }, { status: 409 })
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('PATCH /api/channel-posts failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
