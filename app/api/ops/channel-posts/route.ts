import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { CHANNEL_POST_REASONS, CHANNEL_POST_REASON_VALUES, normalizeChannelPostReason } from '@/lib/channelPostReasons'

export const dynamic = 'force-dynamic'

type Row = {
  id: number
  status: string | null
  reason: string | null
  source_name: string | null
  source_id?: number | null
  target_channel: string | null
  created_at: string | null
  headline?: string | null
}

const parseWindowHours = (value: string | null) => {
  const raw = (value || '24h').trim().toLowerCase()
  if (raw.endsWith('h')) {
    const n = Number(raw.slice(0, -1))
    if (Number.isFinite(n) && n > 0 && n <= 24 * 14) return n
  }
  if (raw.endsWith('d')) {
    const n = Number(raw.slice(0, -1))
    if (Number.isFinite(n) && n > 0 && n <= 30) return n * 24
  }
  return 24
}

const countTop = (items: string[], limit = 8) => {
  const m = new Map<string, number>()
  for (const k of items) {
    if (!k) continue
    m.set(k, (m.get(k) || 0) + 1)
  }
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }))
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const channel = (url.searchParams.get('channel') || '@Krypto_breaking').trim()
    const windowHours = parseWindowHours(url.searchParams.get('window'))
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
    const limit = Math.max(100, Math.min(5000, Number(url.searchParams.get('limit') || 2000)))

    const client = createAdminClient()
    const baseQuery = (selectText: string) =>
      client
        .from('channel_posts')
        .select(selectText)
        .eq('target_channel', channel)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit)

    const withSourceId: any = await baseQuery('id,status,reason,source_name,source_id,target_channel,created_at,headline')
    let rows = ((withSourceId.data || []) as unknown as Row[])

    if (withSourceId.error) {
      // Prod compatibility: some environments may not have source_id on channel_posts yet.
      const fallback: any = await baseQuery('id,status,reason,source_name,target_channel,created_at,headline')
      if (fallback.error) throw fallback.error
      rows = ((fallback.data || []) as unknown as Row[]).map((r) => ({ ...r, source_id: null }))
    }
    const posted = rows.filter((r) => r.status === 'posted').length
    const failed = rows.filter((r) => r.status === 'failed').length
    const skipped = rows.filter((r) => r.status === 'skipped').length

    const reasonTop = countTop(rows.map((r) => String(r.reason || 'unknown')), 12)
    const reasonTopNormalized = countTop(rows.map((r) => normalizeChannelPostReason(r.reason)), 12)

    const skippedSourceTop = countTop(
      rows.filter((r) => r.status === 'skipped').map((r) => String(r.source_name || 'unknown')),
      10,
    )


    const total = rows.length
    const postRate = total > 0 ? Number(((posted / total) * 100).toFixed(1)) : 0
    const skipRate = total > 0 ? Number(((skipped / total) * 100).toFixed(1)) : 0
    const failRate = total > 0 ? Number(((failed / total) * 100).toFixed(1)) : 0
    const dominantSkipReason = (reasonTopNormalized.find((r) => r.key.startsWith('skipped_')) || null)


    const sourceStatusMap = new Map<string, { source_name: string; posted: number; skipped: number; failed: number; total: number }>()
    for (const r of rows) {
      const key = String(r.source_name || 'unknown')
      const cur = sourceStatusMap.get(key) || { source_name: key, posted: 0, skipped: 0, failed: 0, total: 0 }
      cur.total += 1
      if (r.status === 'posted') cur.posted += 1
      else if (r.status === 'skipped') cur.skipped += 1
      else if (r.status === 'failed') cur.failed += 1
      sourceStatusMap.set(key, cur)
    }
    const sourceStatusCounts = Array.from(sourceStatusMap.values()).sort((a,b)=> b.total-a.total).slice(0, 20)
    const allowlistCandidateTop = countTop(
      rows
        .filter((r) => r.status === 'skipped' && r.reason === CHANNEL_POST_REASONS.SOURCE_NOT_ALLOWLISTED)
        .map((r) => `${String(r.source_name || 'unknown')}|${String(r.source_id ?? 'null')}`),
      5,
    ).map((it) => {
      const [source_name, source_id] = it.key.split('|')
      return { source_name, source_id: source_id === 'null' ? null : Number(source_id), count: it.count }
    })


    const recentSkipped = rows
      .filter((r) => r.status === 'skipped')
      .slice(0, 15)
      .map((r) => ({
        id: r.id,
        reason: r.reason || 'unknown',
        reason_normalized: normalizeChannelPostReason(r.reason),
        reason_detail: {
          source_name: r.source_name || 'unknown',
          source_id: r.source_id ?? null,
          headline: r.headline || null,
        },
        created_at: r.created_at,
      }))

    return NextResponse.json({
      ok: true,
      data: {
        channel,
        window: `${windowHours}h`,
        since,
        sampled_rows: rows.length,
        counts: { posted, failed, skipped, total },
        policy_summary: { post_rate_pct: postRate, skip_rate_pct: skipRate, fail_rate_pct: failRate, dominant_skip_reason: dominantSkipReason },
        reason_top: reasonTop,
        reason_top_normalized: reasonTopNormalized,
        skipped_source_top: skippedSourceTop,
        allowlist_candidate_top: allowlistCandidateTop,
        taxonomy: CHANNEL_POST_REASON_VALUES,
        recent_skipped: recentSkipped,
      },
    })
  } catch (error) {
    console.error('GET /api/ops/channel-posts failed', error)


    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}

