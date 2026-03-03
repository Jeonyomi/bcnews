import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type Row = {
  id: number
  status: string | null
  reason: string | null
  source_name: string | null
  source_id?: number | null
  target_channel: string | null
  created_at: string | null
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
    const { data, error } = await client
      .from('channel_posts')
      .select('id,status,reason,source_name,source_id,target_channel,created_at')
      .eq('target_channel', channel)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    const rows = ((data || []) as Row[])
    const posted = rows.filter((r) => r.status === 'posted').length
    const failed = rows.filter((r) => r.status === 'failed').length
    const skipped = rows.filter((r) => r.status === 'skipped').length

    const reasonTop = countTop(rows.map((r) => String(r.reason || 'unknown')), 12)

    const skippedSourceTop = countTop(
      rows.filter((r) => r.status === 'skipped').map((r) => String(r.source_name || 'unknown')),
      10,
    )

    const allowlistCandidateTop = countTop(
      rows
        .filter((r) => r.status === 'skipped' && r.reason === 'source_not_allowlisted')
        .map((r) => `${String(r.source_name || 'unknown')}|${String(r.source_id ?? 'null')}`),
      5,
    ).map((it) => {
      const [source_name, source_id] = it.key.split('|')
      return { source_name, source_id: source_id === 'null' ? null : Number(source_id), count: it.count }
    })

    return NextResponse.json({
      ok: true,
      data: {
        channel,
        window: `${windowHours}h`,
        since,
        sampled_rows: rows.length,
        counts: { posted, failed, skipped, total: rows.length },
        reason_top: reasonTop,
        skipped_source_top: skippedSourceTop,
        allowlist_candidate_top: allowlistCandidateTop,
      },
    })
  } catch (error) {
    console.error('GET /api/ops/channel-posts failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
