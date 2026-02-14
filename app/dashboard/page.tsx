'use client'

import { useEffect, useMemo, useState } from 'react'
import { IssueSummaryCard } from '@/components/IssueCards'

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

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      try {
        const [issuesRes, trendRes, updatesRes] = await Promise.all([
          fetch('/api/issues?time_window=24h&limit=8&sort=importance'),
          fetch('/api/trends?time_window=7d&limit=6'),
          fetch('/api/issues?time_window=24h&sort=hybrid&limit=10'),
        ])

        const issuesPayload = await issuesRes.json()
        const trendPayload = await trendRes.json()
        const updatePayload = await updatesRes.json()

        setTopIssues(Array.isArray(issuesPayload.data?.issues) ? issuesPayload.data.issues.slice(0, 8) : [])
        setTopUpdated(Array.isArray(updatePayload.data?.issues) ? updatePayload.data.issues.slice(0, 8) : [])
        setTopics(Array.isArray(trendPayload.data?.topics) ? trendPayload.data.topics : [])
        setEntities(Array.isArray(trendPayload.data?.entities) ? trendPayload.data.entities : [])
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [])

  const hasUpdates = useMemo(() => topUpdated.length > 0, [topUpdated])

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Issue-first Dashboard</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Today’s key stablecoin and digital-asset issues at a glance.
        </p>
      </header>

      {loading ? (
        <div className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">Loading issue intelligence...</div>
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
            {hasUpdates
              ? topUpdated.map((issue) => <IssueSummaryCard key={`upd-${issue.id}`} issue={issue} />)
              : null}
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
