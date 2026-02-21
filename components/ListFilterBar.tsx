"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const WINDOW_OPTIONS = ['6h', '12h', '24h', '7d'] as const
const REGION_OPTIONS = ['All', 'Global', 'KR'] as const

export default function ListFilterBar({
  timeWindow,
  region,
  topic,
  sort,
  search,
  onTimeWindow,
  onRegion,
  onTopic,
  onSort,
  onSearch,
}: {
  timeWindow: string
  region: string
  topic: string
  sort: string
  search: string
  onTimeWindow: (value: string) => void
  onRegion: (value: string) => void
  onTopic: (value: string) => void
  onSort: (value: string) => void
  onSearch: (value: string) => void
}) {
  const pathname = usePathname()
  const topicList = ['all', 'regulation', 'issuer', 'payments', 'macro', 'aml', 'defi']

  return (
    <section className="sticky top-0 z-20 -mx-4 mb-4 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90 md:-mx-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={`Search ${pathname.includes('/articles') ? 'articles' : pathname.includes('/issues') ? 'issues' : 'news'}...`}
          className="h-9 flex-1 min-w-44 rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />

        <select value={timeWindow} onChange={(e) => onTimeWindow(e.target.value)} className="h-9 rounded border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {WINDOW_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select value={region} onChange={(e) => onRegion(e.target.value)} className="h-9 rounded border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {REGION_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select value={topic} onChange={(e) => onTopic(e.target.value)} className="h-9 rounded border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {topicList.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select value={sort} onChange={(e) => onSort(e.target.value)} className="h-9 rounded border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="hybrid">hybrid</option>
          <option value="latest">latest</option>
          <option value="importance">importance</option>
        </select>

        <Link
          href="/dashboard"
          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Dashboard
        </Link>
      </div>
    </section>
  )
}
