'use client'

import { useMemo, useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { NewsItem } from '@/types'

const looksWrongOffsetKst = (value: string | null) =>
  !!value && /\+00:00$/.test(value)

const getDisplayTime = (item: NewsItem) => {
  const source = looksWrongOffsetKst(item.created_at_kst) ? item.created_at : item.created_at_kst
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(new Date(source || item.created_at))
}

interface Props {
  item: NewsItem
  defaultExpanded?: boolean
}

const REGULATORY_PREFIX = /^Digital Asset & Stablecoin\s+Regulatory Brief\b:?\s*/i
const DAILY_PREFIX = /^Digital Asset & Stablecoin\s+Daily News Brief\b:?\s*/i
const SECTION_HEADER = 'Daily Stablecoin News Brief'

const stripBrand = (value: string) =>
  value
    .replace(REGULATORY_PREFIX, '')
    .replace(DAILY_PREFIX, '')
    .trim()

const mapHeader = (value: string) => {
  if (REGULATORY_PREFIX.test(value) || DAILY_PREFIX.test(value)) {
    return SECTION_HEADER
  }
  return value
}

const formatSectionTitle = (value: string) =>
  value
    .replace(/^KR\s*\(KST\)\s*Top 5$/i, '🇰🇷 Korea Top 5')
    .replace(/^Korea\s*Top 5$/i, '🇰🇷 Korea Top 5')
    .replace(/^Global\s*\(KST\)\s*Top 5$/i, '🌐 Global Top 5')
    .replace(/^Global\s*Top 5$/i, '🌐 Global Top 5')

const normalizeBriefLinks = (content: string) =>
  content
    .replace(/^([ \t]*-\s*)?링크:\s*(https?:\/\/\S+)(\s*)$/gm, '$1[LINK]($2)$3')
    .replace(/^([ \t]*-\s*)?LINK:\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)(\s*)$/gm, '$1[LINK]($3)$4')

const normalizeBriefContent = (content: string) =>
  normalizeBriefLinks(content)
    .replace(/^##\s*(?:KR\s*\(KST\)\s*Top 5|Korea\s*(?:\(KST\)\s*)?Top 5|KOREA\s*TOP\s*5)\s*$/gim, '## ' + formatSectionTitle('KR (KST) Top 5'))
    .replace(/^##\s*(?:Global\s*\(KST\)\s*Top 5|GLOBAL\s*TOP\s*5)\s*$/gim, '## ' + formatSectionTitle('Global (KST) Top 5'))

const hasSectionHeading = (content: string) =>
  /(^|\n)##\s*(🇰🇷\s*Korea\s*Top\s*5|Korea\s*Top\s*5|🌐\s*Global\s*Top\s*5|Global\s*Top\s*5)/im.test(content)

const withExpectedSectionHeading = (item: NewsItem, content: string) => {
  if (hasSectionHeading(content)) return content

  if (item.region === 'KR') {
    return `## ${formatSectionTitle('KR (KST) Top 5')}\n\n${content}`
  }

  return `## ${formatSectionTitle('Global (KST) Top 5')}\n\n${content}`
}

const getLeadingSectionTitle = (content: string) => {
  const match = /^##\s*([^\n]+)\s*$/m.exec(content)
  if (!match) return null

  const raw = match[1]?.trim() || ''
  if (/korea\s*top\s*5/i.test(raw) || /global\s*top\s*5/i.test(raw)) {
    return raw
  }

  return null
}

const stripLeadingSectionTitle = (content: string) =>
  content.replace(/^##\s*[^\n]+\s*\n\n?/i, '').trimStart()

const NewsCard = ({ item, defaultExpanded = false }: Props) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [decodedContent, setDecodedContent] = useState(item.content)

  const trimmedLines = useMemo(() => (decodedContent || '').split('\n'), [decodedContent])

  const displayTitle = useMemo(() => {
    const mappedTitle = mapHeader(item.title || '')
    if (mappedTitle !== (item.title || '')) return mappedTitle

    const directTitle = stripBrand(item.title || '')
    if (directTitle) return directTitle

    for (const rawLine of trimmedLines) {
      const line = rawLine.trim()
      if (!line) continue

      const heading = /^#\s*(.+)$/.exec(line)
      if (!heading) continue

      const rawHeader = heading[1].trim()
      const mapped = mapHeader(rawHeader)
      if (mapped !== rawHeader) return mapped

      const cleaned = stripBrand(rawHeader)
      if (cleaned) return cleaned
    }

    return item.title || ''
  }, [item.title, trimmedLines])

  const trimmedContent = useMemo(() => {
    const lines = [...trimmedLines]
    let idx = 0

    while (idx < lines.length) {
      const current = lines[idx]?.trim()
      if (!current) {
        idx += 1
        continue
      }

      const heading = /^#\s*(.+)$/.exec(current)
      if (!heading) break

      const rawHeader = heading[1].trim()
      const cleaned = stripBrand(rawHeader)
      if (cleaned || /Daily News Brief/i.test(rawHeader) || /Regulatory Brief/i.test(rawHeader)) {
        idx += 1
        continue
      }

      break
    }

    return withExpectedSectionHeading(item, normalizeBriefContent(lines.slice(idx).join('\n').trimStart()))
  }, [trimmedLines, item])

  const displaySectionHeader = useMemo(() => {
    const title = getLeadingSectionTitle(trimmedContent)
    if (!title) {
      return item.region === 'KR' ? '🇰🇷 Korea Top 5' : '🌐 Global Top 5'
    }

    return title.startsWith('🇰🇷') || title.startsWith('🌐')
      ? title
      : formatSectionTitle(title)
  }, [trimmedContent, item.region])

  const visibleContent = useMemo(() => {
    const body = stripLeadingSectionTitle(trimmedContent)
    return body || trimmedContent
  }, [trimmedContent])

  useEffect(() => {
    setDecodedContent(item.content)
  }, [item.content])

  const timeString = getDisplayTime(item)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setExpanded(!expanded)
        }
      }}
      className={`group relative overflow-hidden rounded-xl border transition-all cursor-pointer ${
        expanded
          ? 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
      }`}
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
            {item.region === 'KR' ? '🇰🇷 Korea' : '🌐 Global'}
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

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="ml-auto rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            aria-expanded={expanded}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {displayTitle && (
          <h3
            className={`mb-[6px] text-[15px] font-semibold tracking-[-0.01em] leading-snug ${
              expanded
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-800 dark:text-white'
            }`}
          >
            {displayTitle}
          </h3>
        )}

        <div className="mb-[6px] text-[14px] font-semibold text-gray-900 dark:text-white">
          {displaySectionHeader}
        </div>

        <div
          className={`select-text text-[14px] leading-[1.55] tracking-[-0.01em] text-[#444] dark:text-gray-200
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{visibleContent}</ReactMarkdown>
        </div>
      </div>

      <div className="px-4 pb-4 pt-0 text-[13px] text-[#777] dark:text-gray-400 sm:px-6">
        {timeString}
      </div>
    </article>
  )
}

export default NewsCard
