'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { NewsItem } from '@/types'

interface Props {
  item: NewsItem
  defaultExpanded?: boolean
}

export function NewsCard({ item, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <article
      className={`group relative overflow-hidden rounded-xl border bg-white transition-all dark:bg-gray-950 ${
        expanded
          ? 'border-gray-300 dark:border-gray-700'
          : 'border-gray-200 dark:border-gray-900'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full cursor-pointer text-left"
      >
        <div className="p-4 sm:p-6">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${
                  item.region === 'KR'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                }`}
              >
                {item.region}
              </span>
              {item.source === 'backup' && (
                <span className="rounded bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
                  Backup
                </span>
              )}
              {item.topics?.map((topic) => (
                <span
                  key={topic}
                  className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300"
                >
                  {topic}
                </span>
              ))}
              {item.score && (
                <span className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                  {item.score}
                </span>
              )}
            </div>
          </div>

          <h3
            className={`font-medium ${
              expanded
                ? 'text-gray-900 dark:text-gray-100'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {item.title}
          </h3>

          <div
            className={`prose prose-sm mt-2 max-w-none dark:prose-invert ${
              expanded ? '' : 'line-clamp-3'
            }`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
          </div>
        </div>
      </button>

      <div className="px-4 pb-4 pt-0 text-xs text-gray-500 dark:text-gray-400 sm:px-6">
        {new Date(item.created_at_kst).toLocaleString('ko-KR', {
          timeZone: 'Asia/Seoul',
        })}
      </div>
    </article>
  )
}