import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { err, ok } from '@/lib/dashboardApi'

export const dynamic = 'force-dynamic'

type HealthStatus = 'ok' | 'warn' | 'down' | 'disabled' | 'restricted' | 'throttled' | 'stale'

const STALE_HOURS = Number.parseInt(process.env.SOURCE_STALE_HOURS || '6', 10) || 6
const HEALTH_WINDOW = Number.parseInt(process.env.SOURCE_HEALTH_LOG_WINDOW || '20', 10) || 20
const MIN_RUNS_FOR_RATE = Number.parseInt(process.env.SOURCE_MIN_RUNS_FOR_RATE || '10', 10) || 10
const DOWN_CONSECUTIVE_ERRORS = Number.parseInt(process.env.SOURCE_DOWN_CONSECUTIVE_ERRORS || '5', 10) || 5
const DOWN_ERROR_RATE_PCT = Number.parseInt(process.env.SOURCE_DOWN_ERROR_RATE_PCT || '80', 10) || 80
const WARN_ERROR_RATE_PCT = Number.parseInt(process.env.SOURCE_WARN_ERROR_RATE_PCT || '20', 10) || 20

const fingerprint = (value?: string | null) => {
  if (!value) return null
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

const toDate = (value?: string | null) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const classifyHealthStatus = (args: {
  enabled: boolean
  sourceName: string
  latest?: { status?: string | null; error_message?: string | null; run_at_utc?: string | null }
  runs: number
  errorRate: number | null
  consecutiveErrors: number
}): HealthStatus => {
  const { enabled, sourceName, latest, runs, errorRate, consecutiveErrors } = args

  if (sourceName.toLowerCase() === 'fatf') return 'disabled'
  if (!enabled) return 'disabled'
  if (!latest) return 'warn'

  const latestDate = toDate(latest.run_at_utc)
  if (latestDate) {
    const staleCutoff = Date.now() - STALE_HOURS * 60 * 60 * 1000
    if (latestDate.getTime() < staleCutoff) return 'stale'
  }

  const error = String(latest.error_message || '').toLowerCase()
  if (latest.status === 'error') {
    if (error.includes('rss_fetch_status_401') || error.includes('rss_fetch_status_403')) return 'restricted'
    if (error.includes('rss_fetch_status_429')) return 'throttled'
    if (error.includes('rss_fetch_status_404') || error.includes('invalid time value')) return 'warn'
  }

  if (consecutiveErrors >= DOWN_CONSECUTIVE_ERRORS) return 'down'
  if (runs >= MIN_RUNS_FOR_RATE && errorRate !== null && errorRate >= DOWN_ERROR_RATE_PCT) return 'down'

  if (runs >= MIN_RUNS_FOR_RATE && errorRate !== null && errorRate >= WARN_ERROR_RATE_PCT) return 'warn'

  if (runs >= MIN_RUNS_FOR_RATE && errorRate !== null && errorRate < WARN_ERROR_RATE_PCT) return 'ok'

  if (latest.status === 'ok') return 'ok'
  if (latest.status === 'error' && error.includes('rss_fetch_status_5')) return 'down'
  return 'warn'
}

export async function GET(request: Request) {
  try {
    const client = createAdminClient()
    const url = new URL(request.url)
    const debugGlobal = url.searchParams.get('debug_global') === '1'
    const secret = process.env.X_CRON_SECRET || process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET || ''
    const headerSecret = request.headers.get('x-cron-secret') || ''
    const debugAllowed = !!secret && headerSecret === secret

    const { data: sources, error: sourceError } = await client
      .from('sources')
      .select('id,name,type,tier,region,enabled,last_success_at,last_error_at')
      .order('id', { ascending: true })

    if (sourceError) throw sourceError

    let logs: any[] | null = null
    let logsError: any = null

    const withStage = await client
      .from('ingest_logs')
      .select('source_id,status,run_at_utc,items_fetched,items_saved,error_message,stage')
      .order('run_at_utc', { ascending: false })
      .limit(5000)

    if (!withStage.error) {
      logs = withStage.data || []
    } else {
      const withoutStage = await client
        .from('ingest_logs')
        .select('source_id,status,run_at_utc,items_fetched,items_saved,error_message')
        .order('run_at_utc', { ascending: false })
        .limit(5000)
      logs = withoutStage.data || []
      logsError = withoutStage.error
    }

    if (logsError) throw logsError

    const grouped: Record<number, any[]> = {}

    let globalWindow: any[] = []
    const globalWithStage = await client
      .from('ingest_logs')
      .select('source_id,status,run_at_utc,items_fetched,items_saved,error_message,stage')
      .is('source_id', null)
      .order('run_at_utc', { ascending: false })
      .limit(HEALTH_WINDOW)

    if (!globalWithStage.error) {
      globalWindow = globalWithStage.data || []
    } else {
      const globalFallback = await client
        .from('ingest_logs')
        .select('source_id,status,run_at_utc,items_fetched,items_saved,error_message')
        .is('source_id', null)
        .order('run_at_utc', { ascending: false })
        .limit(HEALTH_WINDOW)
      globalWindow = globalFallback.data || []
    }

    let globalLatestRunAt: string | null = null
    let debugGlobalLatestRawRow: any = null
    const globalLatestQuery = { filter: 'source_id IS NULL', orderBy: 'run_at_utc DESC', limit: 1, fallback: 'MAX(run_at_utc) overall' }

    const latestGlobal = await client
      .from('ingest_logs')
      .select('run_at_utc')
      .is('source_id', null)
      .order('run_at_utc', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestGlobal.error && latestGlobal.data?.run_at_utc) {
      globalLatestRunAt = String(latestGlobal.data.run_at_utc)
      debugGlobalLatestRawRow = latestGlobal.data
    }

    if (!globalLatestRunAt) {
      const latestAny = await client
        .from('ingest_logs')
        .select('run_at_utc')
        .order('run_at_utc', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!latestAny.error && latestAny.data?.run_at_utc) {
        globalLatestRunAt = String(latestAny.data.run_at_utc)
        debugGlobalLatestRawRow = latestAny.data
      }
    }

    for (const row of logs || []) {
      if (!row.source_id) continue
      if (!grouped[row.source_id]) grouped[row.source_id] = []
      grouped[row.source_id].push(row)
    }

    const health = (sources || []).map((source) => {
      const sourceLogs = (grouped[source.id] || []).slice(0, HEALTH_WINDOW)
      const latest = sourceLogs[0]

      const sourceRuns = sourceLogs.length
      const runs = sourceRuns > 0 ? sourceRuns : globalWindow.length
      const errorRuns = sourceLogs.filter((r) => r.status === 'error').length
      const warnRuns = sourceLogs.filter((r) => r.status === 'warn').length
      const fetched = sourceLogs.reduce((sum, r) => sum + Number(r.items_fetched || 0), 0)
      const saved = sourceLogs.reduce((sum, r) => sum + Number(r.items_saved || 0), 0)
      const successRate = runs > 0 ? Math.round(((runs - errorRuns) / runs) * 100) : null
      const errorRate = runs > 0 ? Math.round((errorRuns / runs) * 100) : null
      const consecutiveErrors = sourceLogs.slice(0, DOWN_CONSECUTIVE_ERRORS).every((r) => r.status === 'error')
        ? Math.min(DOWN_CONSECUTIVE_ERRORS, sourceLogs.length)
        : (() => {
            let streak = 0
            for (const r of sourceLogs) {
              if (r.status === 'error') streak += 1
              else break
            }
            return streak
          })()

      const status = classifyHealthStatus({
        enabled: source.enabled !== false,
        sourceName: String(source.name || ''),
        latest,
        runs,
        errorRate,
        consecutiveErrors,
      })

      return {
        source_id: source.id,
        source_name: source.name,
        status,
        last_status: latest?.status || null,
        last_items: latest?.items_fetched || 0,
        last_saved: latest?.items_saved || 0,
        last_error: source.enabled === false ? null : latest?.error_message || null,
        last_run_at: latest?.run_at_utc || null,
        display_last_run_at: latest?.run_at_utc || globalLatestRunAt || null,
        runs,
        source_runs: sourceRuns,
        warn_runs: warnRuns,
        error_runs: errorRuns,
        success_rate: successRate,
        error_rate: errorRate,
        total_fetched: fetched,
        total_saved: saved,
      }
    })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
    let supabaseHost = ''
    try { supabaseHost = new URL(supabaseUrl).host } catch {}
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    let dbNow: { ok: boolean; value: any; error: any } = { ok: false, value: null, error: null }
    try {
      const r: any = await client.rpc('db_now')
      dbNow = { ok: !r?.error, value: r?.data ?? null, error: r?.error ?? null }
    } catch (e: any) {
      dbNow = { ok: false, value: null, error: String(e) }
    }

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
        meta: {
          health_window_runs: HEALTH_WINDOW,
          stale_hours: STALE_HOURS,
          min_runs_for_rate: MIN_RUNS_FOR_RATE,
          down_consecutive_errors: DOWN_CONSECUTIVE_ERRORS,
          down_error_rate_pct: DOWN_ERROR_RATE_PCT,
          warn_error_rate_pct: WARN_ERROR_RATE_PCT,
          global_runs_window: globalWindow.length,
          global_latest_run_at: globalLatestRunAt,
        },
        debug: debugGlobal && debugAllowed
          ? {
              global_latest_query: globalLatestQuery,
              global_latest_raw_row: debugGlobalLatestRawRow,
              supabase_host_hash: fingerprint(supabaseHost),
              service_role_hash_prefix: fingerprint(serviceKey),
              db_now: dbNow.value || null,
              db_now_error: dbNow.ok ? null : (dbNow.error || 'db_now_unavailable'),
              global_rows_last5: (await (async () => {
                const withStageRows = await client
                  .from('ingest_logs')
                  .select('id,run_at_utc,stage,status,source_id')
                  .is('source_id', null)
                  .order('run_at_utc', { ascending: false })
                  .limit(5)
                if (!withStageRows.error) return withStageRows.data || []
                const fallbackRows = await client
                  .from('ingest_logs')
                  .select('id,run_at_utc,status,source_id')
                  .is('source_id', null)
                  .order('run_at_utc', { ascending: false })
                  .limit(5)
                return fallbackRows.data || []
              })()),
            }
          : undefined,
      }),
    )
  } catch (error) {
    console.error('GET /api/sources failed', error)
    return NextResponse.json(err(`sources_error: ${String(error)}`), { status: 500 })
  }
}

