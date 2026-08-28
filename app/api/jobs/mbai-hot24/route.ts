import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { MBAI_HOT24_ENABLED, MBAI_HOT24_LANE, MBAI_HOT24_TARGET_CHANNEL } from '@/lib/mbaiHot24Posting'
import { buildRequiredPickMessage, getRequiredPickExecutionContext, type RequiredPickMarket } from '@/lib/mbaiHot24RequiredPicks'
import { fetchRequiredPicksForMarket, queueRequiredPick } from '@/lib/mbaiHot24RequiredPicksPosting'

export const dynamic = 'force-dynamic'

const getSecret = () => process.env.BCNEWS_CRON_SECRET || process.env.X_CRON_SECRET || process.env.CRON_SECRET
const MARKETS: RequiredPickMarket[] = ['KOREA', 'US', 'CRYPTO']

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
    const requestedSlot = String(url.searchParams.get('slot') || body?.slot || '').toUpperCase()
    if (![...MARKETS, 'ALL'].includes(requestedSlot)) {
      return NextResponse.json({ ok: false, error: 'invalid_slot' }, { status: 400 })
    }
    if (requestedSlot === 'ALL' && !dryRun) {
      return NextResponse.json({ ok: false, error: 'all_slot_requires_dry_run' }, { status: 400 })
    }
    if (!MBAI_HOT24_ENABLED) {
      return NextResponse.json({ ok: true, queued: false, dry_run: dryRun, reason: 'skipped_mbai_hot24_disabled' })
    }

    const observedAt = new Date().toISOString()
    const client = createSupabaseServerClient()
    const markets = requestedSlot === 'ALL' ? MARKETS : [requestedSlot as RequiredPickMarket]
    const results: any[] = []

    for (const market of markets) {
      const execution = getRequiredPickExecutionContext(market, new Date(observedAt))
      if (!dryRun && !execution.inWindow) {
        results.push({ market, queued: false, reason: 'skipped_outside_required_pick_window', execution })
        continue
      }
      const picks = await fetchRequiredPicksForMarket(client, market, observedAt, fetch)
      if (!picks.length) {
        results.push({ market, queued: false, reason: 'skipped_no_meaningful_required_pick', execution })
        continue
      }
      if (dryRun) {
        results.push({
          market, queued: false, reason: 'dry_run_required_picks_selected', execution,
          picks: picks.map((pick) => ({
            kind: pick.kind,
            content_type: `MBAI_HOT24_${market}_${pick.kind}`,
            headline: pick.kind === 'NEWS' ? pick.news.title : pick.asset.name,
            score: pick.kind === 'NEWS' ? pick.news.hotScore : undefined,
            turnover: pick.kind === 'ASSET' ? pick.asset.turnover : undefined,
            symbol: pick.kind === 'ASSET' ? pick.asset.symbol : undefined,
            source: pick.kind === 'NEWS' ? pick.news.sourceName : pick.asset.source,
            post_text: buildRequiredPickMessage(pick, observedAt),
          })),
        })
        continue
      }
      const queued = []
      for (const pick of picks) {
        const result = await queueRequiredPick(client, pick, observedAt)
        queued.push({ kind: pick.kind, content_type: `MBAI_HOT24_${market}_${pick.kind}`, ...result })
      }
      results.push({ market, execution, queued: queued.some((item) => item.queued), picks: queued })
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      queued: results.some((result) => result.queued),
      queued_count: results.flatMap((result) => result.picks || []).filter((pick) => pick.queued).length,
      observed_at: observedAt,
      target_channel: MBAI_HOT24_TARGET_CHANNEL,
      lane: MBAI_HOT24_LANE,
      results,
    })
  } catch (error) {
    console.error('POST /api/jobs/mbai-hot24 failed', error)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
