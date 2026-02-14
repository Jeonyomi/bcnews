'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [issues, setIssues] = useState<any[]>([])
  const [articles, setArticles] = useState<any[]>([])

  useEffect(() => {
    const run = async () => {
      if (!query.trim()) {
        setIssues([])
        setArticles([])
        return
      }

      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`)
      const payload = await response.json()
      setIssues(payload.data?.issues || [])
      setArticles(payload.data?.articles || [])
    }

    const timer = setTimeout(run, 250)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold">Search</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search issues and articles"
        className="h-10 w-full rounded border border-gray-300 bg-white px-3 dark:border-gray-700 dark:bg-gray-900"
      />

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Issues</h2>
        <div className="space-y-2">
          {issues.length === 0 ? <div className="text-sm text-gray-500">{query ? 'No issues matched.' : 'Type to search.'}</div> : null}
          {issues.map((item) => (
            <a key={`i-${item.id}`} href={`/issues/${item.id}`} className="block rounded border border-gray-200 bg-white p-3 text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900">
              <div className="font-medium">{item.title}</div>
              <div className="text-xs text-gray-500">{item.subtitle}</div>
              <div className="text-xs text-gray-500">{item.snippet}</div>
            </a>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Articles</h2>
        <div className="space-y-2">
          {articles.length === 0 ? <div className="text-sm text-gray-500">{query ? 'No articles matched.' : 'Type to search.'}</div> : null}
          {articles.map((item) => (
            <a
              key={`a-${item.id}`}
              href={`/articles?search=${encodeURIComponent(item.title)}`}
              className="block rounded border border-gray-200 bg-white p-3 text-sm hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
            >
              <div className="font-medium">{item.title}</div>
              <div className="text-xs text-gray-500">{item.subtitle}</div>
              <div className="text-xs text-gray-500">{item.snippet}</div>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
