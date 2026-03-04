"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatSeoulDateTime } from '@/lib/datetime'

const REFRESH_REQUEST_EVENT = 'bcnews:refresh-request'
const REFRESH_DONE_EVENT = 'bcnews:refresh-done'

type HealthRow = {
  source_id: number
  source_name: string
  status: 'ok' | 'warn' | 'down' | 'disabled' | 'restricted' | 'throttled' | 'stale' | 'na'
  last_status: string | null
  last_items: number
  last_saved: number
  last_error: string | null
  last_run_at: string | null
  display_last_run_at?: string | null
  runs: number
  source_runs?: number
  global_runs?: number
  warn_runs: number
  error_runs: number
  success_rate: number | null
  error_rate: number | null
  total_fetched: number
  total_saved: number
}

type Summary = { total: number; ok: number; warn: number; stale: number; down: number; disabled: number; na?: number }
type Meta = {
  health_window_runs: number
  stale_hours: number
  min_runs_for_rate?: number
  down_consecutive_errors?: number
  down_error_rate_pct?: number
  warn_error_rate_pct?: number
  global_runs_window?: number
  global_latest_run_at?: string | null
}

const statusClass: Record<HealthRow['status'], string> = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  restricted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  throttled: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  stale: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  down: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  disabled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  na: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export default function SourcesPage() {
  const [sources, setSources] = useState<any[]>([])
  const [health, setHealth] = useState<HealthRow[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, ok: 0, warn: 0, stale: 0, down: 0, disabled: 0 })
  const [meta, setMeta] = useState<Meta>({ health_window_runs: 20, stale_hours: 6 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const run = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/sources')
      const payload = await response.json()
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Failed to load sources')

      setSources(payload.data.sources || [])
      setHealth(payload.data.health || [])
      setSummary(payload.data.summary || { total: 0, ok: 0, warn: 0, stale: 0, down: 0, disabled: 0 })
      setMeta(payload.data.meta || { health_window_runs: 20, stale_hours: 6 })

      const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      window.dispatchEvent(new CustomEvent(REFRESH_DONE_EVENT, { detail: { pathname: window.location.pathname, lastUpdatedAt: now } }))
    } catch (e) {
      console.error('load sources failed', e)
      setError(e instanceof Error ? e.message : 'Failed to load sources')
      setSources([])
      setHealth([])
      setSummary({ total: 0, ok: 0, warn: 0, stale: 0, down: 0, disabled: 0 })
      setMeta({ health_window_runs: 20, stale_hours: 6 })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ pathname?: string }>
      if (!custom.detail?.pathname || custom.detail.pathname === window.location.pathname) void run()
    }
    window.addEventListener(REFRESH_REQUEST_EVENT, handler)
    return () => window.removeEventListener(REFRESH_REQUEST_EVENT, handler)
  }, [run])

  useEffect(() => {
    void run()
  }, [run])

  const healthMap = useMemo(() => new Map<number, HealthRow>(health.map((row) => [row.source_id, row])), [health])

  const activeSources = useMemo(
    () => sources.filter((source) => source.enabled !== false && (healthMap.get(source.id)?.status || 'warn') !== 'disabled'),
    [sources, healthMap],
  )

  const activeSummary = useMemo(
    () => ({
      total: summary.total - (summary.disabled || 0),
      na: summary.na || 0,
      ok: summary.ok,
      warn: summary.warn,
      stale: summary.stale,
      down: summary.down,
    }),
    [summary],
  )

  const renderDate = (value?: string | null) => {
    if (!value) return '-'
    try {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value
      return `${formatSeoulDateTime(date)} KST`
    } catch {
      return value
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading sources...</div>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Sources Health</h1>
      <p className="text-sm text-gray-500">Ingest reliability overview with stale/down detection and recent success/error ratios.</p>
      <p className="text-xs text-gray-500">
        Window: last {meta.health_window_runs} runs per source; stale if no run for {meta.stale_hours}h; warn if error_rate &gt;=
        {meta.warn_error_rate_pct ?? 20}% (runs &gt;= {meta.min_runs_for_rate ?? 10}); down if {meta.down_consecutive_errors ?? 5} consecutive errors or error_rate &gt;=
        {meta.down_error_rate_pct ?? 80}%. Global run logs in window: {meta.global_runs_window ?? 0}. Global latest run: {renderDate(meta.global_latest_run_at)}.
      </p>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Total (active)', activeSummary.total],
          ['OK', activeSummary.ok],
          ['Warn', activeSummary.warn],
          ['N/A', (activeSummary as any).na || 0],
          ['Stale', activeSummary.stale],
          ['Down', activeSummary.down],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-lg font-semibold">{value as number}</div>
          </div>
        ))}
      </section>

      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Last run</th>
              <th className="px-3 py-2 text-left">Last saved</th>
              <th className="px-3 py-2 text-left">Error rate</th>
              <th className="px-3 py-2 text-left">Last error</th>
            </tr>
          </thead>
          <tbody>
            {activeSources.map((source) => {
              const row = healthMap.get(source.id)
              const status = row?.status || 'na'
              const sourceRuns = row?.source_runs ?? 0

              return (
                <tr key={source.id} className="border-b border-gray-100 align-top dark:border-gray-800">
                  <td className="px-3 py-2">
                    <div className="font-medium">{source.name}</div>
                    <details className="mt-1">
                      <summary className="cursor-pointer select-none text-xs text-gray-500">details</summary>
                      <div className="mt-1 space-y-1 text-xs text-gray-500">
                        <div>Type/Region: {source.type} / {source.region || 'All'}</div>
                        <div>Runs (source/global): {row?.source_runs ?? 0} / {row?.global_runs ?? meta.global_runs_window ?? 0}</div>
                        <div>Last fetched/saved (items/saved): {sourceRuns === 0 ? '- / -' : `${row?.last_items || 0} / ${row?.last_saved || 0}`}</div>
                        <div>Success/Error: {sourceRuns === 0 ? '- / -' : `${row?.success_rate ?? 0}% / ${row?.error_rate ?? 0}%`}</div>
                        <div>Recent totals (fetched/saved): {sourceRuns === 0 ? '- / -' : `${row?.total_fetched || 0} / ${row?.total_saved || 0}`}</div>
                      </div>
                    </details>
                  </td>
                  <td className="px-3 py-2">{source.tier || '-'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold uppercase ${statusClass[status as HealthRow['status']]}`}>
                      {status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{renderDate(row?.display_last_run_at || row?.last_run_at)}</td>
                  <td className="px-3 py-2 text-xs">{sourceRuns === 0 ? '-' : String(row?.last_saved || 0)}</td>
                  <td className="px-3 py-2 text-xs">{sourceRuns === 0 ? '-' : `${row?.error_rate ?? 0}%`}</td>
                  <td className="max-w-[340px] truncate px-3 py-2 text-xs text-red-500" title={row?.last_error || ''}>
                    {row?.last_error || '-'}
                  </td>
                </tr>
              )
            })}
            {activeSources.length === 0 ? (
              <tr>
                <td className="px-3 py-2 text-sm text-gray-500" colSpan={7}>
                  No active sources configured.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30">{error}</div>
      ) : null}
    </div>
  )
}
