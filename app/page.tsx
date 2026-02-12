'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import type { NewsItem } from '@/types'
import NewsCard from '@/components/NewsCard'
import { ThemeToggle } from '@/components/ThemeToggle'

// 재시도 간격 (ms)
const RETRY_INTERVALS = [5000, 10000, 30000] // 5초, 10초, 30초
const MAX_RETRY_INDEX = RETRY_INTERVALS.length - 1

export default function Home() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [retryIndex, setRetryIndex] = useState(0)

  const fetchNews = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/news')
      if (!res.ok) throw new Error('Failed to fetch news')
      const data = await res.json()
      
      // 성공하면 재시도 간격 리셋
      setNews(data.items || [])
      setError(null)
      setRetryIndex(0)
    } catch (err) {
      console.error('Failed to fetch news:', err)
      setError(err as Error)
      // 실패 시 재시도 간격 증가 (최대값 제한)
      setRetryIndex(prev => Math.min(prev + 1, MAX_RETRY_INDEX))
    } finally {
      setLoading(false)
    }
  }, [])

  // 초기 로드 + 자동 새로고침
  useEffect(() => {
    fetchNews()

    // 재시도 간격 기반으로 타이머 설정
    const interval = setInterval(fetchNews, RETRY_INTERVALS[retryIndex])
    return () => clearInterval(interval)
  }, [fetchNews, retryIndex])

  const filteredNews = useMemo(() => news, [news])

  const groupedNews = useMemo(() => {
    const groups: Record<string, NewsItem[]> = {}
    for (const item of filteredNews) {
      const date = new Date(item.created_at).toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const groupTitle = date === today ? 'Today' : date === yesterday ? 'Yesterday' : date
      if (!groups[groupTitle]) groups[groupTitle] = []
      groups[groupTitle].push(item)
    }

    // Sort within each group by created_at desc
    for (const k of Object.keys(groups)) {
      groups[k].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }

    return groups
  }, [filteredNews])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-900 dark:bg-black/70">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Stablecoin News Dashboard
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                EN/KR briefs • click a card to expand
                {error && (
                  <span className="ml-2 text-red-500">
                    (Connection error, retrying in {RETRY_INTERVALS[retryIndex] / 1000}s...)
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchNews}
                disabled={loading}
                className={`rounded px-2 py-1 text-xs ${
                  loading
                    ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
                }`}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Tip: the latest item is expanded by default. Auto-refreshes every{' '}
          {RETRY_INTERVALS[retryIndex] / 1000} seconds.
        </div>

        {Object.keys(groupedNews).length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-900 dark:bg-gray-950 dark:text-gray-300">
            {loading ? 'Loading news...' : error ? 'Failed to load news.' : 'No items found.'}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedNews).map(([date, items]) => (
              <section key={date}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {date === 'Today' || date === 'Yesterday' ? date : date}
                  </h2>
                  <div className="text-xs text-gray-400">{items.length}</div>
                </div>

                <div className="space-y-4">
                  {items.map((item, idx) => (
                    <NewsCard key={item.id} item={item} defaultExpanded={idx === 0} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}