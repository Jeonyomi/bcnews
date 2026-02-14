import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { BriefSection } from '@/types'

export const dynamic = 'force-dynamic' // no caching

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type DbNewsItem = {
  [key: string]: unknown
}

const getTodayKstRange = () => {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value

  if (!year || !month || !day) {
    const fallback = new Date()
    const start = new Date(
      Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate())
    )
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 1)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
  }

  const todayStart = new Date(`${year}-${month}-${day}T00:00:00+09:00`)
  const tomorrow = new Date(todayStart)
  tomorrow.setDate(tomorrow.getDate() + 1)

  return {
    startIso: todayStart.toISOString(),
    endIso: tomorrow.toISOString(),
  }
}

const normalizeSectionHeading = (line: string): 'KR' | 'Global' | null => {
  if (/korea\s*top\s*5/i.test(line)) return 'KR'
  if (/global\s*top\s*5/i.test(line)) return 'Global'
  return null
}

const stripPrefix = (text: string) => text.replace(/^[-*]\s*/, '').trim()

const getLinkFromLine = (line: string): string | undefined => {
  const plainMatch = line.match(/https?:\/\/[^\s)]+/)
  if (plainMatch) return plainMatch[0]

  const mdMatch = line.match(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/)
  if (mdMatch) return mdMatch[1]

  return undefined
}

const parseBriefSections = (
  rawContent: string,
  fallbackRegion: 'KR' | 'Global'
): BriefSection[] => {
  const lines = (rawContent || '').replace(/\r\n/g, '\n').split('\n')
  const sections: BriefSection[] = []
  let currentSection: BriefSection | null = null

  const openSection = (region: 'KR' | 'Global') => {
    const existing = sections.find((s) => s.heading === region)
    if (existing) {
      currentSection = existing
      return
    }

    currentSection = {
      heading: region,
      title: region === 'KR' ? '🇰🇷 Korea Top 5' : '🌐 Global Top 5',
      items: [],
    }
    sections.push(currentSection)
  }

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] || ''
    const line = rawLine.trim()
    if (!line) continue

    const headingMatch = /^##\s*(.+)$/.exec(line)
    if (headingMatch) {
      const headingRegion = normalizeSectionHeading(headingMatch[1] || '')
      if (headingRegion) {
        openSection(headingRegion)
        continue
      }
    }

    if (/^#\s*/.test(line)) {
      continue
    }

    if (currentSection && /^\d+\)/.test(line) && /\*\*(.*?)\*\*/.test(line)) {
      const titleMatch = line.match(/\*\*(.*?)\*\*/)
      const itemTitle = titleMatch?.[1]?.trim() || line
      const item = {
        title: itemTitle,
        summary: '',
        keywords: [] as string[],
        link: undefined as string | undefined,
      }

      for (let j = i + 1; j < lines.length; j += 1) {
        const next = (lines[j] || '').trim()

        if (/^\d+\)/.test(next)) {
          i = j - 1
          break
        }

        const headingNext = /^##\s*(.+)$/.exec(next)
        if (headingNext) {
          const sectionHeading = normalizeSectionHeading(headingNext[1] || '')
          if (sectionHeading) {
            i = j - 1
            break
          }
        }

        const summaryMatch = next.match(/^-?\s*(?:핵심 요약|핵심요약|Summary|Key summary):?\s*(.+)$/i)
        const keywordMatch = next.match(/^-?\s*(?:핵심키워드|핵심 키워드|Keywords|키워드):?\s*(.+)$/i)

        if (/^[-*]\s*(?:Key|키워드|LINK|링크)/i.test(next)) {
          if (/LINK|링크|Link/i.test(next)) {
            item.link = getLinkFromLine(next)
          }
          if (keywordMatch) {
            item.keywords = keywordMatch[1]
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
          }
          continue
        }

        if (summaryMatch) {
          item.summary = summaryMatch[1].trim()
          continue
        }

        if (keywordMatch) {
          item.keywords = keywordMatch[1]
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
          continue
        }

        if (next.startsWith('-')) {
          const extracted = getLinkFromLine(next)
          if (extracted && !item.link) {
            item.link = extracted
            continue
          }

          if (!item.summary && next.replace(/^[-*]\s*/, '').trim()) {
            item.summary = next.replace(/^[-*]\s*/, '').trim()
          }
          continue
        }

        // end of current item
        if (next) {
          i = j - 1
          break
        }
      }

      if (!item.summary && item.keywords.length === 0 && i < lines.length - 1) {
        const nextContent = lines[i + 1]?.trim() || ''
        if (nextContent && !/^(\d+\)|##)/.test(nextContent)) {
          item.summary = nextContent.replace(/^-\s*/, '').trim()
          i += 1
        }
      }

      currentSection.items.push(item)
      continue
    }

    // 첫번째 항목이 시작되지 않은 경우, 임시로 헤더를 기준으로 기본 섹션 생성
    if (!currentSection) {
      openSection(fallbackRegion)
    }
  }

  return sections
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const debug = url.searchParams.get('debug') === '1'
    const includeAll = url.searchParams.get('all') === '1'
    const limit = Number(url.searchParams.get('limit') || '50')
    const take = Number.isFinite(limit) && limit > 0 ? limit : 50

    let query = supabase
      .from('news_briefs')
      .select('*')
      .order('id', { ascending: false })
      .limit(take)

    if (!includeAll) {
      const { startIso, endIso } = getTodayKstRange()
      query = query
        .gte('created_at', startIso)
        .lt('created_at', endIso)
    }

    const { data: items, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      throw error
    }

    const enriched = (items || []).map((item: DbNewsItem) => {
      const region = (item.region === 'Global' ? 'Global' : 'KR') as 'KR' | 'Global'
      const sections = parseBriefSections(
        String(item.content || ''),
        region,
      )

      return {
        ...item,
        sections,
      }
    })

    const payload: Record<string, any> = { items: enriched }
    if (debug) {
      payload.debug = {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        envSource: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
          keyPrefix: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            ? `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 8)}...${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(-6)}`
            : null,
          filter: includeAll ? 'all' : 'todayKstOnly',
          filteredBy: includeAll ? 'idOnly' : 'created_at',
          kstRange: includeAll
            ? null
            : getTodayKstRange(),
        }
      }
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      {
        error: String(error),
        config: {
          hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasPublicAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        },
      },
      { status: 500 }
    )
  }
}
