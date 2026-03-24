import { NextResponse } from 'next/server'
import { err } from '@/lib/dashboardApi'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import { claimPendingChannelPost, recoverStaleSendingRows, sendTelegramMessage, SENDING_STALE_MINUTES } from '@/lib/channelPosting'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

const MAX_SENDS_PER_RUN = Number.parseInt(process.env.CHANNEL_SEND_MAX_PER_RUN || '5', 10) || 5

const getSecret = () =>
  process.env.X_CRON_SECRET || process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET

export async function POST(request: Request) {
  try {
    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json(err('unauthorized'), { status: 401 })
    }

    const client = createSupabaseServerClient()
    const recovered = await recoverStaleSendingRows(client)
    const { data: pending, error } = await client
      .from('channel_posts')
      .select('id,status,lane,dedupe_key,article_url,post_text,target_channel')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_SENDS_PER_RUN)

    if (error) throw error

    let claimed = 0
    let posted = 0
    let failed = 0
    let skipped = 0

    for (const row of pending || []) {
      const claim = await claimPendingChannelPost(client, Number(row.id))
      if (!claim?.id) continue
      claimed += 1

      const { data: alreadyPosted } = await client
        .from('channel_posts')
        .select('id')
        .eq('lane', String(row.lane || 'breaking'))
        .eq('status', 'posted')
        .or(`dedupe_key.eq.${String(row.dedupe_key || '')},article_url.eq.${String(row.article_url || '')}`)
        .neq('id', Number(row.id))
        .limit(1)
        .maybeSingle()

      if (alreadyPosted?.id) {
        await client
          .from('channel_posts')
          .update({
            status: 'skipped',
            updated_at: new Date().toISOString(),
            reason: CHANNEL_POST_REASONS.SKIPPED_DUPLICATE,
          })
          .eq('id', Number(row.id))
        skipped += 1
        continue
      }

      try {
        const sent = await sendTelegramMessage(String(row.post_text || ''), String(row.target_channel || ''))
        const { error: updateError } = await client
          .from('channel_posts')
          .update({
            status: 'posted',
            updated_at: new Date().toISOString(),
            posted_at: new Date().toISOString(),
            telegram_message_id: sent.messageId,
            telegram_chat_id: sent.chatId,
            reason: CHANNEL_POST_REASONS.POSTED_AUTO,
          })
          .eq('id', Number(row.id))
          .eq('status', 'sending')

        if (updateError) throw updateError
        posted += 1
      } catch (sendErr: any) {
        const failReason = `failed_send:${String(sendErr?.message || sendErr)}`.slice(0, 180)
        await client
          .from('channel_posts')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
            reason: failReason,
          })
          .eq('id', Number(row.id))
        failed += 1
      }
    }

    return NextResponse.json({ ok: true, stale_threshold_minutes: SENDING_STALE_MINUTES, recovery: recovered, scanned: (pending || []).length, claimed, posted, failed, skipped })
  } catch (error) {
    console.error('POST /api/jobs/send-pending failed', error)
    return NextResponse.json(err(`send_pending_error: ${String(error)}`), { status: 500 })
  }
}
