import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { err } from '@/lib/dashboardApi'

export const dynamic = 'force-dynamic'

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

const extractItemsFromRss = (xml: string) => {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || []
  return items
    .map((item) => {
      const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i)
      const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i)
      const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i)
      const pubMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)

      const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''
      const link = linkMatch ? linkMatch[1].trim() : ''
      const summary = descMatch ? descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''
      const publishedAt = pubMatch ? new Date(pubMatch[1]).toISOString() : new Date().toISOString()

      return { title, link, summary, publishedAt }
    })
    .filter((row) => row.title && row.link)
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

const deriveTopic = (title: string, summary: string) => {
  const text = `${title} ${summary}`.toLowerCase()
  if (/regulation|policy|regulatory|법|규제/.test(text)) return 'regulation'
  if (/issuer|issuer\s*reserves|발행|발행사|company/.test(text)) return 'issuer'
  if (/pay|payment|bank|결제/.test(text)) return 'payments'
  if (/macro|fed|inflation|금리|금통/.test(text)) return 'macro'
  if (/aml|enforcement|crime|fraud|해킹|사기/.test(text)) return 'aml'
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

const regionFromSource = (value: string | null) => {
  if (value === 'KR') return 'KR'
  return 'Global'
}

export async function POST(request: Request) {
  try {
    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json(err('unauthorized'), { status: 401 })
    }

    const client = createAdminClient()

    const { data: sources, error: sourceError } = await client
      .from('sources')
      .select('id,name,type,tier,url,rss_url,region')
      .eq('enabled', true)
    if (sourceError) throw sourceError

    if (!sources || sources.length === 0) {
      return NextResponse.json({ ok: true, inserted_articles: 0, issue_updates_created: 0 })
    }

    let insertedArticles = 0
    let issueUpdatesCreated = 0
    const runAt = new Date().toISOString()

    for (const source of sources as SourceType[]) {
      const runLog: any = {
        source_id: source.id,
        run_at_utc: runAt,
        status: 'ok',
        error_message: null,
        items_fetched: 0,
        items_saved: 0,
      }

      try {
        const targetUrl = source.rss_url || source.url
        const response = await fetch(targetUrl)
        if (!response.ok) throw new Error(`rss_fetch_status_${response.status}`)

        const xml = await response.text()
        const parsed = extractItemsFromRss(xml)
        runLog.items_fetched = parsed.length

        for (const item of parsed) {
          const canonical_url = canonicalizeUrl(item.link)
          const contentText = `${item.title}\n\n${item.summary}`.slice(0, 4000)
          const contentHash = hashContent(`${canonical_url}::${item.title}`)
          const topic = deriveTopic(item.title, item.summary)

          const { data: dupes } = await client
            .from('articles')
            .select('id')
            .or(`canonical_url.eq.${canonical_url},content_hash.eq.${contentHash}`)
            .limit(1)

          if (dupes && dupes.length > 0) continue

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
              importance_score: 35,
              importance_label: 'watch',
              status: 'new',
            })
            .select('id')
            .single()

          if (insertErr || !inserted) continue
          insertedArticles += 1
          runLog.items_saved += 1

          const now = new Date().toISOString()
          const region = regionFromSource(source.region)

          const { data: activeIssues, error: issuesErr } = await client
            .from('issues')
            .select('id,topic_label,key_entities,importance_score')
            .eq('region', region)
            .gte('last_seen_at_utc', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
            .order('last_seen_at_utc', { ascending: false })

          if (issuesErr) {
            throw issuesErr
          }

          let issueId: number | null = null

          for (const candidate of activeIssues || []) {
            if (String(candidate.topic_label) === topic) {
              issueId = candidate.id
              break
            }
          }

          if (!issueId) {
            const entities = extractEntities(`${item.title} ${item.summary}`)
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
                importance_score: 35,
                importance_label: 'watch',
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
            await client
              .from('issues')
              .update({
                last_seen_at_utc: now,
                issue_summary: item.summary.slice(0, 280),
              })
              .eq('id', issueId)
          }

          if (issueId) {
            await client.from('articles').update({ issue_id: issueId }).eq('id', inserted.id)
            await client.from('issue_updates').insert({
              issue_id: issueId,
              update_at_utc: now,
              update_summary: `New article coverage: ${item.title}`,
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
        await client
          .from('sources')
          .update({ last_success_at: runAt })
          .eq('id', source.id)
      }
    }

    return NextResponse.json({
      ok: true,
      inserted_articles: insertedArticles,
      issue_updates_created: issueUpdatesCreated,
    })
  } catch (error) {
    console.error('POST /api/jobs/ingest failed', error)
    return NextResponse.json(err(`ingest_error: ${String(error)}`), { status: 500 })
  }
}
