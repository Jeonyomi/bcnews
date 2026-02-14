'use client'

import { useState, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { NewsItem } from '@/types'

interface Props {
  item: NewsItem
  defaultExpanded?: boolean
}

const NewsCard = ({ item, defaultExpanded = false }: Props) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [decodedContent, setDecodedContent] = useState(item.content)

  const trimmedContent = useMemo(() => {
    const lines = (decodedContent || '').split('\n')
    let idx = 0
    while (idx < lines.length && lines[idx].trim() === '') idx += 1

    // Remove duplicate top heading if it duplicates the card title (e.g. leading "# Stablecoin ...")
    if (idx < lines.length && /^#\s+/.test(lines[idx].trim())) {
      const headerText = lines[idx].replace(/^#\s*/, '').trim()
      if (headerText === item.title) {
        idx += 1
      }
    }

    return lines.slice(idx).join('\n').trimStart()
  }, [decodedContent, item.title])

  useEffect(() => {
    setDecodedContent(item.content)
  }, [item.content])

  const timeString = new Date(item.created_at_kst || item.created_at).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
  })

  return (
    <article
      className={`group relative overflow-hidden rounded-xl border transition-all ${
        expanded
          ? 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
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
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200'
              }`}
            >
              {item.region}
            </span>
            
            {item.source === 'backup' && (
              <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200">
                Backup
              </span>
            )}
            
            {typeof item.score === 'number' && (
              <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200">
                Score: {item.score}
              </span>
            )}

            {Array.isArray(item.topics) && item.topics.map((topic) => (
              <span
                key={topic}
                className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
              >
                {topic}
              </span>
            ))}
          </div>

          <h3
            className={`mb-[6px] text-[15px] font-semibold tracking-[-0.01em] leading-snug ${
              expanded
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-800 dark:text-white'
            }`}
          >
            {item.title}
          </h3>

          <div
            className={`text-[14px] leading-[1.55] tracking-[-0.01em] text-[#444] dark:text-gray-200
              [&>h1]:mt-[16px] [&>h1]:mb-[8px] [&>h1]:text-[16px] [&>h1]:font-semibold [&>h1]:text-gray-900 dark:[&>h1]:text-white
              [&>h2]:mt-[16px] [&>h2]:mb-[8px] [&>h2]:text-[15px] [&>h2]:font-semibold [&>h2]:text-gray-900 dark:[&>h2]:text-white
              [&>h3]:mt-[12px] [&>h3]:mb-[6px] [&>h3]:text-[14px] [&>h3]:font-semibold [&>h3]:text-gray-900 dark:[&>h3]:text-white
              [&>p]:mb-[6px] [&>p]:break-keep
              [&>ul]:mb-[6px] [&>ul]:list-disc [&>ul]:pl-5
              [&>ol]:mb-[6px] [&>ol]:list-decimal [&>ol]:pl-5
              [&>li]:mb-[2px]
              [&_a]:text-blue-600 hover:[&_a]:text-blue-500 dark:[&_a]:text-blue-400 dark:hover:[&_a]:text-blue-300 [&_a]:break-all
              [&_strong]:font-semibold [&_strong]:text-gray-900 dark:[&_strong]:text-white
              ${expanded ? '' : 'line-clamp-3'}`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{trimmedContent}</ReactMarkdown>
          </div>
        </div>
      </button>

      <div className="px-4 pb-4 pt-0 text-[13px] text-[#777] dark:text-gray-400 sm:px-6">
        {timeString}
      </div>
    </article>
  )
}

export default NewsCard
