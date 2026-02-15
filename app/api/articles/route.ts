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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim() || ''
    const topic = url.searchParams.get('topic') || 'all'
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

    const articles = (data || []).map((item) => ({
      ...item,
      title: stripHtml(String(item.title || '')),
      summary_short: stripHtml(String(item.summary_short || '')),
      why_it_matters: stripHtml(String(item.why_it_matters || '')),
      tags: [],
      key_entities: [],
      source:
        item.source && typeof item.source === 'object' && !Array.isArray(item.source)
          ? item.source
          : undefined,
      issue:
        item.issue && typeof item.issue === 'object' && !Array.isArray(item.issue)
          ? item.issue
          : undefined,
    }))

    return NextResponse.json(
      ok({
        articles: articles as any,
        count: count || 0,
        window,
      }),
    )
  } catch (error) {
    console.error('GET /api/articles failed', error)
    return NextResponse.json(
      err(`articles_api_error: ${String(error)}`),
      { status: 500 },
    )
  }
}
