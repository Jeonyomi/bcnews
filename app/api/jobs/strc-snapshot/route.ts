import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import {
  STRC_SNAPSHOT_LANE,
  fetchStrcSnapshotPrice,
  getStrcSnapshotConfig,
  queueHourlyStrcSnapshotPost,
} from '@/lib/strcSnapshotPosting'

export const dynamic = 'force-dynamic'

const getSecret = () =>
  process.env.X_CRON_SECRET || process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET

export async function POST(request: Request) {
  try {
    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const config = getStrcSnapshotConfig()
    if (!config.enabled) {
      return NextResponse.json({ ok: true, queued: false, reason: CHANNEL_POST_REASONS.SKIPPED_STRC_SNAPSHOT_DISABLED, config })
    }

    const client = createSupabaseServerClient()
    const observed = await fetchStrcSnapshotPrice()

    const { data: latestPostedHourly } = await client
      .from('channel_posts')
      .select('id,article_url,posted_at,created_at,dedupe_key')
      .eq('lane', STRC_SNAPSHOT_LANE)
      .eq('status', 'posted')
      .like('dedupe_key', `strc_snapshot_hourly:${config.symbol}:%`)
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

    const queued = await queueHourlyStrcSnapshotPost(client, {
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
    console.error('POST /api/jobs/strc-snapshot failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
