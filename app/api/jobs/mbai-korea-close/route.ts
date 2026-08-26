import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import {
  fetchKoreaCloseSnapshot,
  getKoreaCloseConfig,
  queueKoreaClosePost,
} from '@/lib/mbaiKoreaClosePosting'

export const dynamic = 'force-dynamic'

const getSecret = () => process.env.X_CRON_SECRET || process.env.CRON_SECRET

export async function POST(request: Request) {
  try {
    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const config = getKoreaCloseConfig()
    if (!config.enabled) {
      return NextResponse.json({ ok: true, queued: false, reason: 'skipped_mbai_korea_close_disabled', config })
    }

    const snapshot = await fetchKoreaCloseSnapshot()
    const client = createSupabaseServerClient()
    const queued = await queueKoreaClosePost(client, snapshot)
    return NextResponse.json({
      ok: true,
      queued: queued.queued,
      reason: queued.reason,
      event_type: 'mbai_korea_close',
      date_key: snapshot.dateKey,
      dedupe_key: queued.dedupeKey,
      target_channel: config.targetChannel,
      post_text: queued.postText,
      config,
    })
  } catch (error) {
    const detail = String(error)
    if (detail.includes('naver_market_not_closed') || detail.includes('korea_market_date_mismatch')) {
      return NextResponse.json({
        ok: true,
        queued: false,
        reason: 'skipped_korea_market_closed_or_stale',
        event_type: 'mbai_korea_close',
      })
    }
    console.error('POST /api/jobs/mbai-korea-close failed', error)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
