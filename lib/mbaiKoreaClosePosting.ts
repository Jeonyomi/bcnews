import { insertChannelPostSafe } from '@/lib/channelPosting'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import {
  parseCoinbaseDailyStats,
  parseYahooDailyPoint,
} from '@/lib/mbaiBridgeAmConfig'
import {
  buildKoreaCloseDedupeKey,
  buildKoreaCloseMessage,
  parseNaverMarketPoint,
  type KoreaCloseSnapshot,
} from '@/lib/mbaiKoreaCloseConfig'

export const MBAI_KOREA_CLOSE_LANE = 'mbai_korea_close'
export const MBAI_KOREA_CLOSE_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.MBAI_KOREA_CLOSE_ENABLED || 'true').trim().toLowerCase(),
)
export const MBAI_KOREA_CLOSE_TARGET_CHANNEL =
  String(process.env.MBAI_TARGET_CHANNEL || '@MBAI_ch').trim() || '@MBAI_ch'

const SOURCE_URLS = {
  kospi: 'https://m.stock.naver.com/api/index/KOSPI/basic',
  kosdaq: 'https://m.stock.naver.com/api/index/KOSDAQ/basic',
  usdKrw: 'https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW',
  sp500Futures: 'https://query1.finance.yahoo.com/v8/finance/chart/ES%3DF?range=5d&interval=1d',
  nasdaqFutures: 'https://query1.finance.yahoo.com/v8/finance/chart/NQ%3DF?range=5d&interval=1d',
  btc: 'https://api.exchange.coinbase.com/products/BTC-USD/stats',
  eth: 'https://api.exchange.coinbase.com/products/ETH-USD/stats',
} as const

export const getKstDateKey = (now = new Date()) =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

const fetchJson = async (url: string, source: string, fetchImpl: typeof fetch) => {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'MB.AI/1.0 (+https://t.me/MBAI_ch)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  const payload = await response.json().catch(() => ({} as any))
  if (!response.ok) {
    throw new Error(`mbai_korea_close_fetch_failed:${source}:${response.status}`)
  }
  return payload
}

export const fetchKoreaCloseSnapshot = async (
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<KoreaCloseSnapshot> => {
  const [kospiRaw, kosdaqRaw, usdKrwRaw, sp500Raw, nasdaqRaw, btcRaw, ethRaw] = await Promise.all([
    fetchJson(SOURCE_URLS.kospi, 'KOSPI', fetchImpl),
    fetchJson(SOURCE_URLS.kosdaq, 'KOSDAQ', fetchImpl),
    fetchJson(SOURCE_URLS.usdKrw, 'USD/KRW', fetchImpl),
    fetchJson(SOURCE_URLS.sp500Futures, 'ES=F', fetchImpl),
    fetchJson(SOURCE_URLS.nasdaqFutures, 'NQ=F', fetchImpl),
    fetchJson(SOURCE_URLS.btc, 'BTC-USD', fetchImpl),
    fetchJson(SOURCE_URLS.eth, 'ETH-USD', fetchImpl),
  ])
  const dateKey = getKstDateKey(now)
  const kospi = parseNaverMarketPoint(kospiRaw, 'KOSPI')
  const kosdaq = parseNaverMarketPoint(kosdaqRaw, 'KOSDAQ')
  if (kospi.asOfDate !== dateKey || kosdaq.asOfDate !== dateKey) {
    throw new Error(`korea_market_date_mismatch:${dateKey}:${kospi.asOfDate}:${kosdaq.asOfDate}`)
  }
  return {
    dateKey,
    kospi,
    kosdaq,
    usdKrw: parseNaverMarketPoint(usdKrwRaw?.result, 'USD/KRW', false),
    sp500Futures: parseYahooDailyPoint(sp500Raw, 'ES=F'),
    nasdaqFutures: parseYahooDailyPoint(nasdaqRaw, 'NQ=F'),
    btc: parseCoinbaseDailyStats(btcRaw, 'BTC-USD'),
    eth: parseCoinbaseDailyStats(ethRaw, 'ETH-USD'),
  }
}

export const getKoreaCloseConfig = () => ({
  enabled: MBAI_KOREA_CLOSE_ENABLED,
  targetChannel: MBAI_KOREA_CLOSE_TARGET_CHANNEL,
  lane: MBAI_KOREA_CLOSE_LANE,
  contentType: 'MBAI_KOREA_CLOSE',
  schedule: 'weekdays 15:40 Asia/Seoul',
  sources: ['Naver Finance', 'Yahoo Finance', 'Coinbase'],
})

export const queueKoreaClosePost = async (client: any, snapshot: KoreaCloseSnapshot) => {
  const dedupeKey = buildKoreaCloseDedupeKey(snapshot.dateKey)
  const postText = buildKoreaCloseMessage(snapshot)
  const articleUrl = new URL('https://t.me/MBAI_ch')
  articleUrl.searchParams.set('type', 'korea-close')
  articleUrl.searchParams.set('date', snapshot.dateKey)
  const postRow = {
    status: 'pending',
    lane: MBAI_KOREA_CLOSE_LANE,
    article_id: null,
    source_name: 'Naver Finance · Yahoo Finance · Coinbase',
    headline: `KOREA CLOSE | ${snapshot.dateKey}`,
    headline_ko: `KOREA CLOSE | ${snapshot.dateKey}`,
    article_url: String(articleUrl),
    tags: ['MBAI', 'KoreaClose', 'KoreanStocks', 'USFutures', 'Crypto', 'CrossMarket'],
    post_text: postText,
    target_channel: MBAI_KOREA_CLOSE_TARGET_CHANNEL,
    target_admin: '@master_billybot',
    dedupe_key: dedupeKey,
    approved_by: 'auto',
    reason: CHANNEL_POST_REASONS.QUEUED_WORKER,
  }

  const { data: existing, error } = await client
    .from('channel_posts')
    .select('id,status,created_at,dedupe_key')
    .eq('dedupe_key', dedupeKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error

  if (existing?.id) {
    if (existing.status === 'failed') {
      const { data: retried, error: retryError } = await client
        .from('channel_posts')
        .update({ ...postRow, updated_at: new Date().toISOString() })
        .eq('id', Number(existing.id))
        .eq('status', 'failed')
        .select('id')
        .maybeSingle()
      if (retryError) throw retryError
      if (!retried?.id) {
        return { queued: false, reason: CHANNEL_POST_REASONS.SKIPPED_DUPLICATE, dedupeKey, postText, existingId: Number(existing.id) }
      }
      return { queued: true, reason: CHANNEL_POST_REASONS.QUEUED_WORKER, dedupeKey, postText, existingId: Number(existing.id) }
    }
    return { queued: false, reason: CHANNEL_POST_REASONS.SKIPPED_DUPLICATE, dedupeKey, postText, existingId: Number(existing.id) }
  }

  try {
    await insertChannelPostSafe(client, postRow)
  } catch (insertError: any) {
    const duplicate = insertError?.code === '23505' || String(insertError?.message || '').includes('duplicate key')
    if (!duplicate) throw insertError
    return { queued: false, reason: CHANNEL_POST_REASONS.SKIPPED_DUPLICATE, dedupeKey, postText }
  }
  return { queued: true, reason: CHANNEL_POST_REASONS.QUEUED_WORKER, dedupeKey, postText }
}
