import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { err, ok } from '@/lib/dashboardApi'

export const dynamic = 'force-dynamic'

const classifyHealthStatus = (
  enabled: boolean,
  sourceName?: string,
  latest?: { status?: string | null; error_message?: string | null },
) => {
  // Ops override: FATF feed is frequently restricted; do not page on it.
  if (String(sourceName || '').toLowerCase() === 'fatf') return 'disabled'
  if (!enabled) return 'disabled'
  if (!latest) return 'warn'
  if (latest.status === 'ok') return 'ok'
  if (latest.status !== 'error') return 'warn'

  const error = String(latest.error_message || '').toLowerCase()

  // 1st-pass improvement: treat external-access/feed-endpoint issues as warn-ish,
  // and reserve "down" for actual service/runtime failures.
  if (error.includes('rss_fetch_status_404')) return 'warn'
  if (error.includes('rss_fetch_status_401') || error.includes('rss_fetch_status_403')) return 'restricted'
  if (error.includes('rss_fetch_status_429')) return 'throttled'
  if (error.includes('invalid time value')) return 'warn'
  if (error.includes('rss_fetch_status_5')) return 'down'

  return 'down'
}

export async function GET() {
  try {
    const client = createAdminClient()
    const { data: sources, error } = await client.from('sources').select('*').order('id', { ascending: true })
    if (error) throw error

    const { data: logs } = await client
      .from('ingest_logs')
      .select('source_id,status,run_at_utc,items_fetched,items_saved,error_message')
      .order('run_at_utc', { ascending: false })

    const grouped: Record<number, any[]> = {}
    for (const row of logs || []) {
      if (!row.source_id) continue
      if (!grouped[row.source_id]) grouped[row.source_id] = []
      grouped[row.source_id].push(row)
    }

    const health = (sources || []).map((source) => {
      const sourceLogs = grouped[source.id] || []
      const latest = sourceLogs[0]
      const status = classifyHealthStatus(source.enabled !== false, source.name, latest)

      return {
        source_id: source.id,
        source_name: source.name,
        status,
        last_status: latest ? latest.status : null,
        last_items: latest ? latest.items_fetched : 0,
        last_error: source.enabled === false ? null : latest?.error_message || null,
        last_run_at: latest ? latest.run_at_utc : null,
      }
    })

    return NextResponse.json(
      ok({
        sources,
        health,
        meta: {
          sourcesCount: (sources || []).length,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null,
        },
      }),
    )
  } catch (error) {
    console.error('GET /api/sources failed', error)
    return NextResponse.json(err(`sources_error: ${String(error)}`), { status: 500 })
  }
}
