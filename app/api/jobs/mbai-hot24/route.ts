import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { buildHot24Message } from '@/lib/mbaiHot24Config'
import {
  getHot24Config,
  getHot24ExecutionContext,
  queueHot24Post,
  selectHot24FromLiveData,
} from '@/lib/mbaiHot24Posting'

export const dynamic = 'force-dynamic'

const getSecret = () => process.env.BCNEWS_CRON_SECRET || process.env.X_CRON_SECRET || process.env.CRON_SECRET

export async function POST(request: Request) {
  try {
    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const body = await request.json().catch(() => ({} as any))
    const dryRun = url.searchParams.get('dry_run') === 'true' || body?.dry_run === true
    const config = getHot24Config()
    if (!config.enabled) {
      return NextResponse.json({ ok: true, queued: false, dry_run: dryRun, reason: 'skipped_mbai_hot24_disabled', config })
    }

    const observedAt = new Date().toISOString()
    const execution = getHot24ExecutionContext(new Date(observedAt))
    if (!dryRun && !execution.inWindow) {
      return NextResponse.json({
        ok: true, queued: false, dry_run: false, reason: 'skipped_outside_hot24_window',
        event_type: 'mbai_hot24', execution, config,
      })
    }

    const client = createSupabaseServerClient()
    const selected = await selectHot24FromLiveData(client, fetch, observedAt)
    if (!selected) {
      return NextResponse.json({
        ok: true, queued: false, dry_run: dryRun, reason: 'skipped_no_hot24_candidate',
        event_type: 'mbai_hot24', observed_at: observedAt, execution, config,
      })
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true, queued: false, dry_run: true, reason: 'dry_run_candidate_selected',
        event_type: 'mbai_hot24', observed_at: observedAt, issue_id: selected.issueId,
        content_type: selected.contentType, hot_score: selected.hotScore,
        headline: selected.asset?.name || selected.title,
        post_text: buildHot24Message(selected, observedAt), execution, config,
      })
    }

    const queued = await queueHot24Post(client, selected, observedAt)
    return NextResponse.json({
      ok: true, queued: queued.queued, dry_run: false, reason: queued.reason,
      event_type: 'mbai_hot24', observed_at: observedAt, issue_id: selected.issueId,
      content_type: selected.contentType, hot_score: selected.hotScore,
      dedupe_key: queued.dedupeKey, target_channel: config.targetChannel,
      post_text: queued.postText, execution, config,
    })
  } catch (error) {
    console.error('POST /api/jobs/mbai-hot24 failed', error)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
