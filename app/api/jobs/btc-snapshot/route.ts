import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import {
  BTC_SNAPSHOT_LANE,
  buildBucketPrice,
  buildDirection,
  fetchBtcSnapshotPrice,
  getBtcSnapshotConfig,
  queueBtcSnapshotPost,
  queueForcedBtcSnapshotPost,
  recordBtcSnapshotBaseline,
} from '@/lib/btcSnapshotPosting'

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

    const config = getBtcSnapshotConfig()
    if (!config.enabled) {
      return NextResponse.json({ ok: true, queued: false, reason: CHANNEL_POST_REASONS.SKIPPED_BTC_SNAPSHOT_DISABLED, config })
    }

    const client = createSupabaseServerClient()
    const { data: latest } = await client
      .from('channel_posts')
      .select('id,created_at,lane,dedupe_key,reason')
      .eq('lane', BTC_SNAPSHOT_LANE)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latest?.created_at) {
      const ageSeconds = Math.floor((Date.now() - new Date(String(latest.created_at)).getTime()) / 1000)
      if (Number.isFinite(ageSeconds) && ageSeconds >= 0 && ageSeconds < config.runIntervalSeconds) {
        return NextResponse.json({
          ok: true,
          queued: false,
          reason: CHANNEL_POST_REASONS.SKIPPED_BTC_SNAPSHOT_INTERVAL_NOT_ELAPSED,
          next_check_in_seconds: Math.max(0, config.runIntervalSeconds - ageSeconds),
          config,
        })
      }
    }

    const observed = await fetchBtcSnapshotPrice()
    const bucketPrice = buildBucketPrice(observed.price, config.step)

    const { data: latestSnapshotRows, error: latestErr } = await client
      .from('channel_posts')
      .select('id,created_at,posted_at,dedupe_key,article_url,post_text,status')
      .eq('lane', BTC_SNAPSHOT_LANE)
      .order('created_at', { ascending: false })
      .limit(50)

    if (latestErr) throw latestErr

    const bucketRegex = new RegExp(`btc_snapshot:${config.symbol}:(up|down):(\d+)$`)
    const hourlyRegex = new RegExp(`btc_snapshot_hourly:${config.symbol}:(\d+):(\d+)$`)
    const baselineRegex = new RegExp(`btc_snapshot_baseline:${config.symbol}:(\d+)$`)
    const parsed = (latestSnapshotRows || []).map((row: any) => {
      const dedupeKey = String(row.dedupe_key || '')
      const base = {
        id: Number(row.id),
        created_at: String(row.created_at || ''),
        posted_at: String(row.posted_at || ''),
        status: String(row.status || ''),
        dedupeKey,
      }
      const match = dedupeKey.match(bucketRegex)
      if (match) {
        return {
          ...base,
          eventType: 'bucket' as const,
          direction: String(match[1]) as 'up' | 'down',
          bucketPrice: Number(match[2]),
        }
      }
      const hourlyMatch = dedupeKey.match(hourlyRegex)
      if (hourlyMatch) {
        return {
          ...base,
          eventType: 'hourly' as const,
          direction: 'flat' as const,
          bucketPrice: Number(hourlyMatch[1]),
          windowKey: Number(hourlyMatch[2]),
        }
      }
      const baselineMatch = dedupeKey.match(baselineRegex)
      if (baselineMatch) {
        return {
          ...base,
          eventType: 'baseline' as const,
          direction: 'flat' as const,
          bucketPrice: Number(baselineMatch[1]),
        }
      }
      return null
    }).filter(Boolean) as Array<{
      id: number
      created_at: string
      posted_at: string
      status: string
      dedupeKey: string
      eventType: 'bucket' | 'hourly' | 'baseline'
      direction: 'up' | 'down' | 'flat'
      bucketPrice: number
      windowKey?: number
    }>

    const latestSnapshot = parsed[0] || null
    if (!latestSnapshot) {
      const baseline = await recordBtcSnapshotBaseline(client, {
        bucketPrice,
        observedPrice: observed.price,
        fetchedAt: observed.fetchedAt,
      })
      return NextResponse.json({
        ok: true,
        queued: false,
        reason: CHANNEL_POST_REASONS.SKIPPED_BTC_SNAPSHOT_NO_BASELINE,
        baseline_recorded: baseline.recorded,
        baseline_bucket_price: bucketPrice,
        observed_price: observed.price,
        config,
      })
    }

    const latestPosted = parsed.find((row) => row.status === 'posted') || null
    const latestPostedAt = latestPosted?.posted_at || latestPosted?.created_at || ''
    const referenceAt = latestPostedAt || latestSnapshot.created_at
    const secondsSinceLastPosted = referenceAt
      ? Math.max(0, Math.floor((Date.now() - new Date(referenceAt).getTime()) / 1000))
      : Number.POSITIVE_INFINITY

    if (latestSnapshot.bucketPrice !== bucketPrice) {
      const direction = buildDirection(latestSnapshot.bucketPrice, bucketPrice)
      const queued = await queueBtcSnapshotPost(client, {
        bucketPrice,
        direction,
        observedPrice: observed.price,
        fetchedAt: observed.fetchedAt,
      })

      return NextResponse.json({
        ok: true,
        queued: queued.queued,
        reason: queued.reason,
        event_type: 'bucket',
        direction,
        observed_price: observed.price,
        bucket_price: bucketPrice,
        previous_bucket_price: latestSnapshot.bucketPrice,
        dedupe_key: queued.dedupeKey,
        post_text: queued.postText,
        target_channel: config.targetChannel,
        config,
      })
    }

    if (!config.forceEnabled) {
      return NextResponse.json({
        ok: true,
        queued: false,
        reason: CHANNEL_POST_REASONS.SKIPPED_BTC_SNAPSHOT_FORCE_DISABLED,
        observed_price: observed.price,
        bucket_price: bucketPrice,
        previous_bucket_price: latestSnapshot.bucketPrice,
        config,
      })
    }

    if (secondsSinceLastPosted < config.forceIntervalSeconds) {
      return NextResponse.json({
        ok: true,
        queued: false,
        reason: CHANNEL_POST_REASONS.SKIPPED_BTC_SNAPSHOT_FORCE_INTERVAL_NOT_ELAPSED,
        observed_price: observed.price,
        bucket_price: bucketPrice,
        previous_bucket_price: latestSnapshot.bucketPrice,
        next_forced_update_in_seconds: Math.max(0, config.forceIntervalSeconds - secondsSinceLastPosted),
        seconds_since_last_posted_snapshot: secondsSinceLastPosted,
        config,
      })
    }

    const queued = await queueForcedBtcSnapshotPost(client, {
      bucketPrice,
      observedPrice: observed.price,
      fetchedAt: observed.fetchedAt,
    })

    return NextResponse.json({
      ok: true,
      queued: queued.queued,
      reason: queued.reason,
      event_type: 'hourly_forced',
      direction: 'flat',
      observed_price: observed.price,
      bucket_price: bucketPrice,
      previous_bucket_price: latestSnapshot.bucketPrice,
      dedupe_key: queued.dedupeKey,
      post_text: queued.postText,
      target_channel: config.targetChannel,
      seconds_since_last_posted_snapshot: secondsSinceLastPosted,
      config,
    })
  } catch (error) {
    console.error('POST /api/jobs/btc-snapshot failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
