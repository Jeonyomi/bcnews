'use client'

import { useEffect, useState } from 'react'
import { IssueSummaryCard } from '@/components/IssueCards'
import ListFilterBar from '@/components/ListFilterBar'

export default function IssuesPage() {
  const [items, setItems] = useState<any[]>([])
  const [viewTable, setViewTable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [timeWindow, setTimeWindow] = useState('24h')
  const [region, setRegion] = useState('All')
  const [topic, setTopic] = useState('all')
  const [sort, setSort] = useState('hybrid')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const q = new URLSearchParams({
        time_window: timeWindow,
        region,
        topic,
        sort,
        limit: '50',
      })
      if (search) q.set('search', search)

      const res = await fetch(`/api/issues?${q.toString()}`)
      const payload = await res.json()
      setItems(payload.data?.issues || [])
      setLoading(false)
    }

    run()
  }, [timeWindow, region, topic, sort, search])

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold">Issues</h1>
        <button
          type="button"
          onClick={() => setViewTable((v) => !v)}
          className="h-9 rounded border border-gray-300 bg-white px-3 text-xs font-semibold dark:border-gray-700 dark:bg-gray-900"
        >
          {viewTable ? 'Card view' : 'Table view'}
        </button>
      </div>

      <ListFilterBar
        timeWindow={timeWindow}
        region={region}
        topic={topic}
        sort={sort}
        search={search}
        onTimeWindow={setTimeWindow}
        onRegion={setRegion}
        onTopic={setTopic}
        onSort={setSort}
        onSearch={(value) => setSearch(value)}
      />

      {loading ? <div className="text-sm text-gray-500">Loading issues...</div> : null}

      {!loading && items.length === 0 ? <div className="text-sm text-gray-500">No issues found.</div> : null}

      {viewTable ? (
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Issue</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Region</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Topic</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Importance</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((issue) => (
                <tr key={`t-${issue.id}`} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2">
                    <a href={`/issues/${issue.id}`} className="font-medium hover:underline">
                      {issue.title}
                    </a>
                  </td>
                  <td className="px-3 py-2">{issue.region}</td>
                  <td className="px-3 py-2">{issue.topic_label}</td>
                  <td className="px-3 py-2">{issue.importance_label}</td>
                  <td className="px-3 py-2">
                    {new Intl.DateTimeFormat('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(issue.last_seen_at_utc))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">{items.map((issue) => <IssueSummaryCard key={issue.id} issue={issue} />)}</div>
      )}
    </div>
  )
}
