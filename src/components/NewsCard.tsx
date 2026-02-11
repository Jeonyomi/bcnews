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
  let s = (md || '').replace(/\r\n/g, '\n')

  // Normalize common label lines into bold markdown labels
  s = s
    .replace(/^\s*-\s*Summary\s*:\s*/gmi, '- **Summary:** ')
    .replace(/^\s*-\s*Why it matters\s*:\s*/gmi, '- **Why it matters:** ')
    .replace(/^\s*-\s*Link\s*:\s*/gmi, '- **Link:** ')

  // Ensure blank lines around section headers so [KR] / [Global] blocks are visually separated
  s = s.replace(/\n*(\[(KR|Global|Watchlist|One-liner|한국|글로벌|주시 항목|한 줄 요약)\])\n*/g, '\n\n$1\n\n')

  // Collapse excessive blank lines
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
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden dark:border-gray-800 dark:bg-gray-950">
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
      
      <div className={expanded ? 'px-4 pb-4' : 'hidden'}>
        <div className="prose prose-sm md:prose-base max-w-none prose-headings:font-semibold prose-a:break-words prose-a:text-blue-700 prose-a:underline prose-a:underline-offset-2 dark:prose-invert dark:prose-a:text-blue-300">
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
        <div className="px-4 pb-4 text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
          {content.split('\n')[0]}
        </div>
      )}
    </div>
  )
}