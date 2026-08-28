import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import {
  buildHot24DedupeKey,
  buildHot24Message,
  evaluateHot24Candidates,
  identifyHot24AssetSymbol,
  isPublishableKoreanNarrative,
  parseYahooDailyReaction,
  trimToCompleteSentence,
  selectHot24Candidate,
  type EvaluatedHot24Candidate,
  type Hot24AssetReaction,
  type Hot24Candidate,
} from '@/lib/mbaiHot24Config'
import { parseJsonArray } from '@/lib/supabase'
import { stripHtml } from '@/lib/text'

export const MBAI_HOT24_LANE = 'mbai_hot24'
export const MBAI_HOT24_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.MBAI_HOT24_ENABLED || 'false').trim().toLowerCase(),
)
export const MBAI_HOT24_TARGET_CHANNEL = '@MBAI_ch'

const ASSETS = [
  { symbol: 'BTC-USD', name: '비트코인', market: '크립토' as const, source: 'Coinbase', aliases: ['bitcoin', '비트코인', 'btc'] },
  { symbol: 'ETH-USD', name: '이더리움', market: '크립토' as const, source: 'Coinbase', aliases: ['ethereum', '이더리움', 'eth'] },
  { symbol: 'NVDA', name: '엔비디아', market: '미국주식' as const, source: 'Yahoo Finance', aliases: ['nvidia', '엔비디아', 'nvda'] },
  { symbol: 'TSLA', name: '테슬라', market: '미국주식' as const, source: 'Yahoo Finance', aliases: ['tesla', '테슬라', 'tsla'] },
  { symbol: 'MSTR', name: '스트래티지', market: '미국주식' as const, source: 'Yahoo Finance', aliases: ['microstrategy', '마이크로스트래티지', 'mstr'] },
  { symbol: 'COIN', name: '코인베이스', market: '미국주식' as const, source: 'Yahoo Finance', aliases: ['coinbase', '코인베이스'] },
  { symbol: 'AMD', name: 'AMD', market: '미국주식' as const, source: 'Yahoo Finance', aliases: ['advanced micro devices', 'amd'] },
  { symbol: 'AAPL', name: '애플', market: '미국주식' as const, source: 'Yahoo Finance', aliases: ['apple', '애플', 'aapl'] },
  { symbol: 'MSFT', name: '마이크로소프트', market: '미국주식' as const, source: 'Yahoo Finance', aliases: ['microsoft', '마이크로소프트', 'msft'] },
  { symbol: 'META', name: '메타', market: '미국주식' as const, source: 'Yahoo Finance', aliases: ['meta platforms', '메타', 'meta'] },
  { symbol: 'GOOGL', name: '알파벳', market: '미국주식' as const, source: 'Yahoo Finance', aliases: ['alphabet', 'google', '알파벳', '구글', 'googl'] },
  { symbol: 'AMZN', name: '아마존', market: '미국주식' as const, source: 'Yahoo Finance', aliases: ['amazon', '아마존', 'amzn'] },
  { symbol: '005930.KS', name: '삼성전자', market: '한국주식' as const, source: 'Yahoo Finance', aliases: ['samsung electronics', '삼성전자', '005930'] },
  { symbol: '000660.KS', name: 'SK하이닉스', market: '한국주식' as const, source: 'Yahoo Finance', aliases: ['sk hynix', 'sk하이닉스', '하이닉스', '000660'] },
]

const getKstParts = (now: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(now).map(({ type, value }) => [type, value]))

export const getHot24ExecutionContext = (now = new Date()) => {
  const parts = getKstParts(now)
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute)
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minuteOfDay,
    inWindow: minuteOfDay >= 20 * 60 + 25 && minuteOfDay <= 20 * 60 + 39,
    timeZone: 'Asia/Seoul',
  }
}

const fetchJson = async (url: string, source: string, fetchImpl: typeof fetch) => {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'MB.AI/1.0 (+https://t.me/MBAI_ch)' },
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`mbai_hot24_fetch_failed:${source}:${response.status}`)
  try { return await response.json() } catch { throw new Error(`mbai_hot24_invalid_json:${source}`) }
}

const yahooReaction = async (
  asset: typeof ASSETS[number],
  observedAt: string,
  fetchImpl: typeof fetch,
): Promise<Hot24AssetReaction> => {
  const encoded = encodeURIComponent(asset.symbol)
  const payload = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=1mo&interval=1d`, asset.symbol, fetchImpl)
  const parsed = parseYahooDailyReaction(payload, observedAt)
  return {
    symbol: asset.symbol, name: asset.name, market: asset.market, price: parsed.price,
    change24h: parsed.change24h, volumeRatio: parsed.volumeRatio, source: asset.source,
  }
}

const coinbaseReaction = async (asset: typeof ASSETS[number], fetchImpl: typeof fetch): Promise<Hot24AssetReaction> => {
  const payload = await fetchJson(`https://api.exchange.coinbase.com/products/${asset.symbol}/stats`, asset.symbol, fetchImpl)
  const open = Number(payload?.open)
  const price = Number(payload?.last)
  if (!Number.isFinite(open) || open <= 0 || !Number.isFinite(price) || price <= 0) throw new Error(`invalid_hot24_coinbase:${asset.symbol}`)
  return {
    symbol: asset.symbol.replace('-USD', ''), name: asset.name, market: asset.market, price,
    change24h: ((price - open) / open) * 100, volumeRatio: null, source: asset.source,
  }
}

const identifyAsset = (candidate: Hot24Candidate) => {
  const symbol = identifyHot24AssetSymbol([candidate.title, candidate.summary, ...candidate.keyEntities].join(' '))
  return symbol ? ASSETS.find((asset) => asset.symbol === symbol) || null : null
}

const enrichAsset = async (
  candidate: Hot24Candidate,
  observedAt: string,
  fetchImpl: typeof fetch,
  cache: Map<string, Promise<Hot24AssetReaction | null>>,
) => {
  const asset = identifyAsset(candidate)
  if (!asset) return candidate
  if (!cache.has(asset.symbol)) {
    cache.set(asset.symbol, (async () => {
      try {
        return asset.source === 'Coinbase'
          ? await coinbaseReaction(asset, fetchImpl)
          : await yahooReaction(asset, observedAt, fetchImpl)
      } catch {
        return null
      }
    })())
  }
  const reaction = await cache.get(asset.symbol)!
  return reaction ? { ...candidate, asset: reaction } : candidate
}

export const fetchHot24Candidates = async (
  client: any,
  fetchImpl: typeof fetch = fetch,
  observedAt = new Date().toISOString(),
) => {
  const now = new Date(observedAt)
  if (!Number.isFinite(now.getTime())) throw new Error('invalid_hot24_observed_at')
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const articles: any[] = []
  const pageSize = 200
  let offset = 0
  while (true) {
    const { data: page, error } = await client
      .from('articles')
      .select(`id,title,url,published_at_utc,summary_short,why_it_matters,confidence_label,importance_score,importance_label,issue_id,region,source:sources(id,name,tier),issue:issues!fk_articles_issue(id,topic_label,tags,key_entities)`)
      .gte('published_at_utc', since)
      .lte('published_at_utc', observedAt)
      .gte('importance_score', 50)
      .order('importance_score', { ascending: false })
      .order('published_at_utc', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    const rows = page || []
    articles.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
  }
  if (!articles.length) return []

  const issueCounts = new Map<number, number>()
  for (const article of articles) {
    const key = Number(article.issue_id || article.id)
    issueCounts.set(key, (issueCounts.get(key) || 0) + 1)
  }

  const candidates: Hot24Candidate[] = articles.flatMap((article: any) => {
    const source = Array.isArray(article.source) ? article.source[0] : article.source
    const issue = Array.isArray(article.issue) ? article.issue[0] : article.issue
    const title = stripHtml(String(article.title || '')).replace(/\s+/g, ' ').trim()
    const summary = trimToCompleteSentence(stripHtml(String(article.summary_short || '')))
    const whyItMatters = trimToCompleteSentence(stripHtml(String(article.why_it_matters || '')))
    if (!isPublishableKoreanNarrative(title, summary, whyItMatters)) return []
    if (String(article.confidence_label || '').toLowerCase() === 'low') return []
    const issueId = Number(article.issue_id || article.id)
    return [{
      issueId, title, summary, whyItMatters,
      topic: String(issue?.topic_label || 'Market'), region: String(article.region || 'Global'),
      importanceScore: Number(article.importance_score || 0), importanceLabel: String(article.importance_label || 'watch'),
      firstSeenAt: String(article.published_at_utc || ''), lastSeenAt: String(article.published_at_utc || ''),
      sourceName: String(source?.name || 'MB.AI verified sources'), sourceTier: String(source?.tier || 'media'),
      articleUrl: String(article.url || 'https://t.me/MBAI_ch'),
      keyEntities: parseJsonArray(issue?.key_entities).map(String), tags: parseJsonArray(issue?.tags).map(String),
      updateCount: Math.max(0, (issueCounts.get(issueId) || 1) - 1), asset: null,
    }]
  })
  const reactionCache = new Map<string, Promise<Hot24AssetReaction | null>>()
  return Promise.all(candidates.map((candidate) => enrichAsset(candidate, observedAt, fetchImpl, reactionCache)))
}

export const getHot24Config = () => ({
  enabled: MBAI_HOT24_ENABLED, targetChannel: MBAI_HOT24_TARGET_CHANNEL,
  lane: MBAI_HOT24_LANE, contentType: 'MBAI_HOT24', schedule: 'daily 20:30 Asia/Seoul',
  publishThreshold: 65, dailyCap: 1, sources: ['MB.AI News Intelligence', 'Yahoo Finance', 'Coinbase'],
})

export const selectHot24FromLiveData = async (client: any, fetchImpl: typeof fetch = fetch, observedAt = new Date().toISOString()) => {
  const raw = await fetchHot24Candidates(client, fetchImpl, observedAt)
  return selectHot24Candidate(evaluateHot24Candidates(raw, observedAt))
}

export const queueHot24Post = async (client: any, selected: EvaluatedHot24Candidate, observedAt: string) => {
  const execution = getHot24ExecutionContext(new Date(observedAt))
  const dedupeKey = buildHot24DedupeKey(execution.dateKey)
  const postText = buildHot24Message(selected, observedAt)
  const issueTag = `Issue:${selected.issueId}`
  const headline = `HOT 24 · ${selected.contentType} | ${selected.asset?.name || selected.title}`
  const rpcArgs = {
    p_observed_at: observedAt,
    p_issue_tag: issueTag,
    p_dedupe_key: dedupeKey,
    p_source_name: `${selected.sourceName} · ${selected.asset?.source || 'MB.AI News Intelligence'}`,
    p_headline: headline,
    p_article_url: selected.articleUrl,
    p_tags: ['MBAI', 'Hot24', selected.contentType, selected.topic, 'CrossMarket', issueTag],
    p_post_text: postText,
    p_target_channel: MBAI_HOT24_TARGET_CHANNEL,
    p_target_admin: '@master_billybot',
    p_approved_by: 'auto',
    p_reason: CHANNEL_POST_REASONS.QUEUED_WORKER,
  }
  const { data, error } = await client.rpc('queue_mbai_hot24_post', rpcArgs)
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result || typeof result.queued !== 'boolean') throw new Error('invalid_mbai_hot24_queue_result')
  return {
    queued: result.queued,
    reason: String(result.reason || (result.queued ? CHANNEL_POST_REASONS.QUEUED_WORKER : CHANNEL_POST_REASONS.SKIPPED_DUPLICATE)),
    dedupeKey,
    postText,
    existingId: result.id == null ? undefined : Number(result.id),
  }
}
