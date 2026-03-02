import { NextResponse } from 'next/server'
import { createPublicClient, parseJsonArray, toUtcNow, timeWindowToIso } from '@/lib/supabase'
import { err, ok, parseSort, parseTimeWindow, type SortMode, type TimeWindow } from '@/lib/dashboardApi'
import { stripHtml } from '@/lib/text'

export const dynamic = 'force-dynamic'

const clampLimit = (value: string | null) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 100
  return Math.max(10, Math.min(200, parsed))
}

const normalizeSort = (sort: ReturnType<typeof parseSort>): SortMode => sort


const LANE_SOURCE_NAMES: Record<string, string[]> = {
  official: ['Binance Announcements', 'Coinbase Announcements', 'Coinbase Blog', 'SEC', 'CFTC', 'Federal Reserve', 'U.S. Treasury'],
  media: ['CoinDesk', 'The Block', 'Blockworks', 'DL News', 'Decrypt', 'Reuters', 'FinancialJuice'],
  kr: ['Blockmedia', 'Tokenpost', 'Coinness'],
}

const normalizeEnglish = (value: string) =>
  stripHtml(value || '').replace(/\s{2,}/g, ' ').trim()

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim() || ''
    const topic = url.searchParams.get('topic') || 'all'
    const lane = (url.searchParams.get('lane') || 'all').toLowerCase()
    const source = url.searchParams.get('source')?.trim() || ''
    const region = (url.searchParams.get('region') || 'All') as 'All' | 'KR' | 'Global'
    const sort = parseSort(url.searchParams.get('sort'))
    const window = parseTimeWindow(url.searchParams.get('time_window'))
    const limit = clampLimit(url.searchParams.get('limit'))
    const from = url.searchParams.get('from') || undefined

    const client = createPublicClient()
    let query = client
      .from('articles')
      .select(
        `
          id,title,url,canonical_url,published_at_utc,fetched_at_utc,language,region,
          summary_short,why_it_matters,confidence_label,importance_score,importance_label,status,issue_id,
          source_id, content_hash,
          source:sources(id,name,tier),
          issue:issues!fk_articles_issue(id,title,topic_label,importance_label)
        `,
        { count: 'exact' },
      )

    const since = timeWindowToIso(window)
    if (since) {
      query = query.gte('published_at_utc', since)
    }
    if (region !== 'All') query = query.eq('region', region)
    if (topic !== 'all') {
      query = query.eq('issue.topic_label', topic)
    }

    if (search) {
      query = query.ilike('title', `%${search}%`)
    }

    if (from) {
      query = query.lte('published_at_utc', from)
    }

    if (sort === 'latest') {
      query = query.order('published_at_utc', { ascending: false })
    } else if (sort === 'importance') {
      query = query.order('importance_score', { ascending: false, nullsFirst: false })
    } else {
      query = query.order('importance_score', { ascending: false, nullsFirst: false }).order('published_at_utc', {
        ascending: false,
      })
    }

    const { data, count, error } = await query.limit(limit)
    if (error) throw error

    const laneNames = lane !== 'all' ? (LANE_SOURCE_NAMES[lane] || []) : []

    const articles = (data || []).map((item) => ({
      ...item,
      title: normalizeEnglish(String(item.title || '')),
      summary_short: normalizeEnglish(String(item.summary_short || '')),
      why_it_matters: normalizeEnglish(String(item.why_it_matters || '')),
      tags: [],
      key_entities: [],
      source:
        item.source && typeof item.source === 'object' && !Array.isArray(item.source)
          ? {
              ...(item.source as Record<string, unknown>),
              name: normalizeEnglish(String((item.source as any).name || '')),
            }
          : undefined,
      issue:
        item.issue && typeof item.issue === 'object' && !Array.isArray(item.issue)
          ? {
              ...(item.issue as Record<string, unknown>),
              title: normalizeEnglish(String((item.issue as any).title || '')),
            }
          : undefined,
    }))

    const filteredArticles = articles.filter((item: any) => {
      const sourceName = String(item?.source?.name || '')
      if (source && sourceName !== source) return false
      if (lane !== 'all' && laneNames.length > 0 && !laneNames.includes(sourceName)) return false
      return true
    })

    return NextResponse.json(
      ok({
        articles: filteredArticles as any,
        count: count || 0,
        window,
      }),
    )
  } catch (error: any) {
    const message = error?.message || String(error)
    const stack = typeof error?.stack === 'string' ? error.stack : null
    const code = error?.code || null
    const details = error?.details || null
    const hint = error?.hint || null

    console.error('GET /api/articles failed', {
      message,
      code,
      details,
      hint,
      stack,
      raw: error,
    })


    return NextResponse.json(
      {
        ok: false,
        error: `articles_api_error: ${message}`,
        message,
        code,
        details,
        hint,
        stack,
      },
      { status: 500 },
    )
  }
}