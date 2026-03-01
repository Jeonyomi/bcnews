import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { err, ok } from '@/lib/dashboardApi'

export const dynamic = 'force-dynamic'

type HealthStatus = 'ok' | 'warn' | 'down' | 'disabled' | 'restricted' | 'throttled' | 'stale'

const STALE_HOURS = Number.parseInt(process.env.SOURCE_STALE_HOURS || '6', 10) || 6
const HEALTH_WINDOW = Number.parseInt(process.env.SOURCE_HEALTH_LOG_WINDOW || '20', 10) || 20

const toDate = (value?: string | null) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const classifyHealthStatus = (
  enabled: boolean,
  sourceName: string,
  latest?: { status?: string | null; error_message?: string | null; run_at_utc?: string | null },
): HealthStatus => {
  if (sourceName.toLowerCase() === 'fatf') return 'disabled'
  if (!enabled) return 'disabled'
  if (!latest) return 'warn'

  const latestDate = toDate(latest.run_at_utc)
  if (latestDate) {
    const staleCutoff = Date.now() - STALE_HOURS * 60 * 60 * 1000
    if (latestDate.getTime() < staleCutoff) return 'stale'
  }

  if (latest.status === 'ok') return 'ok'
  if (latest.status !== 'error') return 'warn'

  const error = String(latest.error_message || '').toLowerCase()
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

    const { data: sources, error: sourceError } = await client
      .from('sources')
      .select('id,name,type,tier,region,enabled,last_success_at,last_error_at')
      .order('id', { ascending: true })

    if (sourceError) throw sourceError

    const { data: logs, error: logsError } = await client
      .from('ingest_logs')
      .select('source_id,status,run_at_utc,items_fetched,items_saved,error_message')
      .order('run_at_utc', { ascending: false })
      .limit(5000)

    if (logsError) throw logsError

    const grouped: Record<number, any[]> = {}
    for (const row of logs || []) {
      if (!row.source_id) continue
      if (!grouped[row.source_id]) grouped[row.source_id] = []
      grouped[row.source_id].push(row)
    }

    const health = (sources || []).map((source) => {
      const sourceLogs = (grouped[source.id] || []).slice(0, HEALTH_WINDOW)
      const latest = sourceLogs[0]
      const status = classifyHealthStatus(source.enabled !== false, String(source.name || ''), latest)

      const runs = sourceLogs.length
      const errorRuns = sourceLogs.filter((r) => r.status === 'error').length
      const warnRuns = sourceLogs.filter((r) => r.status === 'warn').length
      const fetched = sourceLogs.reduce((sum, r) => sum + Number(r.items_fetched || 0), 0)
      const saved = sourceLogs.reduce((sum, r) => sum + Number(r.items_saved || 0), 0)
      const successRate = runs > 0 ? Math.round(((runs - errorRuns) / runs) * 100) : null
      const errorRate = runs > 0 ? Math.round((errorRuns / runs) * 100) : null

      return {
        source_id: source.id,
        source_name: source.name,
        status,
        last_status: latest?.status || null,
        last_items: latest?.items_fetched || 0,
        last_saved: latest?.items_saved || 0,
        last_error: source.enabled === false ? null : latest?.error_message || null,
        last_run_at: latest?.run_at_utc || null,
        runs,
        warn_runs: warnRuns,
        error_runs: errorRuns,
        success_rate: successRate,
        error_rate: errorRate,
        total_fetched: fetched,
        total_saved: saved,
      }
    })

    const healthCounts = health.reduce(
      (acc, row) => {
        acc.total += 1
        if (row.status === 'ok') acc.ok += 1
        else if (row.status === 'warn' || row.status === 'throttled' || row.status === 'restricted') acc.warn += 1
        else if (row.status === 'stale') acc.stale += 1
        else if (row.status === 'disabled') acc.disabled += 1
        else acc.down += 1
        return acc
      },
      { total: 0, ok: 0, warn: 0, stale: 0, down: 0, disabled: 0 },
    )

    return NextResponse.json(
      ok({
        sources,
        health,
        summary: healthCounts,
        meta: { health_window_runs: HEALTH_WINDOW, stale_hours: STALE_HOURS },
      }),
    )
  } catch (error) {
    console.error('GET /api/sources failed', error)
    return NextResponse.json(err(`sources_error: ${String(error)}`), { status: 500 })
  }
}

