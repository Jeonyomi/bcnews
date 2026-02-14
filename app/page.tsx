'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import type { NewsItem, Region, Topic } from '@/types'
import NewsCard from '@/components/NewsCard'
import { ThemeToggle } from '@/components/ThemeToggle'
import { FilterBar } from '@/components/FilterBar'

const RETRY_INTERVALS = [5000, 10000, 30000]
const MAX_RETRY_INDEX = RETRY_INTERVALS.length - 1

export default function Home() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [retryIndex, setRetryIndex] = useState(0)
  const [selectedRegion, setSelectedRegion] = useState<Region | 'all'>('all')
  const [selectedTopic, setSelectedTopic] = useState<Topic | 'all'>('all')

  const fetchNews = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/news?t=${Date.now()}`)
      if (!res.ok) throw new Error('Failed to fetch news')
      const data = await res.json()

      setNews(data.items || [])
      setError(null)
      setRetryIndex(0)
    } catch (err) {
      console.error('Failed to fetch news:', err)
      setError(err as Error)
      setRetryIndex(prev => Math.min(prev + 1, MAX_RETRY_INDEX))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNews()
    const interval = setInterval(fetchNews, RETRY_INTERVALS[retryIndex])
    return () => clearInterval(interval)
  }, [fetchNews, retryIndex])

  const filteredNews = useMemo(() => {
    return news.filter((item) => {
      const regionMatch = selectedRegion === 'all' || item.region === selectedRegion
      const topicMatch =
        selectedTopic === 'all' || item.topics?.includes(selectedTopic)
      return regionMatch && topicMatch
    })
  }, [news, selectedRegion, selectedTopic])

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

    for (const k of Object.keys(groups)) {
      groups[k].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }

    return groups
  }, [filteredNews])

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-black/90">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Stablecoin News Dashboard
                </h1>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  EN/KR briefs • click a card to expand
                  {error && (
                    <span className="ml-2 text-red-500 dark:text-red-400">
                      (Connection error, retrying in {RETRY_INTERVALS[retryIndex] / 1000}s...)
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <ThemeToggle />
              </div>
            </div>

            <FilterBar
              selectedRegion={selectedRegion}
              selectedTopic={selectedTopic}
              onRegionChange={setSelectedRegion}
              onTopicChange={setSelectedTopic}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {Object.keys(groupedNews).length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            {loading ? 'Loading news...' : error ? 'Failed to load news.' : 'No matching items found.'}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedNews).map(([date, items]) => (
              <section key={date}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {date === 'Today' || date === 'Yesterday' ? date : date}
                  </h2>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{items.length}</div>
                </div>

                <div className="space-y-4">
                  {items.map((item, idx) => (
                    <NewsCard
                      key={item.id}
                      item={item}
                      defaultExpanded={date === 'Today'}
                    />
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
