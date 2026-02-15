import { NextResponse } from 'next/server'
import { createPublicClient, timeWindowToIso } from '@/lib/supabase'
import { err, ok, parseSort, parseTimeWindow } from '@/lib/dashboardApi'
import { stripHtml } from '@/lib/text'

export const dynamic = 'force-dynamic'

const toErrorMessage = (error: unknown) => {
  if (!error) return 'unknown_error'
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

type UpdateAgg = {
  count: number
  latestAt: string | null
}

const clampLimit = (value: string | null) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 100
  return Math.max(5, Math.min(200, parsed))
}

const toIssueCard = (issue: any, updateCounts: Record<number, number>) => ({
  ...issue,
  recent_updates_count: updateCounts[issue.id] || 0,
  issue_summary: stripHtml(issue.issue_summary || ''),
  why_it_matters: stripHtml(issue.why_it_matters || ''),
  title: stripHtml(issue.title || ''),
})

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim() || ''
    const topic = url.searchParams.get('topic') || 'all'
    const region = (url.searchParams.get('region') || 'All') as 'All' | 'KR' | 'Global'
    const entity = url.searchParams.get('entity')?.trim() || ''
    const sort = parseSort(url.searchParams.get('sort'))
    const window = parseTimeWindow(url.searchParams.get('time_window'))
    const limit = clampLimit(url.searchParams.get('limit'))

    const onlyUpdatesMode =
      url.searchParams.get('only_updates') === '1' || url.searchParams.get('only_updates') === 'true'

    const client = createPublicClient()

    let query = client
      .from('issues')
      .select('*, representative_article:articles!issues_representative_article_id_fkey(id,title,url)', {
        count: 'exact',
      })

    const since = timeWindowToIso(window)
    const updateSince = since || new Date(0).toISOString()

    const updateAgg = new Map<number, UpdateAgg>()
    if (onlyUpdatesMode || since) {
      const { data: updates, error: updateErr } = await client
        .from('issue_updates')
        .select('issue_id,update_at_utc')
        .gte('update_at_utc', updateSince)
        .order('update_at_utc', { ascending: false })

      if (updateErr) throw updateErr

      for (const row of updates || []) {
        const issueId = Number(row.issue_id)
        if (!Number.isFinite(issueId)) continue

        const existing = updateAgg.get(issueId)
        if (!existing) {
          updateAgg.set(issueId, {
            count: 1,
            latestAt: row.update_at_utc || null,
          })
        } else {
          existing.count += 1
        }
      }

      if (onlyUpdatesMode) {
        const issueIds = Array.from(updateAgg.keys())
        if (issueIds.length === 0) {
          return NextResponse.json(
            ok({
              issues: [],
              count: 0,
              window,
              updates_only: true,
            }),
            {
              headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
              },
            },
          )
        }
        query = query.in('id', issueIds)
      }
    }

    if (since) {
      query = query.gte('last_seen_at_utc', since)
    }
    if (region !== 'All') query = query.eq('region', region)
    if (topic !== 'all') query = query.eq('topic_label', topic)
    if (entity) query = query.contains('key_entities', [entity])

    if (search) {
      query = query.or(`title.ilike.%${search}%,issue_summary.ilike.%${search}%,why_it_matters.ilike.%${search}%`)
    }

    const { data: issues, error: issueError, count } = await query
      .order(sort === 'latest' ? 'last_seen_at_utc' : 'importance_score', {
        ascending: false,
      })
      .limit(limit)

    if (issueError) throw issueError

    // If not in update-only mode, fallback to recent updates by requested window
    const updateCounts: Record<number, number> = {}
    if (!onlyUpdatesMode && since) {
      const { data: updates } = await client
        .from('issue_updates')
        .select('issue_id,id')
        .gte('update_at_utc', since)

      if (updates) {
        for (const row of updates) {
          const key = Number(row.issue_id)
          if (!Number.isFinite(key)) continue
          updateCounts[key] = (updateCounts[key] || 0) + 1
        }
      }
    } else {
      for (const [issueId, agg] of updateAgg.entries()) {
        updateCounts[issueId] = agg.count
      }
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

    if (onlyUpdatesMode) {
      sorted = [...sorted].sort((a, b) => {
        const aScore = Number(updateCounts[a.id] || 0)
        const bScore = Number(updateCounts[b.id] || 0)
        if (bScore !== aScore) return bScore - aScore
        return (
          new Date(updateAgg.get(Number(b.id))?.latestAt || b.last_seen_at_utc).getTime() -
          new Date(updateAgg.get(Number(a.id))?.latestAt || a.last_seen_at_utc).getTime()
        )
      })
    }

    return NextResponse.json(
      ok({
        issues: sorted,
        count: count || 0,
        window,
        updates_only: onlyUpdatesMode,
      }),
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    )
  } catch (error) {
    console.error('GET /api/issues failed', error)
    return NextResponse.json(err(`issues_api_error: ${toErrorMessage(error)}`), { status: 500 })
  }
}
