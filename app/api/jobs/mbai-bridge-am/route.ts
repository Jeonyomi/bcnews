import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import {
  fetchBridgeAmSnapshot,
  getBridgeAmConfig,
  queueBridgeAmPost,
} from '@/lib/mbaiBridgeAmPosting'

export const dynamic = 'force-dynamic'

const getSecret = () => process.env.X_CRON_SECRET || process.env.CRON_SECRET

export async function POST(request: Request) {
  try {
    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const config = getBridgeAmConfig()
    if (!config.enabled) {
      return NextResponse.json({ ok: true, queued: false, reason: 'skipped_mbai_bridge_am_disabled', config })
    }

    const snapshot = await fetchBridgeAmSnapshot()
    const client = createSupabaseServerClient()
    const queued = await queueBridgeAmPost(client, snapshot)

    return NextResponse.json({
      ok: true,
      queued: queued.queued,
      reason: queued.reason,
      event_type: 'mbai_bridge_am',
      date_key: snapshot.dateKey,
      dedupe_key: queued.dedupeKey,
      target_channel: config.targetChannel,
      post_text: queued.postText,
      config,
    })
  } catch (error) {
    console.error('POST /api/jobs/mbai-bridge-am failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
