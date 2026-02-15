'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { IssueSummaryCard } from '@/components/IssueCards'

const REFRESH_REQUEST_EVENT = 'bcnews:refresh-request'
const REFRESH_DONE_EVENT = 'bcnews:refresh-done'

interface IssueRow {
  id: number
  title: string
  issue_summary: string
  why_it_matters: string | null
  region: 'KR' | 'Global'
  topic_label: string
  importance_score: number
  importance_label: string
  last_seen_at_utc: string
  recent_updates_count: number
  confidence_label?: string
}

interface TrendRow {
  name: string
  score: number
  bucket: string
}

export default function DashboardPage() {
  const [topIssues, setTopIssues] = useState<IssueRow[]>([])
  const [topUpdated, setTopUpdated] = useState<IssueRow[]>([])
  const [topics, setTopics] = useState<TrendRow[]>([])
  const [entities, setEntities] = useState<TrendRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [issuesRes, trendRes, updatesRes] = await Promise.all([
        fetch('/api/issues?time_window=24h&limit=8&sort=importance'),
        fetch('/api/trends?time_window=7d&limit=6'),
        fetch('/api/issues?time_window=24h&sort=hybrid&only_updates=1&limit=10'),
      ])

      const issuesPayload = await issuesRes.json()
      const trendPayload = await trendRes.json()
      const updatePayload = await updatesRes.json()

      if (!issuesRes.ok || !issuesPayload?.ok) {
        throw new Error(issuesPayload?.error || 'Failed to load dashboard issues')
      }
      if (!trendRes.ok || !trendPayload?.ok) {
        throw new Error(trendPayload?.error || 'Failed to load dashboard trends')
      }
      if (!updatesRes.ok || !updatePayload?.ok) {
        throw new Error(updatePayload?.error || 'Failed to load dashboard updates')
      }

      setTopIssues(Array.isArray(issuesPayload.data?.issues) ? issuesPayload.data.issues.slice(0, 8) : [])
      setTopUpdated(Array.isArray(updatePayload.data?.issues) ? updatePayload.data.issues.slice(0, 8) : [])
      setTopics(Array.isArray(trendPayload.data?.topics) ? trendPayload.data.topics : [])
      setEntities(Array.isArray(trendPayload.data?.entities) ? trendPayload.data.entities : [])

      const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      window.dispatchEvent(
        new CustomEvent(REFRESH_DONE_EVENT, {
          detail: {
            pathname: window.location.pathname,
            lastUpdatedAt: now,
          },
        }),
      )
    } catch (err) {
      console.error('dashboard load failed', err)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      setTopIssues([])
      setTopUpdated([])
      setTopics([])
      setEntities([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ pathname?: string }>
      if (!custom.detail?.pathname || custom.detail.pathname === window.location.pathname) {
        void load()
      }
    }

    window.addEventListener(REFRESH_REQUEST_EVENT, handler)
    return () => window.removeEventListener(REFRESH_REQUEST_EVENT, handler)
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  const hasUpdates = useMemo(() => topUpdated.length > 0, [topUpdated])

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Issue-first Dashboard</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Today?셲 key stablecoin and digital-asset issues at a glance.
        </p>
      </header>

      {loading ? (
        <div className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">Loading issue intelligence...</div>
      ) : null}
      {error ? (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30">
          {error}
          <button type="button" onClick={() => void load()} className="ml-2 text-xs underline">
            retry
          </button>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">Top Issues (Today)</h2>
          <div className="space-y-3">
            {topIssues.map((issue) => (
              <IssueSummaryCard key={issue.id} issue={issue} />
            ))}
            {topIssues.length === 0 ? <div className="text-sm text-gray-500">No issues for this window.</div> : null}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">Top Updates (last 24h)</h2>
          <div className="space-y-3">
            {hasUpdates ? topUpdated.map((issue) => <IssueSummaryCard key={`upd-${issue.id}`} issue={issue} />) : null}
            {!hasUpdates ? <div className="text-sm text-gray-500">No new updates found.</div> : null}
          </div>
        </section>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 text-sm font-semibold">Trends (7d topics)</h2>
          <ul className="space-y-2">
            {topics.map((item, idx) => (
              <li key={`${item.name}-${idx}`} className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">#{idx + 1}</span>
                <span className="font-medium">{item.name}</span>
                <span className="ml-auto rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">{item.score}</span>
              </li>
            ))}
            {topics.length === 0 ? <li className="text-sm text-gray-500">No trend data yet.</li> : null}
          </ul>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-2 text-sm font-semibold">Entity Momentum</h2>
          <ul className="space-y-2">
            {entities.map((item, idx) => (
              <li key={`${item.name}-${idx}`} className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">#{idx + 1}</span>
                <span className="font-medium">{item.name}</span>
                <span className="ml-auto rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">{item.score}</span>
              </li>
            ))}
            {entities.length === 0 ? <li className="text-sm text-gray-500">No entity data yet.</li> : null}
          </ul>
        </div>
      </section>
    </div>
  )
}


