import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { getUsOpenExecutionContext } from '@/lib/mbaiUsOpenConfig'
import {
  fetchUsOpenSnapshot,
  getUsOpenConfig,
  queueUsOpenPost,
} from '@/lib/mbaiUsOpenPosting'

export const dynamic = 'force-dynamic'

const getSecret = () => process.env.BCNEWS_CRON_SECRET || process.env.X_CRON_SECRET || process.env.CRON_SECRET

export async function POST(request: Request) {
  try {
    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const config = getUsOpenConfig()
    if (!config.enabled) {
      return NextResponse.json({ ok: true, queued: false, reason: 'skipped_mbai_us_open_disabled', config })
    }

    const execution = getUsOpenExecutionContext()
    if (!execution.shouldRun) {
      return NextResponse.json({
        ok: true,
        queued: false,
        reason: execution.isHoliday ? 'skipped_us_equity_holiday' : 'skipped_outside_us_open_window',
        event_type: 'mbai_us_open',
        execution,
        config,
      })
    }

    const snapshot = await fetchUsOpenSnapshot(fetch, execution.dateKey)
    const client = createSupabaseServerClient()
    const queued = await queueUsOpenPost(client, snapshot)
    return NextResponse.json({
      ok: true,
      queued: queued.queued,
      reason: queued.reason,
      event_type: 'mbai_us_open',
      date_key: execution.dateKey,
      dedupe_key: queued.dedupeKey,
      target_channel: config.targetChannel,
      post_text: queued.postText,
      execution,
      config,
    })
  } catch (error) {
    const detail = String(error)
    if (detail.includes('us_open_stale_market_data') || detail.includes('naver_market_not_closed')) {
      return NextResponse.json({
        ok: true,
        queued: false,
        reason: 'skipped_us_open_stale_data',
        event_type: 'mbai_us_open',
      })
    }
    console.error('POST /api/jobs/mbai-us-open failed', error)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
