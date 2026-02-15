import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase'
import { err, ok } from '@/lib/dashboardApi'

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

const safeScore = (value: string) => {
  const num = Number(value)
  if (Number.isFinite(num)) return num
  return 0
}

const parseJsonArray = (value: any): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item))
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') || '').trim()
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || '40')))
    const entity = (url.searchParams.get('entity') || '').trim()

    if (!q) {
      const { data: entIssues, error: entIssueErr } = await createPublicClient()
        .from('issues')
        .select('key_entities')
        .not('key_entities', 'is', null)
        .limit(300)

      if (entIssueErr) {
        return NextResponse.json(ok({ issues: [], articles: [], query: '', entities: [] as string[] }))
      }

      const entitySet = new Set<string>()
      for (const row of entIssues || []) {
        for (const item of parseJsonArray(row?.key_entities)) {
          entitySet.add(item)
        }
      }

      return NextResponse.json(ok({ issues: [], articles: [], query: '', entities: Array.from(entitySet).sort() }))
    }

    const client = createPublicClient()

    const issueQ = await client
      .from('issues')
      .select('id,title,topic_label,region,issue_summary,why_it_matters,importance_score,key_entities')
      .or(`title.ilike.%${q}%,issue_summary.ilike.%${q}%,why_it_matters.ilike.%${q}%`)
      .limit(limit)

    const articleQ = await client
      .from('articles')
      .select(
        'id,title,summary_short,region,importance_score,issue:issues!fk_articles_issue(id,title,topic_label,key_entities)',
      )
      .or(`title.ilike.%${q}%,summary_short.ilike.%${q}%,why_it_matters.ilike.%${q}%`)
      .limit(limit)

    if (issueQ.error) throw issueQ.error
    if (articleQ.error) throw articleQ.error

    const rawIssues = (issueQ.data || []).filter((row) => {
      if (!entity) return true
      const entities = parseJsonArray((row as any).key_entities)
      return entities.includes(entity)
    })

    const issueResults = rawIssues.map((row) => ({
      type: 'issue' as const,
      id: Number(row.id),
      title: row.title,
      region: row.region,
      subtitle: `${row.topic_label}`,
      snippet: row.issue_summary || null,
      score: safeScore((row as any).importance_score as string),
    }))

    const articleRows = (articleQ.data || []).filter((row: any) => {
      if (!entity) return true
      const issue = row.issue
      if (!issue || Array.isArray(issue)) return false
      const entities = parseJsonArray(issue.key_entities)
      return entities.includes(entity)
    })

    const articleResults = articleRows.map((row: any) => ({
      type: 'article' as const,
      id: Number(row.id),
      title: row.title,
      region: row.region,
      subtitle: row.issue && !Array.isArray(row.issue) ? `Issue: ${row.issue.topic_label}` : 'Article',
      snippet: row.summary_short,
      score: safeScore(row.importance_score || 0),
    }))

    const entitySet = new Set<string>()
    for (const row of issueQ.data || []) {
      for (const item of parseJsonArray((row as any).key_entities)) {
        entitySet.add(item)
      }
    }
    for (const row of articleQ.data || []) {
      if (row.issue && !Array.isArray(row.issue)) {
        for (const item of parseJsonArray((row.issue as any).key_entities)) {
          entitySet.add(item)
        }
      }
    }

    const issuesSorted = issueResults.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit)
    const articlesSorted = articleResults
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit)

    return NextResponse.json(
      ok({
        issues: issuesSorted,
        articles: articlesSorted,
        query: q,
        entities: Array.from(entitySet).sort(),
      }),
    )
  } catch (error) {
    console.error('GET /api/search failed', error)
    return NextResponse.json(err(`search_api_error: ${toErrorMessage(error)}`), { status: 500 })
  }
}
