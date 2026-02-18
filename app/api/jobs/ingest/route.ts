import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { err } from '@/lib/dashboardApi'

export const dynamic = 'force-dynamic'

const RUN_BUDGET_MS = Number.parseInt(process.env.CRON_RUN_BUDGET_MS || '28000', 10) || 28000

type SourceType = {
  id: number
  name: string
  type: string
  tier: string | null
  url: string
  rss_url: string | null
  region: 'KR' | 'Global' | null
}

const getSecret = () =>
  process.env.X_CRON_SECRET || process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET

const decodeHtml = (value: string) => {
  if (!value) return value

  const numericEntity = value.replace(/&#(x?[0-9a-fA-F]+);/g, (match, p1) => {
    if (p1.toLowerCase().startsWith('x')) {
      const hex = p1.slice(1)
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }

    const code = Number.parseInt(p1, 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : match
  })

  return numericEntity
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
}

const normalizeDate = (value?: string) => {
  if (!value) return new Date().toISOString()

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

const extractLinkFromEntry = (entry: string) => {
  const cdataStripped = entry.replace(/<!\[CDATA\[|\]\]>/g, '')
  // Atom feeds frequently use href with either single/double quotes and arbitrary
  // attribute order. Support both forms before falling back to <link>text</link>.
  const hrefMatch =
    cdataStripped.match(/<link[^>]*\shref\s*=\s*"([^"]+)"[^>]*>/i) ||
    cdataStripped.match(/<link[^>]*\shref\s*=\s*'([^']+)'[^>]*>/i)
  if (hrefMatch) return decodeHtml(hrefMatch[1]).trim()

  const linkMatch = cdataStripped.match(/<link>([\s\S]*?)<\/link>/i)
  return linkMatch ? linkMatch[1].trim() : ''
}

const stripHtmlTags = (value: string) =>
  decodeHtml((value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim())

const extractItemsFromRss = (xml: string) => {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || []
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) || []

  const parseEntry = (entry: string, isAtom = false) => {
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/i)
    const linkText = isAtom ? extractLinkFromEntry(entry) : ''
    const linkMatch = isAtom
      ? null
      : entry.match(/<link>([\s\S]*?)<\/link>/i)
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/i)
    const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i)
    const dateMatch =
      entry.match(/<published>([\s\S]*?)<\/published>/i) ||
      entry.match(/<updated>([\s\S]*?)<\/updated>/i)

    const title = titleMatch
      ? stripHtmlTags(titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ''))
      : ''
    const link = isAtom ? linkText : (linkMatch ? linkMatch[1].trim() : '')
    const summarySource = summaryMatch || contentMatch
    const summary = summarySource
      ? stripHtmlTags(summarySource[1].replace(/<!\[CDATA\[|\]\]>/g, ''))
      : ''
    const dateSource = dateMatch?.[1]
    const publishedAt = normalizeDate(dateSource)

    return { title, link, summary, publishedAt }
  }

  return items
    .map((item) => {
      const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i)
      const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i)
      const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i)
      const pubMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)

      const title = titleMatch
        ? stripHtmlTags(titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ''))
        : ''
      const link = linkMatch ? linkMatch[1].trim() : ''
      const summary = descMatch
        ? stripHtmlTags(descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ''))
        : ''
      const publishedAt = normalizeDate(pubMatch?.[1])

      return { title, link, summary, publishedAt }
    })
    .filter((row) => row.title && row.link)
    .concat(
      entries
        .map((entry) => parseEntry(entry, true))
        .filter((row) => row.title && row.link),
    )
}

const canonicalizeUrl = (value: string) => {
  try {
    const url = new URL(value)
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
      url.searchParams.delete(key)
    }
    url.hash = ''
    return url.toString()
  } catch {
    return value
  }
}

const hashContent = (text: string) => crypto.createHash('sha256').update(text).digest('hex')

const normalizeTextForHash = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[^a-z0-9\s]/gi, '')
    .trim()

const buildLookupHash = (canonicalUrl: string, title: string, summary: string) =>
  hashContent(`${canonicalUrl}::${normalizeTextForHash(title)}::${normalizeTextForHash(summary)}`)

const fetchWithTimeout = async (url: string, timeoutMs = 8000, options?: RequestInit) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options?.headers || {}),
        'User-Agent': 'bcnews-ingest-bot/1.0 (+https://bcnews-agent.vercel.app)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

const fetchWithRetry = async (url: string, tries = 2) => {
  let lastError: unknown

  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url)
      if (response.ok) return response

      const shouldRetry =
        response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504
      if (!shouldRetry || attempt === tries) {
        throw new Error(`rss_fetch_status_${response.status}`)
      }

      await new Promise((resolve) => setTimeout(resolve, 750 * attempt))
      continue
    } catch (error) {
      lastError = error
      if (attempt === tries) break
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    }
  }

  throw new Error(`rss_fetch_status_network_${String(lastError)}`)
}

const deriveTopic = (title: string, summary: string) => {
  const text = `${title} ${summary}`.toLowerCase()
  if (text.includes('regulation') || text.includes('policy') || text.includes('regulatory')) return 'regulation'
  if (
    text.includes('issuer') ||
    text.includes('issuer reserves') ||
    text.includes('reserves') ||
    text.includes('company')
  ) {
    return 'issuer'
  }
  if (text.includes('pay') || text.includes('payment') || text.includes('bank')) return 'payments'
  if (text.includes('macro') || text.includes('fed') || text.includes('inflation')) return 'macro'
  if (text.includes('aml') || text.includes('enforcement') || text.includes('crime') || text.includes('fraud')) return 'aml'
  return 'defi'
}

const extractEntities = (text: string) => {
  const entities = new Set<string>()
  const known = ['Tether', 'USDT', 'USDC', 'Binance', 'Coinbase', 'SEC', 'FDIC', 'BIS', 'IMF']

  for (const token of known) {
    if (text.includes(token)) entities.add(token)
  }
  return Array.from(entities)
}

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const toTokenSet = (value: string) => {
  const tokens = normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => token.length >= 3)
    .map((token) => token.replace(/s$/, ''))

  return new Set(tokens)
}

const readEntityArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  return []
}

const jaccardRatio = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 && b.size === 0) return 0
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection += 1
  }

  const union = a.size + b.size - intersection
  if (union === 0) return 0
  return intersection / union
}

const issueMatchScore = (args: {
  candidate: {
    id: number
    topic_label: string
    issue_summary: string | null
    title: string | null
    key_entities: unknown
    last_seen_at_utc: string
  }
  topic: string
  titleTokens: Set<string>
  summaryTokens: Set<string>
  entities: string[]
  windowMinutes: number
}) => {
  const { candidate, topic, titleTokens, summaryTokens, entities, windowMinutes } = args

  const candidateTopic = String(candidate.topic_label || '')
  const sameTopic = candidateTopic === topic
  const topicBonus = sameTopic ? 42 : 14

  const candidateEntities = new Set(
    readEntityArray(candidate.key_entities).map((item) => item.toLowerCase()),
  )
  const incomingEntities = new Set(entities.map((item) => item.toLowerCase()))

  const entityOverlap = jaccardRatio(candidateEntities, incomingEntities)
  const entityPenalty = incomingEntities.size === 0 && candidateEntities.size === 0 ? 0 : entityOverlap

  const candidateTitle = String(candidate.title || '')
  const candidateSummary = String(candidate.issue_summary || '')
  const candidateTokens = toTokenSet(`${candidateTitle} ${candidateSummary}`)

  const titleOverlap = jaccardRatio(titleTokens, candidateTokens)
  const summaryOverlap = jaccardRatio(summaryTokens, candidateTokens)

  const topicSignal = /(defi|stablecoin|peg|chain|exchange|issuer|regulat|payment|aml|fraud|macro|fed)/.test(
    candidateTopic.toLowerCase(),
  )
  const topicSignalMatch = sameTopic || (topicSignal && topic === candidateTopic)

  const seenAtDate = new Date(candidate.last_seen_at_utc)
  const ageHours = Number.isNaN(seenAtDate.getTime())
    ? windowMinutes
    : Math.max(0, (Date.now() - seenAtDate.getTime()) / (1000 * 60 * 60))
  const recencyBoost = Math.max(0, 16 - Math.floor(ageHours / 3))

  const base =
    topicBonus +
    entityPenalty * 34 +
    titleOverlap * 30 +
    summaryOverlap * 12 +
    recencyBoost +
    (topicSignalMatch ? 8 : 0)

  return Math.round(base * 100) / 100
}

const isBestMatch = (score: number, topic: string, candidateTopic: string, windowMinutes: number) => {
  if (score >= 45) return true
  if (score >= 38 && candidateTopic === topic) return true
  return score >= 52 && windowMinutes <= 120
}

const parseTierScore = (tier: string | null) => {
  switch ((tier || '').toLowerCase()) {
    case '1':
    case 'tier1':
    case 'tier 1':
    case 'official':
      return 35
    case '2':
    case 'tier2':
    case 'tier 2':
    case 'major':
      return 22
    case '3':
    case 'tier3':
    case 'tier 3':
      return 14
    default:
      return 8
  }
}

const keywordSignals = {
  regulation: 32,
  issuer: 24,
  payments: 18,
  macro: 16,
  aml: 30,
  defi: 15,
  'macro-policy': 12,
  unknown: 10,
} as const

const clampScore = (value: number) => Math.max(0, Math.min(100, value))

const labelFromScore = (score: number) => {
  if (score >= 72) return 'high'
  if (score >= 44) return 'medium'
  return 'low'
}

const topicKeywords = (title: string, summary: string) => {
  const text = `${title}\n${summary}`.toLowerCase()
  const tokens: string[] = []

  if (/(regulation|regulatory|policy|compliance|governance|directive|legal)/.test(text)) tokens.push('regulation')
  if (/(issuer|reserves?|mint|reserve|company|treasury|stablecoin)/.test(text)) tokens.push('issuer')
  if (/(payment|wallet|transfer|bank|clearing|onchain|remittance)/.test(text)) tokens.push('payments')
  if (/(macro|inflation|fed|fomc|rate|monetary|central bank)/.test(text)) tokens.push('macro')
  if (/(aml|fraud|crime|enforcement|investigation|compliance|hack|security|investigation)/.test(text)) tokens.push('aml')
  if (/(defi|liquidity|peg|depeg|redeem|burn|mint|stablecoin|reserves)/.test(text)) tokens.push('defi')

  return Array.from(new Set(tokens))
}

const computeScores = (args: {
  sourceTier: string | null
  topic: string
  entities: string[]
  title: string
  summary: string
}) => {
  const { sourceTier, topic, entities, title, summary } = args

  const sourceScore = parseTierScore(sourceTier)
  const topicScore = keywordSignals[topic as keyof typeof keywordSignals] || keywordSignals.unknown
  const keywordBoost = Math.min(20, topicKeywords(title, summary).length * 6)
  const entityBoost = Math.min(24, entities.length * 4)
  const score = clampScore(sourceScore + topicScore + keywordBoost + entityBoost)
  return { score, importance_label: labelFromScore(score) }
}

const regionFromSource = (value: string | null) => {
  if (value === 'KR') return 'KR'
  return 'Global'
}

export async function POST(request: Request) {
  try {
    const runStart = Date.now()

    const shouldStop = () => Date.now() - runStart > RUN_BUDGET_MS - 1500

    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json(err('unauthorized'), { status: 401 })
    }

    const client = createAdminClient()

    const { data: sources, error: sourceError } = await client
      .from('sources')
      .select('id,name,type,tier,url,rss_url,region,last_success_at,last_error_at')
      .eq('enabled', true)
      // PERF: process non-erroring sources first, then those with recent success.
      .order('last_error_at', { ascending: true, nullsFirst: true })
      .order('last_success_at', { ascending: false, nullsFirst: false })
    if (sourceError) throw sourceError

    if (!sources || sources.length === 0) {
      return NextResponse.json({ ok: true, inserted_articles: 0, issue_updates_created: 0 })
    }

    let insertedArticles = 0
    let issueUpdatesCreated = 0
    let sourcesProcessed = 0
    let stoppedEarly = false
    const runAt = new Date().toISOString()

    for (const source of sources as SourceType[]) {
      if (shouldStop()) {
        stoppedEarly = true
        break
      }

      const runLog: any = {
        source_id: source.id,
        run_at_utc: runAt,
        status: 'ok',
        error_message: null,
        items_fetched: 0,
        items_saved: 0,
      }
      sourcesProcessed += 1

      try {
        const primaryUrl = source.rss_url || source.url
        let response
        try {
          response = await fetchWithRetry(primaryUrl)
        } catch (primaryError) {
          // Fallback: many sources expose broken/removed RSS endpoints.
          // If RSS URL fails, try the source URL once before marking source error.
          if (source.rss_url && source.url && source.url !== source.rss_url) {
            try {
              response = await fetchWithRetry(source.url)
            } catch {
              throw primaryError
            }
          } else {
            throw primaryError
          }
        }

        const xml = await response.text()
        const parsed = extractItemsFromRss(xml)
        runLog.items_fetched = parsed.length
        runLog.items_skipped_url = 0
        runLog.items_skipped_hash = 0
        runLog.items_insert_errors = 0

        // If we successfully fetched but couldn't extract any RSS/Atom items, treat as a warning.
        // This prevents HTML pages (or broken feeds) from being marked as successful and starving real feeds.
        if (parsed.length === 0) {
          runLog.status = 'warn'
          runLog.error_message = 'Error: rss_parse_no_items'
          await client.from('ingest_logs').insert(runLog)
          continue
        }

        // PERF: prefetch active issues once per source to avoid per-article DB queries.
        const region = regionFromSource(source.region)
        const lookbackWindowMinutes = 72 * 60
        const activeWindowSince = new Date(Date.now() - lookbackWindowMinutes * 60 * 1000).toISOString()
        const { data: activeIssues, error: issuesErr } = await client
          .from('issues')
          .select('id,topic_label,title,issue_summary,key_entities,last_seen_at_utc,importance_score')
          .eq('region', region)
          .gte('last_seen_at_utc', activeWindowSince)
          .order('last_seen_at_utc', { ascending: false })
        if (issuesErr) throw issuesErr

        // PERF: batch URL dedupe upfront to avoid per-item queries when feeds are mostly repeats.
        const canonicalUrls = parsed.map((item) => canonicalizeUrl(item.link))
        const urlDedupeSet = new Set<string>()
        if (canonicalUrls.length > 0) {
          const { data: existingUrls } = await client
            .from('articles')
            .select('canonical_url')
            .eq('source_id', source.id)
            .in('canonical_url', canonicalUrls.slice(0, 80))

          for (const row of existingUrls || []) {
            if (row?.canonical_url) urlDedupeSet.add(String(row.canonical_url))
          }
        }

        for (const item of parsed) {
          if (shouldStop()) {
            stoppedEarly = true
            break
          }

          const canonical_url = canonicalizeUrl(item.link)

          if (urlDedupeSet.has(canonical_url)) {
            runLog.items_skipped_url += 1
            continue
          }

          const contentText = `${item.title}\n\n${item.summary}`.slice(0, 4000)
          const contentHash = buildLookupHash(canonical_url, item.title, item.summary)
          const topic = deriveTopic(item.title, item.summary)
          const entities = extractEntities(`${item.title} ${item.summary}`)
          const { score: articleScore, importance_label: articleLabel } = computeScores({
            sourceTier: source.tier,
            topic,
            entities,
            title: item.title,
            summary: item.summary,
          })

          const since = new Date(Date.now() - 24 * 60 * 60 * 1000 * 7).toISOString()
          const { data: dupesByHash } = await client
            .from('articles')
            .select('id')
            .eq('source_id', source.id)
            .eq('content_hash', contentHash)
            .gte('published_at_utc', since)
            .limit(1)

          if (dupesByHash && dupesByHash.length > 0) {
            runLog.items_skipped_hash += 1
            continue
          }

          const { data: inserted, error: insertErr } = await client
            .from('articles')
            .insert({
              title: item.title,
              source_id: source.id,
              url: item.link,
              canonical_url,
              published_at_utc: item.publishedAt,
              language: regionFromSource(source.region) === 'KR' ? 'ko' : 'en',
              region: regionFromSource(source.region),
              content_text: contentText,
              content_hash: contentHash,
              summary_short: item.summary.slice(0, 280),
              why_it_matters: item.summary.slice(0, 140),
              confidence_label: 'medium',
              status: 'new',
              importance_score: articleScore,
              importance_label: articleLabel,
            })
            .select('id')
            .single()

          if (insertErr || !inserted) {
            runLog.items_insert_errors += 1
            continue
          }
          insertedArticles += 1
          runLog.items_saved += 1

          const now = new Date().toISOString()

          let issueId: number | null = null

          let bestMatch = {
            id: null as number | null,
            score: 0,
            seenAt: '',
          }

          const titleTokens = toTokenSet(item.title)
          const summaryTokens = toTokenSet(item.summary)

          for (const candidate of activeIssues || []) {
            const score = issueMatchScore({
              candidate: {
                id: candidate.id,
                topic_label: String(candidate.topic_label || ''),
                issue_summary: candidate.issue_summary || null,
                title: String(candidate.title || ''),
                key_entities: candidate.key_entities,
                last_seen_at_utc: String(candidate.last_seen_at_utc),
              },
              topic,
              titleTokens,
              summaryTokens,
              entities,
              windowMinutes: lookbackWindowMinutes,
            })

            if (score > bestMatch.score) {
              bestMatch = {
                id: candidate.id,
                score,
                seenAt: candidate.last_seen_at_utc,
              }
            }
          }

          const bestCandidateTopic =
            activeIssues?.find((row) => row.id === bestMatch.id)?.topic_label || ''

          if (bestMatch.id && isBestMatch(bestMatch.score, topic, String(bestCandidateTopic), lookbackWindowMinutes / 60)) {
            issueId = bestMatch.id
          }

          if (!issueId) {
            const { score: issueScore, importance_label: issueLabel } = computeScores({
              sourceTier: source.tier,
              topic,
              entities,
              title: item.title,
              summary: item.summary,
            })

            const { data: createdIssue, error: createErr } = await client
              .from('issues')
              .insert({
                title: `${item.title.slice(0, 110)} (${topic})`,
                topic_label: topic,
                region,
                representative_article_id: inserted.id,
                issue_summary: item.summary.slice(0, 280),
                why_it_matters: item.summary.slice(0, 140),
                tags: [topic],
                key_entities: entities,
                importance_score: issueScore,
                importance_label: issueLabel,
                first_seen_at_utc: now,
                last_seen_at_utc: now,
              })
              .select('id')
              .single()

            if (createErr) {
              console.error('issue create failed', createErr)
            } else if (createdIssue) {
              issueId = createdIssue.id
              issueUpdatesCreated += 1
            }
          } else {
            const { score: issueScore, importance_label: issueLabel } = computeScores({
              sourceTier: source.tier,
              topic,
              entities,
              title: item.title,
              summary: item.summary,
            })
            await client
              .from('issues')
              .update({
                last_seen_at_utc: now,
                issue_summary: item.summary.slice(0, 280),
                importance_score: issueScore,
                importance_label: issueLabel,
              })
              .eq('id', issueId)
          }

          if (issueId) {
            await client.from('articles').update({ issue_id: issueId }).eq('id', inserted.id)
            await client.from('issue_updates').insert({
              issue_id: issueId,
              update_at_utc: now,
              update_summary: 'New article coverage update.',
              evidence_article_ids: [inserted.id],
              confidence_label: 'medium',
            })
            issueUpdatesCreated += 1
          }
        }
      } catch (sourceError) {
        runLog.status = 'error'
        runLog.error_message = String(sourceError)
      }

      await client.from('ingest_logs').insert(runLog)

      if (runLog.status === 'ok') {
        await client.from('sources').update({ last_success_at: runAt, last_error_at: null }).eq('id', source.id)
      } else {
        await client.from('sources').update({ last_error_at: runAt }).eq('id', source.id)
      }
    }

    return NextResponse.json({
      ok: true,
      inserted_articles: insertedArticles,
      issue_updates_created: issueUpdatesCreated,
      sources_processed: sourcesProcessed,
      stopped_early: stoppedEarly,
    })
  } catch (error) {
    console.error('POST /api/jobs/ingest failed', error)
    return NextResponse.json(err(`ingest_error: ${String(error)}`), { status: 500 })
  }
}
