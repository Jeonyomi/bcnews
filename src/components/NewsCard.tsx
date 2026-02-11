import { useState } from 'react'
import type { NewsItem, Locale } from '@/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface NewsCardProps {
  item: NewsItem
  locale: Locale
  defaultExpanded?: boolean
}

function normalizeMarkdown(md: string): string {
  // Normalize Windows newlines + collapse excessive blank lines
  let s = (md || '').replace(/\r\n/g, '\n')

  // Ensure a blank line after section headers like [KR]
  s = s.replace(/\n?(\[(KR|Global|Watchlist|One-liner|한국|글로벌|주시 항목|한 줄 요약)\])\n(?!\n)/g, '$1\n\n')

  // Normalize bullet/paragraph spacing
  s = s.replace(/\n{3,}/g, '\n\n')

  return s.trim()
}

export function NewsCard({ item, locale, defaultExpanded = false }: NewsCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const raw = locale === 'ko' ? item.body.ko : item.body.en
  const content = normalizeMarkdown(raw)
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(content)
  }

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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex justify-between items-start">
        <div>
          <h3 className="font-medium text-gray-900">{item.title}</h3>
          <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
            <time dateTime={createdAt.toISOString()} title={createdAt.toLocaleString()}>
              {timeAgo(createdAt)}
            </time>
            <span>•</span>
            <span>{item.source}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Copy
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>
      
      <div className={expanded ? 'px-4 pb-3' : 'hidden'}>
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          <span>id: </span>
          <code>{item.id}</code>
        </div>
      </div>
      
      {!expanded && (
        <div className="px-4 pb-3 text-sm text-gray-600 line-clamp-2">
          {content.split('\n')[0]}
        </div>
      )}
    </div>
  )
}