import { NextResponse } from 'next/server'
import { createPublicClient, timeWindowToIso } from '@/lib/supabase'
import { err, ok, parseSort, parseTimeWindow, type TimeWindow, type SortMode } from '@/lib/dashboardApi'

export const dynamic = 'force-dynamic'

const clampLimit = (value: string | null) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 100
  return Math.max(5, Math.min(200, parsed))
}

const toIssueCard = (issue: any, updateCounts: Record<number, number>) => ({
  ...issue,
  recent_updates_count: updateCounts[issue.id] || 0,
})

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim() || ''
    const topic = url.searchParams.get('topic') || 'all'
    const region = (url.searchParams.get('region') || 'All') as 'All' | 'KR' | 'Global'
    const sort = parseSort(url.searchParams.get('sort'))
    const window = parseTimeWindow(url.searchParams.get('time_window'))
    const limit = clampLimit(url.searchParams.get('limit'))

    const client = createPublicClient()

    let query = client
      .from('issues')
      .select('*, representative_article:articles(id,title,url)', { count: 'exact' })

    const since = timeWindowToIso(window)
    if (since) {
      query = query.gte('last_seen_at_utc', since)
    }
    if (region !== 'All') query = query.eq('region', region)
    if (topic !== 'all') query = query.eq('topic_label', topic)

    if (search) {
      query = query.ilike('title', `%${search}%`)
    }

    const { data: issues, error: issueError, count } = await query
      .order(sort === 'latest' ? 'last_seen_at_utc' : 'importance_score', {
        ascending: false,
      })
      .limit(limit)

    if (issueError) throw issueError

    const sinceWindow = since || new Date(0).toISOString()
    const { data: updates } = await client
      .from('issue_updates')
      .select('issue_id,id')
      .gte('update_at_utc', sinceWindow)

    const updateCounts: Record<number, number> = {}
    for (const row of updates || []) {
      const key = Number(row.issue_id)
      if (!Number.isFinite(key)) continue
      updateCounts[key] = (updateCounts[key] || 0) + 1
    }

    const normalized = (issues || []).map((issue) => toIssueCard(issue, updateCounts))

    let sorted = normalized
    if (sort === 'importance') {
      sorted = [...normalized].sort((a, b) => {
        const aa = Number(a.importance_score || 0)
        const bb = Number(b.importance_score || 0)
        if (aa === bb) {
          return (
            new Date(b.last_seen_at_utc).getTime() - new Date(a.last_seen_at_utc).getTime()
          )
        }
        return bb - aa
      })
    }

    if (sort === 'hybrid') {
      sorted = [...normalized].sort((a, b) => {
        const score = Number(b.importance_score || 0) - Number(a.importance_score || 0)
        if (score !== 0) return score
        return new Date(b.last_seen_at_utc).getTime() - new Date(a.last_seen_at_utc).getTime()
      })
    }

    if (sort === 'latest') {
      sorted = [...normalized].sort(
        (a, b) =>
          new Date(b.last_seen_at_utc).getTime() - new Date(a.last_seen_at_utc).getTime(),
      )
    }

    return NextResponse.json(
      ok({
        issues: sorted,
        count: count || 0,
        window,
      }),
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    )
  } catch (error) {
    console.error('GET /api/issues failed', error)
    return NextResponse.json(err(`issues_api_error: ${String(error)}`), { status: 500 })
  }
}
