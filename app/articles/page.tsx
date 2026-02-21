'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArticleTableRow } from '@/components/IssueCards'
import ListFilterBar from '@/components/ListFilterBar'

const REFRESH_REQUEST_EVENT = 'bcnews:refresh-request'
const REFRESH_DONE_EVENT = 'bcnews:refresh-done'

export default function ArticlesPage() {
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timeWindow, setTimeWindow] = useState('24h')
  const [region, setRegion] = useState('All')
  const [topic, setTopic] = useState('all')
  const [sort, setSort] = useState('latest')
  const [search, setSearch] = useState('')

  const run = useCallback(async () => {
    setLoading(true)
    setError('')
    const q = new URLSearchParams({
      time_window: timeWindow,
      region,
      topic,
      sort,
      limit: '100',
    })
    if (search) q.set('search', search)

    try {
      const response = await fetch(`/api/articles?${q.toString()}`)
      const payload = await response.json()
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Failed to load articles')
      }
      setArticles(payload.data?.articles || [])

      const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      window.dispatchEvent(
        new CustomEvent(REFRESH_DONE_EVENT, {
          detail: {
            pathname: window.location.pathname,
            lastUpdatedAt: now,
          },
        }),
      )
    } catch (e) {
      console.error('load articles failed', e)
      setError(e instanceof Error ? e.message : 'Failed to load articles')
      setArticles([])
    } finally {
      setLoading(false)
    }
  }, [timeWindow, region, topic, sort, search])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ pathname?: string }>
      if (!custom.detail?.pathname || custom.detail.pathname === window.location.pathname) {
        void run()
      }
    }

    window.addEventListener(REFRESH_REQUEST_EVENT, handler)
    return () => window.removeEventListener(REFRESH_REQUEST_EVENT, handler)
  }, [run])

  useEffect(() => {
    void run()
  }, [run])

  return (
    <div>
      <div className="mb-2">
        <a href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ← Back to Dashboard
        </a>
      </div>
      <h1 className="mb-3 text-xl font-semibold">Articles</h1>

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
        onSearch={setSearch}
      />

      {loading ? <div className="text-sm text-gray-500">Loading articles...</div> : null}

      {error ? <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30">{error}</div> : null}
      {!loading && !error && articles.length === 0 ? <div className="text-sm text-gray-500">No articles found.</div> : null}

      {!loading ? (
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
          <table className="min-w-full table-fixed text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="w-[42%] px-3 py-2 text-left text-xs text-gray-500">Article</th>
                <th className="w-[12%] px-3 py-2 text-left text-xs text-gray-500">Region</th>
                <th className="w-[12%] px-3 py-2 text-left text-xs text-gray-500">Issue chip</th>
                <th className="w-[12%] px-3 py-2 text-left text-xs text-gray-500">Importance</th>
                <th className="w-[10%] px-3 py-2 text-left text-xs text-gray-500">Confidence</th>
                <th className="w-[12%] px-3 py-2 text-left text-xs text-gray-500">Published (KST)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {articles.map((article) => (
                <ArticleTableRow key={article.id} article={article} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}


