import { NextResponse } from 'next/server'
import { createPublicClient, parseJsonArray, toKstDateTime } from '@/lib/supabase'
import { err, ok } from '@/lib/dashboardApi'
import { stripHtml } from '@/lib/text'

export const dynamic = 'force-dynamic'

const asNumber = (value: string | null) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const normalizeEnglish = (value: string) =>
  stripHtml(value || '')
    .replace(/\.{3}/g, '')
    .replace(/([A-Za-z])'([A-Za-z])/g, '$1a$2')
    .replace(/(^|\s)'([A-Za-z])/g, '$1a$2')
    .replace(/\b'nd\b/gi, 'and')
    .replace(/\b're\b/gi, 'are')
    .replace(/\b'll\b/gi, 'will')
    .replace(/\b'ctually\b/gi, 'actually')
    .replace(/\b\s+'s\b/g, "'s")
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const issueId = asNumber(id)
    if (!issueId) {
      return NextResponse.json(err('invalid_issue_id'), { status: 400 })
    }

    const client = createPublicClient()

    const { data: issue, error: issueErr } = await client
      .from('issues')
      .select(`
        *,
        representative_article:articles!issues_representative_article_id_fkey(id,title,url,published_at_utc,summary_short,issue_id)
      `)
      .eq('id', issueId)
      .single()

    if (issueErr || !issue) {
      return NextResponse.json(err('issue_not_found'), { status: 404 })
    }

    const { data: issueUpdates, error: updatesErr } = await client
      .from('issue_updates')
      .select('*')
      .eq('issue_id', issueId)
      .order('update_at_utc', { ascending: false })

    if (updatesErr) throw updatesErr

    const evidenceIds = new Set<number>()
    for (const update of issueUpdates || []) {
      const ids = parseJsonArray(update.evidence_article_ids)
      for (const raw of ids) {
        const parsed = Number(raw)
        if (Number.isFinite(parsed)) evidenceIds.add(parsed)
      }
    }

    const relatedIds = Array.from(evidenceIds)

    let relatedArticles = [] as any[]
    if (relatedIds.length > 0) {
      const { data: articlesByEvidence, error: relatedErr } = await client
        .from('articles')
        .select(`
          id,title,url,canonical_url,published_at_utc,language,region,summary_short,
          why_it_matters,confidence_label,importance_score,importance_label,status,issue_id
        `)
        .in('id', relatedIds)

      if (relatedErr) throw relatedErr
      relatedArticles = articlesByEvidence || []
    }

    const { data: issueTagRelated, error: issueTagErr } = await client
      .from('articles')
      .select('id,title,url,canonical_url,published_at_utc,summary_short,issue_id')
      .eq('issue_id', issueId)
      .order('published_at_utc', { ascending: false })
      .limit(12)

    if (issueTagErr) throw issueTagErr

    const mergedMap = new Map<number, any>()
    for (const article of issueTagRelated || []) {
      mergedMap.set(article.id, article)
    }
    for (const article of relatedArticles) {
      mergedMap.set(article.id, article)
    }

    const merged = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.published_at_utc).getTime() - new Date(a.published_at_utc).getTime(),
    )

    const timeline = (issueUpdates || []).map((update) => ({
      ...update,
      update_at_ks: toKstDateTime(update.update_at_utc),
    }))

    const cleanIssue = {
      ...issue,
      title: normalizeEnglish(issue.title || ''),
      issue_summary: normalizeEnglish(issue.issue_summary || ''),
      why_it_matters: normalizeEnglish(issue.why_it_matters || ''),
    }

    const cleanRepresentative = issue.representative_article
      ? {
          ...issue.representative_article,
          title: normalizeEnglish(issue.representative_article.title || ''),
        }
      : null

    const cleanUpdatesRaw = timeline.map((update) => ({
      ...update,
      update_summary: normalizeEnglish(update.update_summary || ''),
      evidence_article_ids: parseJsonArray(update.evidence_article_ids)
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b),
    }))

    // Deduplicate noisy timeline entries.
    // Primary: same summary + same evidence list.
    // Secondary: collapse identical summaries (common when update_summary is generic).
    const seenExact = new Set<string>()
    const seenSummary = new Set<string>()
    const cleanUpdates = cleanUpdatesRaw.filter((update) => {
      const evidenceKey = (update.evidence_article_ids || []).join(',')
      const exactKey = `${update.update_summary}::${evidenceKey}`
      if (seenExact.has(exactKey)) return false
      seenExact.add(exactKey)

      if (seenSummary.has(update.update_summary)) return false
      seenSummary.add(update.update_summary)

      return true
    })

    const cleanArticles = (merged || []).map((article) => ({
      ...article,
      title: normalizeEnglish(article.title || ''),
      summary_short: normalizeEnglish(article.summary_short || ''),
      why_it_matters: normalizeEnglish(article.why_it_matters || ''),
    }))

    const detail = {
      issue: cleanIssue,
      issue_updates: cleanUpdates,
      related_articles: cleanArticles,
      representative_article: cleanRepresentative,
    }

    return NextResponse.json(ok(detail), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('GET /api/issues/[id] failed', error)
    return NextResponse.json(err(`issue_detail_error: ${String(error)}`), { status: 500 })
  }
}
