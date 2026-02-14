'use client'

import { useEffect, useState } from 'react'
import { ArticleTableRow } from '@/components/IssueCards'
import ListFilterBar from '@/components/ListFilterBar'

export default function ArticlesPage() {
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [timeWindow, setTimeWindow] = useState('24h')
  const [region, setRegion] = useState('All')
  const [topic, setTopic] = useState('all')
  const [sort, setSort] = useState('latest')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const q = new URLSearchParams({
        time_window: timeWindow,
        region,
        topic,
        sort,
        limit: '100',
      })
      if (search) q.set('search', search)

      const response = await fetch(`/api/articles?${q.toString()}`)
      const payload = await response.json()
      setArticles(payload.data?.articles || [])
      setLoading(false)
    }

    run()
  }, [timeWindow, region, topic, sort, search])

  return (
    <div>
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

      {!loading && articles.length === 0 ? <div className="text-sm text-gray-500">No articles found.</div> : null}

      {!loading ? (
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Article</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Region</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Issue chip</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Importance</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Confidence</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">Published (KST)</th>
              </tr>
            </thead>
            <tbody>
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
