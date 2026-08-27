import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { evaluateBreakingSignals, selectPrimarySignal } from '@/lib/mbaiBreakingBridgeConfig'
import {
  fetchBreakingBridgeSnapshot,
  getBreakingBridgeConfig,
  queueBreakingBridgePost,
} from '@/lib/mbaiBreakingBridgePosting'

export const dynamic = 'force-dynamic'

const getSecret = () => process.env.BCNEWS_CRON_SECRET || process.env.X_CRON_SECRET || process.env.CRON_SECRET

export async function POST(request: Request) {
  try {
    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const config = getBreakingBridgeConfig()
    if (!config.enabled) {
      return NextResponse.json({
        ok: true, queued: false, reason: 'skipped_mbai_breaking_bridge_disabled', config,
      })
    }

    const snapshot = await fetchBreakingBridgeSnapshot(fetch)
    const signals = evaluateBreakingSignals(snapshot)
    const primary = selectPrimarySignal(signals)
    if (!primary) {
      return NextResponse.json({
        ok: true,
        queued: false,
        reason: 'skipped_no_breaking_signal',
        event_type: 'mbai_breaking_bridge',
        observed_at: snapshot.observedAt,
        active_metrics: Object.values(snapshot).filter((value) => typeof value === 'number').length,
        config,
      })
    }

    const client = createSupabaseServerClient()
    const queued = await queueBreakingBridgePost(client, snapshot, primary)
    return NextResponse.json({
      ok: true,
      queued: queued.queued,
      reason: queued.reason,
      event_type: 'mbai_breaking_bridge',
      observed_at: snapshot.observedAt,
      signal: primary.id,
      direction: primary.direction,
      score: primary.score,
      dedupe_key: queued.dedupeKey,
      target_channel: config.targetChannel,
      config,
    })
  } catch (error) {
    console.error('POST /api/jobs/mbai-breaking-bridge failed', error)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
