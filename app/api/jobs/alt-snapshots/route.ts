import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import { ALT_SNAPSHOT_ASSETS, getPriceDirection } from '@/lib/altSnapshotConfig'
import {
  fetchAltSnapshotPrice,
  fetchAthEthIndexSnapshot,
  fetchAthBtcIndexSnapshot,
  getAltSnapshotConfig,
  getPreviousAltSnapshotPrice,
  queueHourlyAltSnapshotPost,
  queueHourlyAthEthIndexPost,
  queueHourlyAthBtcIndexPost,
} from '@/lib/altSnapshotPosting'

import { fetchAthAltIndexSnapshot, queueHourlyAthAltIndexPost } from '@/lib/athAltIndexPosting'

export const dynamic = 'force-dynamic'

const getSecret = () =>
  process.env.X_CRON_SECRET || process.env.CRON_SECRET

export async function POST(request: Request) {
  try {
    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const config = getAltSnapshotConfig()
    if (!config.enabled) {
      return NextResponse.json({
        ok: true,
        queued: false,
        reason: CHANNEL_POST_REASONS.SKIPPED_ALT_SNAPSHOT_DISABLED,
        config,
      })
    }

    const client = createSupabaseServerClient()
    const results = []

    const athEthIndex = await fetchAthEthIndexSnapshot()
    const indexQueued = await queueHourlyAthEthIndexPost(client, athEthIndex)
    results.push({
      symbol: 'ATH/ETH',
      queued: indexQueued.queued,
      reason: indexQueued.reason,
      observed_price: athEthIndex.index,
      ath_price: athEthIndex.athPrice,
      eth_price: athEthIndex.ethPrice,
      dedupe_key: indexQueued.dedupeKey,
      post_text: indexQueued.postText,
    })

    // The additional benchmark must not suppress the existing snapshot feeds.
    try {
      const athBtcIndex = await fetchAthBtcIndexSnapshot(athEthIndex)
      const btcIndexQueued = await queueHourlyAthBtcIndexPost(client, athBtcIndex)
      results.push({
        symbol: 'ATH/BTC',
        queued: btcIndexQueued.queued,
        reason: btcIndexQueued.reason,
        observed_price: athBtcIndex.index,
        ath_price: athBtcIndex.athPrice,
        btc_price: athBtcIndex.btcPrice,
        dedupe_key: btcIndexQueued.dedupeKey,
        post_text: btcIndexQueued.postText,
      })
    } catch {
      results.push({ symbol: 'ATH/BTC', queued: false, error: 'ath_btc_index_unavailable' })
    }

    for (const symbol of ['ENA', 'ZEC'] as const) {
      try {
        const snapshot = await fetchAthAltIndexSnapshot(symbol, athEthIndex)
        const queued = await queueHourlyAthAltIndexPost(client, snapshot)
        results.push({
          symbol: `ATH/${symbol}`,
          queued: queued.queued,
          reason: queued.reason,
          observed_price: snapshot.index,
          ath_price: snapshot.athPrice,
          quote_price: snapshot.quotePrice,
          dedupe_key: queued.dedupeKey,
          post_text: queued.postText,
        })
      } catch {
        results.push({ symbol: `ATH/${symbol}`, queued: false, error: 'ath_alt_index_unavailable' })
      }
    }

    for (const asset of ALT_SNAPSHOT_ASSETS) {
      const observed = await fetchAltSnapshotPrice(asset)
      const previousPrice = await getPreviousAltSnapshotPrice(client, asset.symbol)
      const direction = getPriceDirection(observed.price, previousPrice)
      const queued = await queueHourlyAltSnapshotPost(client, asset, {
        observedPrice: observed.price,
        fetchedAt: observed.fetchedAt,
        direction,
      })

      results.push({
        symbol: asset.symbol,
        queued: queued.queued,
        reason: queued.reason,
        direction,
        observed_price: observed.price,
        dedupe_key: queued.dedupeKey,
        post_text: queued.postText,
      })
    }

    return NextResponse.json({
      ok: true,
      event_type: 'hourly_forced',
      target_channel: config.targetChannel,
      results,
      config,
    })
  } catch (error) {
    console.error('POST /api/jobs/alt-snapshots failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
