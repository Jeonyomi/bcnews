import { NextResponse } from 'next/server'
import { createSupabaseServerClient, getSupabaseServerConfig } from '@/lib/supabaseServer'
import { err, ok } from '@/lib/dashboardApi'
import { inferDisabledReason, normalizeSourcePolicyRegion, normalizeSourcePolicyTier, normalizeSourcePolicyType } from '@/lib/sourcePolicy'

export const dynamic = 'force-dynamic'

type HealthStatus = 'ok' | 'warn' | 'down' | 'disabled' | 'restricted' | 'throttled' | 'stale' | 'na'

const STALE_HOURS = Number.parseInt(process.env.SOURCE_STALE_HOURS || '6', 10) || 6
const HEALTH_WINDOW = Number.parseInt(process.env.SOURCE_HEALTH_LOG_WINDOW || '20', 10) || 20
const MIN_RUNS_FOR_RATE = Number.parseInt(process.env.SOURCE_MIN_RUNS_FOR_RATE || '10', 10) || 10
const DOWN_CONSECUTIVE_ERRORS = Number.parseInt(process.env.SOURCE_DOWN_CONSECUTIVE_ERRORS || '5', 10) || 5
const DOWN_ERROR_RATE_PCT = Number.parseInt(process.env.SOURCE_DOWN_ERROR_RATE_PCT || '80', 10) || 80
const WARN_ERROR_RATE_PCT = Number.parseInt(process.env.SOURCE_WARN_ERROR_RATE_PCT || '20', 10) || 20

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
  sourceRuns: number
  errorRate: number | null
  consecutiveErrors: number
  lastFetched: number
  lastSaved: number
}): HealthStatus => {
  const { enabled, sourceName, latest, runs, sourceRuns, errorRate, consecutiveErrors, lastFetched, lastSaved } = args

  if (sourceName.toLowerCase() === 'fatf') return 'disabled'
  if (!enabled) return 'disabled'
  if (sourceRuns === 0) return 'na'
  if (!latest) return 'warn'

  if (sourceRuns === 0 && lastFetched === 0 && lastSaved === 0) return 'na'

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
    const client = createSupabaseServerClient()
    const url = new URL(request.url)
    const debugGlobal = url.searchParams.get('debug_global') === '1'

    // "Enabled pool" should reflect what ingest is actually processing. In prod, `sources.enabled`
    // can drift from reality if a different env/seed state is deployed.
    // We compute a short-window activity flag from ingest_logs and expose it for UI filtering.
    // Default to 7d so the "ingest-enabled pool" is stable even if some sources run infrequently.
    const ACTIVE_WINDOW_HOURS = Number.parseInt(process.env.SOURCE_ACTIVE_WINDOW_HOURS || '168', 10) || 168
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
      .select('id,source_id,status,run_at_utc,items_fetched,items_saved,error_message,stage')
      .order('run_at_utc', { ascending: false })
      .limit(5000)

    if (!withStage.error) {
      logs = withStage.data || []
    } else {
      const withoutStage = await client
        .from('ingest_logs')
        .select('id,source_id,status,run_at_utc,items_fetched,items_saved,error_message')
        .order('run_at_utc', { ascending: false })
        .limit(5000)
      logs = withoutStage.data || []
      logsError = withoutStage.error
    }

    if (logsError) throw logsError

    const grouped: Record<number, any[]> = {}

    // Derive ingest-active sources over a short window (default 24h).
    const activeSince = new Date(Date.now() - ACTIVE_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
    const activeRows = await client
      .from('ingest_logs')
      .select('source_id')
      .gte('run_at_utc', activeSince)
      .not('source_id', 'is', null)
      .order('run_at_utc', { ascending: false })
      .limit(5000)

    const activeSourceIds = new Set<number>()
    if (!activeRows.error) {
      for (const r of activeRows.data || []) {
        const id = Number((r as any).source_id)
        if (!Number.isNaN(id)) activeSourceIds.add(id)
      }
    }

    // Attach effective enabled flag to each source row so `/sources` can show the ingest-active pool.
    const sourcesResolved: any[] = (sources || []).map((s: any) => ({
      ...s,
      ingest_active: activeSourceIds.has(Number(s.id)),
      enabled_effective: s.enabled === true || activeSourceIds.has(Number(s.id)),
    }))

    let globalWindow: any[] = []
    const globalWithStage = await client
      .from('ingest_logs')
      .select('id,source_id,status,run_at_utc,items_fetched,items_saved,error_message,stage')
      .is('source_id', null)
      .order('run_at_utc', { ascending: false })
      .limit(HEALTH_WINDOW)

    if (!globalWithStage.error) {
      globalWindow = globalWithStage.data || []
    } else {
      const globalFallback = await client
        .from('ingest_logs')
        .select('id,source_id,status,run_at_utc,items_fetched,items_saved,error_message')
        .is('source_id', null)
        .order('run_at_utc', { ascending: false })
        .limit(HEALTH_WINDOW)
      globalWindow = globalFallback.data || []
    }

    let globalLatestRunAt: string | null = null
    let debugGlobalLatestRawRow: any = null
    const globalLatestQuery = {
      filter: 'source_id IS NULL',
      select: 'id,run_at_utc,status',
      orderBy: 'run_at_utc DESC, id DESC',
      limit: 1,
      source: 'direct_query',
    }

    // Deterministic global latest selection (do not derive from pre-fetched window array).
    const latestGlobal = await client
      .from('ingest_logs')
      .select('id,run_at_utc,status')
      .is('source_id', null)
      .order('run_at_utc', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestGlobal.error && latestGlobal.data?.run_at_utc) {
      globalLatestRunAt = String(latestGlobal.data.run_at_utc)
      debugGlobalLatestRawRow = {
        id: latestGlobal.data.id ?? null,
        run_at_utc: latestGlobal.data.run_at_utc,
        status: latestGlobal.data.status ?? null,
      }
    }

    // Fallback: if global log row is missing, use latest run among all source logs.
    if (!globalLatestRunAt) {
      const fallbackAnyLatest = (logs || []).find((r) => !!r?.run_at_utc)
      if (fallbackAnyLatest?.run_at_utc) {
        globalLatestRunAt = String(fallbackAnyLatest.run_at_utc)
        debugGlobalLatestRawRow = {
          id: fallbackAnyLatest?.id ?? null,
          run_at_utc: globalLatestRunAt,
          status: fallbackAnyLatest?.status ?? null,
          fallback: 'any_source_latest',
        }
      }
    }

    for (const row of logs || []) {
      if (!row.source_id) continue
      if (!grouped[row.source_id]) grouped[row.source_id] = []
      grouped[row.source_id].push(row)
    }

    for (const sourceId of Object.keys(grouped)) {
      grouped[Number(sourceId)].sort((a: any, b: any) => {
        const ta = new Date(String(a?.run_at_utc || 0)).getTime()
        const tb = new Date(String(b?.run_at_utc || 0)).getTime()
        if (tb !== ta) return tb - ta
        return Number(b?.id || 0) - Number(a?.id || 0)
      })
    }

    const health = (sourcesResolved || []).map((source) => {
      const sourceLogs = (grouped[source.id] || []).slice(0, HEALTH_WINDOW)
      const latest = sourceLogs[0]

      const sourceRuns = sourceLogs.length
      const runs = sourceRuns
      const globalRuns = globalWindow.length
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
        sourceRuns,
        errorRate,
        consecutiveErrors,
        lastFetched: Number(latest?.items_fetched || 0),
        lastSaved: Number(latest?.items_saved || 0),
      })

      const policy_type = normalizeSourcePolicyType(String(source.name || ''), source.type)
      const policy_tier = normalizeSourcePolicyTier(source.tier)
      const policy_region = normalizeSourcePolicyRegion(source.region)
      const disabled_reason = inferDisabledReason(source.enabled !== false, status)

      const ingest_active = activeSourceIds.has(Number(source.id))
      const enabled_effective = (source.enabled === true) || ingest_active

      return {
        source_id: source.id,
        source_name: source.name,
        policy_type,
        policy_tier,
        policy_region,
        disabled_reason,
        ingest_active,
        enabled_effective,
        status,
        last_status: latest?.status || null,
        last_items: latest?.items_fetched || 0,
        last_saved: latest?.items_saved || 0,
        last_error: source.enabled === false ? null : latest?.error_message || null,
        last_run_at: latest?.run_at_utc || null,
        display_last_run_at: latest?.run_at_utc || globalLatestRunAt || null,
        runs,
        source_runs: sourceRuns,
        global_runs: globalRuns,
        warn_runs: warnRuns,
        error_runs: errorRuns,
        success_rate: successRate,
        error_rate: errorRate,
        total_fetched: fetched,
        total_saved: saved,
      }
    })

    const cfg = getSupabaseServerConfig()

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
        else if (row.status === 'na') acc.na += 1
        else acc.down += 1
        return acc
      },
      { total: 0, ok: 0, warn: 0, stale: 0, down: 0, disabled: 0, na: 0 },
    )

    const lastRunDistribution = health.reduce(
      (acc, row) => {
        const d = toDate(row.last_run_at || row.display_last_run_at)
        if (!d) {
          acc.never += 1
          return acc
        }
        const ageMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
        if (ageMin <= 10) acc.le_10m += 1
        else if (ageMin <= 30) acc.le_30m += 1
        else if (ageMin <= 60) acc.le_60m += 1
        else if (ageMin <= 180) acc.le_180m += 1
        else acc.gt_180m += 1
        return acc
      },
      { never: 0, le_10m: 0, le_30m: 0, le_60m: 0, le_180m: 0, gt_180m: 0 },
    )

    const withStageRows = await client
      .from('ingest_logs')
      .select('id,run_at_utc,stage,status,source_id')
      .is('source_id', null)
      .order('run_at_utc', { ascending: false })
      .order('id', { ascending: false })
      .limit(5)

    const globalRowsLast5 = !withStageRows.error
      ? (withStageRows.data || [])
      : ((await client
          .from('ingest_logs')
          .select('id,run_at_utc,status,source_id')
          .is('source_id', null)
          .order('run_at_utc', { ascending: false })
          .order('id', { ascending: false })
          .limit(5)).data || [])

    const topGlobalRow = (globalRowsLast5 || [])[0] as any
    const parityOk = !!(
      topGlobalRow &&
      debugGlobalLatestRawRow &&
      String(topGlobalRow.run_at_utc || '') === String(debugGlobalLatestRawRow.run_at_utc || '') &&
      Number(topGlobalRow.id || 0) === Number(debugGlobalLatestRawRow.id || 0)
    )

    const globalLatestDate = toDate(globalLatestRunAt)
    const globalLatestAgeMinutes = globalLatestDate
      ? Math.max(0, Math.floor((Date.now() - globalLatestDate.getTime()) / 60000))
      : null
    const globalIsStale = globalLatestAgeMinutes === null ? true : globalLatestAgeMinutes > STALE_HOURS * 60

    return NextResponse.json(
      ok({
        sources: sourcesResolved,
        health,
        summary: healthCounts,
        meta: {
          health_window_runs: HEALTH_WINDOW,
          stale_hours: STALE_HOURS,
          active_window_hours: ACTIVE_WINDOW_HOURS,
          ingest_active_sources: activeSourceIds.size,
          min_runs_for_rate: MIN_RUNS_FOR_RATE,
          down_consecutive_errors: DOWN_CONSECUTIVE_ERRORS,
          down_error_rate_pct: DOWN_ERROR_RATE_PCT,
          warn_error_rate_pct: WARN_ERROR_RATE_PCT,
          global_runs_window: globalWindow.length,
          global_latest_run_at: globalLatestRunAt,
          global_latest_age_minutes: globalLatestAgeMinutes,
          global_is_stale: globalIsStale,
          last_run_distribution: lastRunDistribution,
        },
        debug: debugGlobal && debugAllowed
          ? {
              vercel_env: process.env.VERCEL_ENV || null,
              commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
              global_latest_query: globalLatestQuery,
              global_latest_raw_row: debugGlobalLatestRawRow,
              global_latest_selected: debugGlobalLatestRawRow,
              global_latest_selected_row: debugGlobalLatestRawRow,
              supabase_host_hash: cfg.supabaseHostHash,
              service_role_hash_prefix: cfg.serviceRoleHashPrefix,
              enabled_true_count: (sourcesResolved || []).filter((s: any) => s.enabled === true).length,
              enabled_effective_true_count: (sourcesResolved || []).filter((s: any) => s.enabled_effective === true).length,
              tracked_enabled_flags: (sourcesResolved || [])
                .filter((s: any) => [139, 142, 143, 144].includes(Number(s.id)))
                .map((s: any) => ({ id: s.id, name: s.name, enabled: s.enabled })),
              sample_source_latest_selected: (health || []).slice(0, 2).map((h: any) => ({
                source_id: h.source_id,
                source_name: h.source_name,
                last_run_at: h.last_run_at,
                last_status: h.last_status,
              })),
              db_now: dbNow.value || null,
              db_now_error: dbNow.ok ? null : (dbNow.error || 'db_now_unavailable'),
              parity_ok: parityOk,
              global_rows_last5: globalRowsLast5,
            }
          : undefined,
      }),
    )
  } catch (error) {
    console.error('GET /api/sources failed', error)
    return NextResponse.json(err(`sources_error: ${String(error)}`), { status: 500 })
  }
}

