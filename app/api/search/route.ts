import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase'
import { err, ok } from '@/lib/dashboardApi'

export const dynamic = 'force-dynamic'

const safeScore = (value: string) => {
  const num = Number(value)
  if (Number.isFinite(num)) return num
  return 0
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') || '').trim()
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || '40')))

    if (!q) {
      return NextResponse.json(ok({ issues: [], articles: [], query: '' }))
    }

    const client = createPublicClient()

    const issueQ = await client
      .from('issues')
      .select('id,title,topic_label,region,issue_summary,why_it_matters,importance_score')
      .or(`title.ilike.%${q}%,issue_summary.ilike.%${q}%,why_it_matters.ilike.%${q}%`)
      .limit(limit)

    const articleQ = await client
      .from('articles')
      .select('id,title,summary_short,region,importance_score,issue:issues(topic_label),source:sources(name)')
      .or(`title.ilike.%${q}%,summary_short.ilike.%${q}%,why_it_matters.ilike.%${q}%`)
      .limit(limit)

    if (issueQ.error) throw issueQ.error
    if (articleQ.error) throw articleQ.error

    const issueResults = (issueQ.data || []).map((row) => ({
      type: 'issue' as const,
      id: Number(row.id),
      title: row.title,
      region: row.region,
      subtitle: `${row.topic_label}`,
      snippet: row.issue_summary || null,
      score: safeScore(row.importance_score),
    }))

    const articleResults = (articleQ.data || []).map((row: any) => ({
      type: 'article' as const,
      id: Number(row.id),
      title: row.title,
      region: row.region,
      subtitle: row.issue && !Array.isArray(row.issue) ? `Issue: ${row.issue.topic_label}` : 'Article',
      snippet: row.summary_short,
      score: safeScore(row.importance_score || 0),
    }))

    return NextResponse.json(
      ok({
        issues: issueResults.sort((a, b) => (b.score || 0) - (a.score || 0)),
        articles: articleResults.sort((a, b) => (b.score || 0) - (a.score || 0)),
        query: q,
      }),
    )
  } catch (error) {
    console.error('GET /api/search failed', error)
    return NextResponse.json(err(`search_api_error: ${String(error)}`), { status: 500 })
  }
}
