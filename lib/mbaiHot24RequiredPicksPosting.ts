import { CHANNEL_POST_REASONS } from './channelPostReasons.ts'
import { evaluateHot24Candidates } from './mbaiHot24Config.ts'
import {
  assembleRequiredPicks,
  buildRequiredPickDedupeKey,
  buildRequiredPickMessage,
  getRequiredPickExecutionContext,
  parseCryptoVolumeLeaders,
  parseKoreaTurnoverLeaders,
  parseUsTurnoverLeaders,
  type RequiredPick,
  type RequiredPickMarket,
  type TurnoverLeader,
} from './mbaiHot24RequiredPicks.ts'

const MBAI_HOT24_TARGET_CHANNEL = '@MBAI_ch'

export const retryRequiredPickOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation() } catch { return operation() }
}

const fetchJson = async (url: string, source: string, fetchImpl: typeof fetch) => {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { 'user-agent': 'MB.AI/1.0 (+https://t.me/MBAI_ch)' },
        cache: 'no-store', signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error(`required_pick_fetch_failed:${source}:${response.status}`)
      try { return await response.json() } catch { throw new Error(`required_pick_invalid_json:${source}`) }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`required_pick_fetch_failed:${source}`)
}

export const fetchTurnoverLeaders = async (
  market: RequiredPickMarket,
  observedAt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnoverLeader[]> => {
  if (market === 'KOREA') {
    const results = await Promise.allSettled(['KOSPI', 'KOSDAQ'].map((segment) => fetchJson(
      `https://m.stock.naver.com/api/stocks/marketValue/${segment}?page=1&pageSize=100`,
      `Naver-${segment}`, fetchImpl,
    )))
    const payloads = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    if (!payloads.length) throw new Error('required_pick_fetch_failed:Naver-all-segments')
    return parseKoreaTurnoverLeaders(payloads, observedAt)
  }
  if (market === 'US') {
    const payload = await fetchJson(
      'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=100&start=0',
      'Yahoo-most-actives', fetchImpl,
    )
    return parseUsTurnoverLeaders(payload, observedAt)
  }
  const payload = await fetchJson(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=100&page=1&sparkline=false',
    'CoinGecko-volume', fetchImpl,
  )
  return parseCryptoVolumeLeaders(payload, observedAt)
}

export const fetchRequiredPicksForMarket = async (
  client: any,
  market: RequiredPickMarket,
  observedAt = new Date().toISOString(),
  fetchImpl: typeof fetch = fetch,
): Promise<RequiredPick[]> => {
  const { fetchHot24Candidates } = await import('./mbaiHot24Posting.ts')
  const [newsResult, assetResult] = await Promise.allSettled([
    retryRequiredPickOperation(() => fetchHot24Candidates(client, fetchImpl, observedAt)),
    fetchTurnoverLeaders(market, observedAt, fetchImpl),
  ])
  const evaluatedNews = newsResult.status === 'fulfilled'
    ? evaluateHot24Candidates(newsResult.value, observedAt)
    : []
  const assetLeaders = assetResult.status === 'fulfilled' ? assetResult.value : []
  if (newsResult.status === 'rejected') console.error(`required_pick_news_unavailable:${market}`)
  if (assetResult.status === 'rejected') console.error(`required_pick_market_data_unavailable:${market}`)
  return assembleRequiredPicks(market, evaluatedNews, assetLeaders)
}

const safeTagPart = (value: string) => String(value || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80)
export const queueRequiredPick = async (client: any, pick: RequiredPick, observedAt: string) => {
  const execution = getRequiredPickExecutionContext(pick.market, new Date(observedAt))
  const sessionKey = pick.kind === 'ASSET' ? pick.asset.sessionKey : execution.dateKey
  const dedupeKey = buildRequiredPickDedupeKey(sessionKey, pick.market, pick.kind)
  const canonical = pick.kind === 'NEWS'
    ? safeTagPart(String(pick.news.issueId))
    : `${safeTagPart(pick.asset.symbol)}:${sessionKey.replace(/-/g, '')}`
  const issueTag = `Pick:${pick.kind}:${pick.market}:${canonical}`
  const postText = buildRequiredPickMessage(pick, observedAt)
  const sourceName = pick.kind === 'NEWS' ? pick.news.sourceName : pick.asset.source
  const headline = pick.kind === 'NEWS'
    ? `HOT 24 · ${pick.market} NEWS | ${pick.news.title}`
    : `HOT 24 · ${pick.market} ASSET | ${pick.asset.name}`
  const articleUrl = pick.kind === 'NEWS' ? pick.news.articleUrl : pick.asset.url
  const tags = ['MBAI', 'Hot24', pick.market, pick.kind, `MBAI_HOT24_${pick.market}_${pick.kind}`, issueTag]
  const { data, error } = await client.rpc('queue_mbai_hot24_post', {
    p_observed_at: observedAt,
    p_issue_tag: issueTag,
    p_dedupe_key: dedupeKey,
    p_source_name: sourceName,
    p_headline: headline,
    p_article_url: articleUrl,
    p_tags: tags,
    p_post_text: postText,
    p_target_channel: MBAI_HOT24_TARGET_CHANNEL,
    p_target_admin: '@master_billybot',
    p_approved_by: 'auto',
    p_reason: CHANNEL_POST_REASONS.QUEUED_WORKER,
  })
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result || typeof result.queued !== 'boolean') throw new Error('invalid_required_pick_queue_result')
  return {
    queued: result.queued,
    reason: String(result.reason || (result.queued ? CHANNEL_POST_REASONS.QUEUED_WORKER : CHANNEL_POST_REASONS.SKIPPED_DUPLICATE)),
    id: result.id == null ? undefined : Number(result.id),
    dedupeKey,
    issueTag,
    postText,
  }
}
