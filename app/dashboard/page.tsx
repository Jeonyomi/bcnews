'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ANALYSIS_KEYWORDS,
  BREAKING_KEYWORDS,
  FEED_FILTERS,
  SOURCE_TABS,
  type FeedFilterKey,
  type SourceTabKey,
} from '@/lib/dashboardFeedConfig'
import { formatSeoulDateTime } from '@/lib/datetime'

const REFRESH_REQUEST_EVENT = 'bcnews:refresh-request'
const REFRESH_DONE_EVENT = 'bcnews:refresh-done'

interface PendingPost {
  id: number
  headline: string
  source_name: string | null
  tags: string[]
  target_channel: string
}

interface ArticleRow {
  id: number
  title: string
  url: string
  published_at_utc: string
  summary_short: string | null
  why_it_matters: string | null
  importance_label: string | null
  source?: { name?: string | null }
}

const minutesAgo = (value: string) => {
  const ts = new Date(value).getTime()
  if (!Number.isFinite(ts)) return '-'
  const diffMs = Date.now() - ts
  const mins = Math.max(0, Math.floor(diffMs / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const classifyArticle = (article: ArticleRow): FeedFilterKey => {
  const text = `${article.title || ''} ${article.summary_short || ''} ${article.why_it_matters || ''}`.toLowerCase()
  const importance = (article.importance_label || '').toUpperCase()

  if (importance === 'HIGH' || BREAKING_KEYWORDS.some((k) => text.includes(k))) {
    return 'breaking'
  }
  if (ANALYSIS_KEYWORDS.some((k) => text.includes(k))) {
    return 'analysis'
  }
  return 'all'
}

const sourceName = (article: ArticleRow) => (article.source?.name || 'Unknown').trim()

export default function DashboardPage() {
  const [articles, setArticles] = useState<ArticleRow[]>([])
  const [pendingPosts, setPendingPosts] = useState<PendingPost[]>([])
  const [postingId, setPostingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeSourceTab, setActiveSourceTab] = useState<SourceTabKey>('breaking')
  const [activeFilter, setActiveFilter] = useState<FeedFilterKey>('all')

  const loadPendingPosts = useCallback(async () => {
    try {
      const response = await fetch('/api/channel-posts?status=pending&limit=10')
      const payload = await response.json()
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'pending load failed')
      setPendingPosts(Array.isArray(payload.data) ? payload.data : [])
    } catch (e) {
      console.error('pending posts load failed', e)
      setPendingPosts([])
    }
  }, [])

  const updatePending = useCallback(
    async (id: number, action: 'approve' | 'skip') => {
      setPostingId(id)
      try {
        const response = await fetch('/api/channel-posts', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, action, approvedBy: '@master_billybot' }),
        })
        const payload = await response.json()
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'update failed')
        await loadPendingPosts()
      } catch (e) {
        console.error('pending update failed', e)
      } finally {
        setPostingId(null)
      }
    },
    [loadPendingPosts],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const q = new URLSearchParams({
        time_window: '24h',
        sort: 'latest',
        limit: '150',
      })

      const response = await fetch(`/api/articles?${q.toString()}`)
      const payload = await response.json()

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Failed to load dashboard feed')
      }

      setArticles(Array.isArray(payload.data?.articles) ? payload.data.articles : [])

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
      console.error('dashboard feed load failed', err)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      setArticles([])
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
    void loadPendingPosts()
  }, [load, loadPendingPosts])

  const visibleArticles = useMemo(() => {
    const sourceMatcher = SOURCE_TABS.find((tab) => tab.key === activeSourceTab)?.matcher || (() => true)

    return articles.filter((article) => {
      const source = sourceName(article).toLowerCase()
      const sourceMatched = sourceMatcher(source)
      if (!sourceMatched) return false

      if (activeSourceTab === 'breaking' && classifyArticle(article) !== 'breaking') return false

      if (activeFilter === 'all') return true
      return classifyArticle(article) === activeFilter
    })
  }, [articles, activeFilter, activeSourceTab])

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Crypto News Dashboard</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Dense breaking-news feed, source tabs, and latest-first ranking.</p>
      </header>

      <section className="mb-4 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pending Posts (Manual approve)</h2>
          <span className="text-xs text-gray-500">@Krypto_breaking</span>
        </div>
        {pendingPosts.length === 0 ? (
          <div className="text-xs text-gray-500">No pending posts.</div>
        ) : (
          <ul className="space-y-2">
            {pendingPosts.map((post) => (
              <li key={post.id} className="rounded border border-amber-200 bg-white p-2 text-xs dark:border-amber-900 dark:bg-gray-950">
                <div className="font-semibold">{post.headline}</div>
                <div className="mt-1 text-gray-600 dark:text-gray-300">
                  {post.source_name || 'Unknown'} | {post.tags?.join(' ')}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={postingId === post.id}
                    onClick={() => void updatePending(post.id, 'approve')}
                    className="rounded bg-emerald-600 px-2 py-1 text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={postingId === post.id}
                    onClick={() => void updatePending(post.id, 'skip')}
                    className="rounded bg-gray-700 px-2 py-1 text-white disabled:opacity-50"
                  >
                    Skip
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-3 flex flex-wrap gap-2">
        {SOURCE_TABS.map((tab) => {
          const active = tab.key === activeSourceTab
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSourceTab(tab.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </section>

      <section className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Filter</span>
        {FEED_FILTERS.map((filter) => {
          const active = filter.key === activeFilter
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              className={`rounded border px-2.5 py-1 text-xs transition ${
                active
                  ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                  : 'border-gray-300 text-gray-600 hover:border-gray-500 dark:border-gray-700 dark:text-gray-300'
              }`}
            >
              {filter.label}
            </button>
          )
        })}
        <span className="ml-auto text-xs text-gray-500">Sort: Latest</span>
      </section>

      {loading ? <div className="rounded border border-dashed border-gray-300 p-3 text-sm text-gray-500">Loading feed...</div> : null}
      {error ? (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30">
          {error}
          <button type="button" onClick={() => void load()} className="ml-2 text-xs underline">
            retry
          </button>
        </div>
      ) : null}

      {!loading && !error && visibleArticles.length === 0 ? <div className="text-sm text-gray-500">No matching feed items.</div> : null}

      {!loading && visibleArticles.length > 0 ? (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-950">
          {visibleArticles.map((article) => {
            const type = classifyArticle(article)
            const typeLabel = type === 'breaking' ? 'Breaking' : type === 'analysis' ? 'Analysis' : 'News'
            const importance = (article.importance_label || '').toUpperCase() || 'LOW'

            return (
              <li key={article.id} className="px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      importance === 'HIGH'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : importance === 'MED'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {importance}
                  </span>

                  <div className="min-w-0 flex-1">
                    <a href={article.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-semibold leading-5 hover:underline">
                      {article.title}
                    </a>

                    <div className="mt-1 line-clamp-1 text-xs text-gray-600 dark:text-gray-400">{article.why_it_matters || article.summary_short || 'No summary yet.'}</div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{sourceName(article)}</span>
                      <span>|</span>
                      <span>{minutesAgo(article.published_at_utc)}</span>
                      <span>({formatSeoulDateTime(article.published_at_utc)} KST)</span>
                      <span>|</span>
                      <span>{typeLabel}</span>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}