'use client'

import { useState, useEffect } from 'react'
import type { NewsItem, Locale } from '@/types'
import { NewsCard } from '@/components/NewsCard'
import { LocaleToggle } from '@/components/LocaleToggle'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'news'|'metrics'|'settings'>('news')
  const [news, setNews] = useState<NewsItem[]>([])
  const [stats, setStats] = useState({ total: 0, filtered: 0 })
  const [searchText, setSearchText] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [apiStatus, setApiStatus] = useState({ health: '...', lastFetch: null as Date | null })
  const [locale, setLocale] = useState<Locale>('en')

  // Fetch news data
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch('/api/news')
        const data = await res.json()
        setNews(data.items || [])
        setStats({
          total: data.items?.length || 0,
          filtered: data.items?.length || 0
        })
      } catch (error) {
        console.error('Failed to fetch news:', error)
      }
    }

    fetchNews()
    const interval = setInterval(fetchNews, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  // Filter news items
  const filteredNews = news.filter(item => {
    if (searchText) {
      const content = item.body[locale].toLowerCase()
      if (!content.includes(searchText.toLowerCase())) return false
    }
    if (sourceFilter !== 'all' && item.source !== sourceFilter) return false
    return true
  })

  // Group by date
  const groupedNews = filteredNews.reduce((groups, item) => {
    const date = new Date(item.createdAt).toISOString().split('T')[0]
    const groupTitle = date === new Date().toISOString().split('T')[0]
      ? 'Today'
      : date === new Date(Date.now() - 86400000).toISOString().split('T')[0]
        ? 'Yesterday'
        : new Date(date).toLocaleDateString()
    
    if (!groups[groupTitle]) groups[groupTitle] = []
    groups[groupTitle].push(item)
    return groups
  }, {} as Record<string, NewsItem[]>)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-semibold">Stablecoin News Dashboard</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="-mb-px flex space-x-8">
            {['news', 'metrics', 'settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`
                  ${activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                `}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Status bar */}
          <div className="mb-6 flex justify-between items-start">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">API</span>
                <span className="ml-2 text-gray-900">{apiStatus.health}</span>
              </div>
              <div>
                <span className="text-gray-500">Last fetch</span>
                <span className="ml-2 text-gray-900">
                  {apiStatus.lastFetch?.toLocaleTimeString()}
                </span>
              </div>
            </div>
            
            {activeTab === 'news' && (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">News items</span>
                  <span className="ml-2 text-gray-900">{stats.total}</span>
                </div>
                <div>
                  <span className="text-gray-500">Filtered</span>
                  <span className="ml-2 text-gray-900">{filteredNews.length}</span>
                </div>
                <div>
                  <span className="text-gray-500">Last refresh</span>
                  <span className="ml-2 text-gray-900">
                    {apiStatus.lastFetch?.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Content area */}
          {activeTab === 'news' && (
            <div className="space-y-6">
              {/* Controls */}
              <div className="bg-white shadow-sm rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Search</label>
                      <input
                        type="text"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="title or body..."
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Source</label>
                      <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="all">all</option>
                        <option value="cron">cron</option>
                        <option value="manual">manual</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Language</label>
                      <LocaleToggle value={locale} onChange={setLocale} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Actions</label>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Tip: click a card to expand/collapse. Use "Copy" to copy the full body.
                </div>
              </div>

              {/* News items */}
              {Object.entries(groupedNews).map(([date, items]) => (
                <div key={date}>
                  <h3 className="mb-4 text-lg font-medium text-gray-900">
                    {date === 'Today' ? `Today (${new Date().toISOString().split('T')[0]})` : date}
                  </h3>
                  <div className="space-y-4">
                    {items
                      .slice()
                      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
                      .map((item, idx) => (
                        <NewsCard
                          key={item.id}
                          item={item}
                          locale={locale}
                          defaultExpanded={idx === 0}
                        />
                      ))}
                  </div>
                </div>
              ))}

              {filteredNews.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-500">No items match your filters</p>
                  <button
                    onClick={() => {
                      setSearchText('')
                      setSourceFilter('all')
                    }}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-500"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="bg-white shadow-sm rounded-lg p-4">
              <h2 className="text-lg font-medium text-gray-900">Metrics</h2>
              <p className="mt-2 text-gray-500">
                Coming next: USDC/USDT transfers → hourly aggregates → charts.
              </p>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white shadow-sm rounded-lg p-4">
              <h2 className="text-lg font-medium text-gray-900">Settings</h2>
              <p className="mt-2 text-gray-500">
                API status and configuration
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}