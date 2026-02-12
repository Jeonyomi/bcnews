'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { NewsItem } from '@/types'

interface Props {
  item: NewsItem
  defaultExpanded?: boolean
}

const NewsCard = ({ item, defaultExpanded = false }: Props) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  // Format KST time
  const timeString = new Date(item.created_at_kst || item.created_at).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
  })

  return (
    <article
      className={`group relative overflow-hidden rounded-xl border transition-all ${
        expanded
          ? 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
          : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full cursor-pointer text-left"
      >
        <div className="p-4 sm:p-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${
                item.region === 'KR'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                  : 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400'
              }`}
            >
              {item.region}
            </span>
            {item.source === 'backup' && (
              <span className="rounded bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400">
                Backup
              </span>
            )}
            {item.topics?.map((topic) => (
              <span
                key={topic}
                className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {topic}
              </span>
            ))}
            {item.score != null && (
              <span className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400">
                Score: {item.score}
              </span>
            )}
          </div>

          <h3
            className={`mb-2 font-medium ${
              expanded
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-800 dark:text-gray-200'
            }`}
          >
            {item.title}
          </h3>

          <div
            className={`prose prose-sm max-w-none dark:prose-invert prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-blue-600 dark:prose-headings:text-white dark:prose-p:text-gray-300 dark:prose-a:text-blue-400 ${
              expanded ? '' : 'line-clamp-3'
            }`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
          </div>
        </div>
      </button>

      <div className="px-4 pb-4 pt-0 text-xs text-gray-500 dark:text-gray-400 sm:px-6">
        {timeString}
      </div>
    </article>
  )
}

export default NewsCard