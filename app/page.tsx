'use client'

import { useEffect, useMemo, useState } from 'react'
import type { NewsItem } from '@/types'
import { NewsCard } from '@/components/NewsCard'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function Home() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [sourceFilter, setSourceFilter] = useState('all')

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch('/api/news')
        const data = await res.json()
        setNews(data.items || [])
      } catch (error) {
        console.error('Failed to fetch news:', error)
      }
    }

    fetchNews()
    const interval = setInterval(fetchNews, 30000)
    return () => clearInterval(interval)
  }, [])

  const filteredNews = useMemo(() => {
    return news.filter((item) => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false
      return true
    })
  }, [news, sourceFilter])

  const groupedNews = useMemo(() => {
    const groups: Record<string, NewsItem[]> = {}
    for (const item of filteredNews) {
      const date = new Date(item.createdAt as any).toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const groupTitle = date === today ? 'Today' : date === yesterday ? 'Yesterday' : date
      if (!groups[groupTitle]) groups[groupTitle] = []
      groups[groupTitle].push(item)
    }

    // Sort within each group by createdAt desc
    for (const k of Object.keys(groups)) {
      groups[k].sort(
        (a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()
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
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Stablecoin News Dashboard</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">EN/KR briefs • click a card to expand</p>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </div>

          {/* Controls */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">Source</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
              >
                <option value="all">all</option>
                <option value="cron">cron</option>
                <option value="manual">manual</option>
                <option value="seed">seed</option>
                <option value="cron-manual">cron-manual</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Tip: the latest item is expanded by default. Use Copy to copy the full body.
        </div>

        {Object.keys(groupedNews).length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-900 dark:bg-gray-950 dark:text-gray-300">
            No items match your filters.
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
