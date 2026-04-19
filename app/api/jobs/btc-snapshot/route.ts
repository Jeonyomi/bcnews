import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import {
  BTC_SNAPSHOT_LANE,
  fetchBtcSnapshotPrice,
  getBtcSnapshotConfig,
  queueHourlyBtcSnapshotPost,
} from '@/lib/btcSnapshotPosting'

export const dynamic = 'force-dynamic'

const getSecret = () =>
  process.env.X_CRON_SECRET || process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET

const isTargetMinute = (postMinute: number, now = new Date()) => {
  const minute = now.getUTCMinutes()
  return minute >= postMinute && minute < postMinute + 5
}

export async function POST(request: Request) {
  try {
    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const config = getBtcSnapshotConfig()
    if (!config.enabled) {
      return NextResponse.json({ ok: true, queued: false, reason: CHANNEL_POST_REASONS.SKIPPED_BTC_SNAPSHOT_DISABLED, config })
    }

    const client = createSupabaseServerClient()
    const observed = await fetchBtcSnapshotPrice()

    const { data: latestPostedHourly } = await client
      .from('channel_posts')
      .select('id,article_url,posted_at,created_at,dedupe_key')
      .eq('lane', BTC_SNAPSHOT_LANE)
      .eq('status', 'posted')
      .like('dedupe_key', `btc_snapshot_hourly:${config.symbol}:%`)
      .order('posted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let previousObservedPrice: number | null = null
    try {
      const articleUrl = String(latestPostedHourly?.article_url || '')
      if (articleUrl) {
        const observedValue = Number(new URL(articleUrl).searchParams.get('observed'))
        previousObservedPrice = Number.isFinite(observedValue) ? observedValue : null
      }
    } catch {}

    const direction: 'up' | 'down' | 'flat' = previousObservedPrice == null
      ? 'flat'
      : observed.price > previousObservedPrice
        ? 'up'
        : observed.price < previousObservedPrice
          ? 'down'
          : 'flat'

    const queued = await queueHourlyBtcSnapshotPost(client, {
      observedPrice: observed.price,
      fetchedAt: observed.fetchedAt,
      direction,
    })

    return NextResponse.json({
      ok: true,
      queued: queued.queued,
      reason: queued.reason,
      event_type: 'hourly_forced',
      direction,
      observed_price: observed.price,
      dedupe_key: queued.dedupeKey,
      post_text: queued.postText,
      target_channel: config.targetChannel,
      config,
    })
  } catch (error) {
    console.error('POST /api/jobs/btc-snapshot failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
