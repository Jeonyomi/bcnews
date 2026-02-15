'use client'

import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { NewsItem, BriefSection } from '@/types'
import { formatSeoulDateTime } from '@/lib/datetime'

const looksWrongOffsetKst = (value: string | null) =>
  !!value && /\+00:00$/.test(value)

const getDisplayTime = (item: NewsItem) => {
  const source = looksWrongOffsetKst(item.created_at_kst) ? item.created_at : item.created_at_kst
  return formatSeoulDateTime(source || item.created_at)
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

type SectionList = NonNullable<NewsItem['sections']>

const orderedSections = (sections: SectionList): BriefSection[] => {
  if (!sections || sections.length === 0) return []

  const rank: Record<string, number> = {
    KR: 0,
    Global: 1,
    Watchlist: 2,
  }

  return [...sections].sort((a, b) => {
    const ra = rank[a.heading] ?? 99
    const rb = rank[b.heading] ?? 99
    if (ra === rb) {
      return a.title.localeCompare(b.title)
    }
    return ra - rb
  })
}

const shouldShowSectionHeading = (heading: BriefSection['heading']) => heading !== 'KR'

const sectionMeta = (heading: BriefSection['heading']) => {
  if (heading === 'Watchlist') {
    return {
      badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200',
      headingClass: 'text-indigo-700 dark:text-indigo-300',
    }
  }

  return {
    badgeClass: 'text-gray-900 dark:text-white',
    headingClass: 'text-gray-900 dark:text-white',
  }
}

const normalizeMarkdownSectionContent = (content: string) =>
  content
    .replace(/-\s*링크:\s*(https?:\/\/\S+)/g, '- [LINK]($1)')
    .replace(/-\s*LINK:\s*\[LINK\]\((https?:\/\/[^)]+)\)/g, '- [LINK]($1)')

const NewsCard = ({ item, defaultExpanded = false }: Props) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const timeString = getDisplayTime(item)
  const titleFromMd = useMemo(() => {
    const mapped = mapHeader(item.title || '')
    if (mapped !== (item.title || '')) return mapped

    const direct = stripBrand(item.title || '')
    if (direct) return direct

    return item.title || ''
  }, [item.title])

  const sections = item.sections || []

  const fallbackContent = useMemo(() => {
    const normalized = normalizeMarkdownSectionContent(item.content || '')
    const titleRemoved = normalized
      .split('\n')
      .filter((line, idx) => {
        if (idx === 0 && /^#\s*/.test(line.trim())) return false
        return true
      })
      .join('\n')
      .trimStart()

    return titleRemoved
  }, [item.content])

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
            {item.region === 'KR' ? '?��?�� Korea' : '?�� Global'}
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

        {titleFromMd && (
          <h3
            className={`mb-[6px] text-[15px] font-semibold tracking-[-0.01em] leading-snug ${
              expanded
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-800 dark:text-white'
            }`}
          >
            {titleFromMd}
          </h3>
        )}

        <div
          className={`select-text text-[14px] leading-[1.55] tracking-[-0.01em] text-[#444] dark:text-gray-200
            [&>h2]:mt-[16px] [&>h2]:mb-[8px] [&>h2]:text-[15px] [&>h2]:font-semibold [&>h2]:text-gray-900 dark:[&>h2]:text-white
            [&>p]:mb-[6px] [&>p]:break-keep
            [&>ul]:mb-[6px] [&>ul]:list-disc [&>ul]:pl-5
            [&>ol]:mb-[6px] [&>ol]:list-decimal [&>ol]:pl-5
            [&>li]:mb-[2px]
            [&_a]:text-blue-600 hover:[&_a]:text-blue-500 dark:[&_a]:text-blue-400 dark:hover:[&_a]:text-blue-300 [&_a]:break-all
            [&_strong]:font-semibold [&_strong]:text-gray-900 dark:[&_strong]:text-white
            ${expanded ? '' : 'line-clamp-3'}`}
        >
          {sections.length > 0 ? (
            <div className="space-y-5">
              {orderedSections((sections || []).map((section) => section) as SectionList).map((section) => {
                const meta = sectionMeta(section.heading)

                return (
                <section key={section.heading}>
                  {shouldShowSectionHeading(section.heading) && (
                    <h2
                      className={`mb-2 text-[16px] font-semibold ${meta.headingClass}`}
                      style={{ letterSpacing: '-0.01em' }}
                    >
                      {section.title}
                    </h2>
                  )}
                  {section.items.length > 0 ? (
                    <ol className="space-y-4">
                      {section.items.map((entry) => (
                        <li key={`${section.heading}-${entry.title}`} className="pl-0">
                          <p className="font-medium text-[#111827] dark:text-gray-100">{entry.title}</p>
                          {entry.summary && <p className="text-sm text-[#4b5563] dark:text-gray-300 mt-1">{entry.summary}</p>}
                          {entry.keywords.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {entry.keywords.map((keyword) => (
                                <span
                                  key={keyword}
                                  className={`rounded px-2 py-1 text-[11px] font-medium ${meta.badgeClass}`}
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                          {entry.link && (
                            <a
                              href={entry.link}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
                              onClick={(e) => e.stopPropagation()}
                            >
                              [LINK]
                            </a>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">No items</div>
                  )}
                </section>
              )}
              )}
            </div>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{fallbackContent}</ReactMarkdown>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-0 text-[13px] text-[#777] dark:text-gray-400 sm:px-6">
        {timeString}
      </div>
    </article>
  )
}

export default NewsCard

