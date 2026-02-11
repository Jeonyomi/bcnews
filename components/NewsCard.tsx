import { useState } from 'react'
import type { NewsItem } from '@/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface NewsCardProps {
  item: NewsItem
  defaultExpanded?: boolean
}

function normalizeMarkdown(md: string): string {
  let s = (md || '').replace(/\r\n/g, '\n')

  // Ensure blank lines around section headers so [KR] / [Global] blocks are visually separated
  s = s.replace(/\n*(\[(KR|Global|Watchlist|One-liner)\])\n*/g, '\n\n$1\n\n')

  // Collapse excessive blank lines
  s = s.replace(/\n{3,}/g, '\n\n')

  return s.trim()
}

export function NewsCard({ item, defaultExpanded = false }: NewsCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const content = normalizeMarkdown(String(item.body || ''))

  const timeAgo = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)

    if (minutes < 60) return `${minutes}m ago`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
    return `${Math.floor(minutes / 1440)}d ago`
  }

  const createdAt = new Date(item.createdAt as any)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden dark:border-gray-800 dark:bg-gray-950">
      <div className="px-4 py-3 flex justify-between items-start">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{item.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <time dateTime={createdAt.toISOString()} title={createdAt.toLocaleString()}>
              {timeAgo(createdAt)}
            </time>
            <span>•</span>
            <span>{item.source}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      <div className={expanded ? 'px-4 pb-4' : 'hidden'}>
        <div className="max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: (props) => (
                <h1
                  {...props}
                  className="mb-4 text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100"
                />
              ),
              h2: (props) => (
                <h2
                  {...props}
                  className="mt-6 mb-4 text-xl font-extrabold text-gray-900 dark:text-gray-100"
                />
              ),
              h3: (props) => (
                <h3
                  {...props}
                  className="mt-6 mb-3 text-lg font-bold text-gray-900 dark:text-gray-100"
                />
              ),
              h4: (props) => (
                <h4
                  {...props}
                  className="mt-4 mb-2 text-base font-bold text-gray-900 dark:text-gray-100"
                />
              ),
              hr: () => <div className="my-6 h-px w-full bg-gray-200 dark:bg-gray-800" />,
              ul: (props) => <ul {...props} className="my-2 list-disc space-y-1 pl-6" />,
              ol: (props) => <ol {...props} className="my-2 list-decimal space-y-1 pl-6" />,
              p: (props) => <p {...props} className="my-2 leading-relaxed text-gray-900 dark:text-gray-100" />,
              a: (props) => (
                <a
                  {...props}
                  className="text-blue-700 underline underline-offset-2 decoration-2 decoration-blue-500 dark:text-blue-300 dark:decoration-blue-300 break-words"
                  target="_blank"
                  rel="noreferrer"
                />
              )
            }}
          >
            {content}
          </ReactMarkdown>
        </div>

        <div className="mt-2 text-xs text-gray-400">
          <span>id: </span>
          <code>{item.id}</code>
        </div>
      </div>

      {!expanded && (
        <div className="px-4 pb-4 text-sm text-gray-800 dark:text-gray-100 whitespace-pre-line">
          {(() => {
            const lines = content
              .split('\n')
              .map((l) => l.trimEnd())
              .filter((l) => l.trim().length > 0)

            const preview = lines.slice(0, 3).join('\n')
            return <div className="line-clamp-3">{preview}</div>
          })()}
        </div>
      )}
    </div>
  )
}
