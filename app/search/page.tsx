'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const REFRESH_REQUEST_EVENT = 'bcnews:refresh-request'
const REFRESH_DONE_EVENT = 'bcnews:refresh-done'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [entity, setEntity] = useState('')
  const [issues, setIssues] = useState<any[]>([])
  const [articles, setArticles] = useState<any[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [error, setError] = useState('')

  const visibleEntities = useMemo(() => entities.slice(0, 20), [entities])

  const run = useCallback(async () => {
    setError('')

    if (!query.trim()) {
      setIssues([])
      setArticles([])

      const allResp = await fetch(`/api/search?q=&limit=1`)
      const allPayload = await allResp.json()
      if (!allResp.ok || !allPayload?.ok) {
        throw new Error(allPayload?.error || 'Failed to load entities')
      }
      setEntities(allPayload.data?.entities || [])

      const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      window.dispatchEvent(
        new CustomEvent(REFRESH_DONE_EVENT, {
          detail: {
            pathname: window.location.pathname,
            lastUpdatedAt: now,
          },
        }),
      )
      return
    }

    const params = new URLSearchParams({
      q: query,
      limit: '20',
    })
    if (entity) params.set('entity', entity)

    const response = await fetch(`/api/search?${params.toString()}`)
    const payload = await response.json()
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || 'Failed to search')
    }
    setIssues(payload.data?.issues || [])
    setArticles(payload.data?.articles || [])
    setEntities(payload.data?.entities || [])

    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    window.dispatchEvent(
      new CustomEvent(REFRESH_DONE_EVENT, {
        detail: {
          pathname: window.location.pathname,
          lastUpdatedAt: now,
        },
      }),
    )
  }, [query, entity])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ pathname?: string }>
      if (!custom.detail?.pathname || custom.detail.pathname === window.location.pathname) {
        void run()
      }
    }

    const timer = setTimeout(() => {
      void run().catch((e) => {
        console.error('search failed', e)
        setError(e instanceof Error ? e.message : 'Search failed')
        setIssues([])
        setArticles([])
      })
    }, 250)

    window.addEventListener(REFRESH_REQUEST_EVENT, handler)
    return () => {
      clearTimeout(timer)
      window.removeEventListener(REFRESH_REQUEST_EVENT, handler)
    }
  }, [run])

  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold">Search</h1>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search issues and articles"
          className="h-10 w-full rounded border border-gray-300 bg-white px-3 dark:border-gray-700 dark:bg-gray-900"
        />
        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          className="h-10 rounded border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="">Entity: All</option>
          {visibleEntities.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      {error ? <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30">{error}</div> : null}

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

