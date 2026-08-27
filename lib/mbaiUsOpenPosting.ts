import { insertChannelPostSafe } from '@/lib/channelPosting'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import { parseCoinbaseDailyStats, parseYahooDailyPoint } from '@/lib/mbaiBridgeAmConfig'
import { parseNaverMarketPoint } from '@/lib/mbaiKoreaCloseConfig'
import {
  buildUsOpenDedupeKey,
  buildUsOpenMessage,
  type UsOpenSnapshot,
} from '@/lib/mbaiUsOpenConfig'

export const MBAI_US_OPEN_LANE = 'mbai_us_open'
export const MBAI_US_OPEN_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.MBAI_US_OPEN_ENABLED || 'true').trim().toLowerCase(),
)
export const MBAI_US_OPEN_TARGET_CHANNEL =
  String(process.env.MBAI_TARGET_CHANNEL || '@MBAI_ch').trim() || '@MBAI_ch'

const SOURCE_URLS = {
  sp500Futures: 'https://query1.finance.yahoo.com/v8/finance/chart/ES%3DF?range=5d&interval=1d',
  nasdaqFutures: 'https://query1.finance.yahoo.com/v8/finance/chart/NQ%3DF?range=5d&interval=1d',
  treasury10y: 'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=5d&interval=1d',
  dxy: 'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=5d&interval=1d',
  usdKrw: 'https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW',
  kospi: 'https://m.stock.naver.com/api/index/KOSPI/basic',
  kosdaq: 'https://m.stock.naver.com/api/index/KOSDAQ/basic',
  btc: 'https://api.exchange.coinbase.com/products/BTC-USD/stats',
  eth: 'https://api.exchange.coinbase.com/products/ETH-USD/stats',
} as const

const fetchJson = async (url: string, source: string, fetchImpl: typeof fetch) => {
  const result = await fetchImpl(url, {
    headers: { 'user-agent': 'MB.AI/1.0 (+https://t.me/MBAI_ch)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  const payload = await result.json().catch(() => ({} as any))
  if (!result.ok) throw new Error(`mbai_us_open_fetch_failed:${source}:${result.status}`)
  return payload
}

export const fetchUsOpenSnapshot = async (
  fetchImpl: typeof fetch = fetch,
  sessionDate: string,
): Promise<UsOpenSnapshot> => {
  const [sp500Raw, nasdaqRaw, treasuryRaw, dxyRaw, usdKrwRaw, kospiRaw, kosdaqRaw, btcRaw, ethRaw] = await Promise.all([
    fetchJson(SOURCE_URLS.sp500Futures, 'ES=F', fetchImpl),
    fetchJson(SOURCE_URLS.nasdaqFutures, 'NQ=F', fetchImpl),
    fetchJson(SOURCE_URLS.treasury10y, '^TNX', fetchImpl),
    fetchJson(SOURCE_URLS.dxy, 'DX-Y.NYB', fetchImpl),
    fetchJson(SOURCE_URLS.usdKrw, 'USD/KRW', fetchImpl),
    fetchJson(SOURCE_URLS.kospi, 'KOSPI', fetchImpl),
    fetchJson(SOURCE_URLS.kosdaq, 'KOSDAQ', fetchImpl),
    fetchJson(SOURCE_URLS.btc, 'BTC-USD', fetchImpl),
    fetchJson(SOURCE_URLS.eth, 'ETH-USD', fetchImpl),
  ])
  const snapshot: UsOpenSnapshot = {
    sessionDate,
    sp500Futures: parseYahooDailyPoint(sp500Raw, 'ES=F'),
    nasdaqFutures: parseYahooDailyPoint(nasdaqRaw, 'NQ=F'),
    treasury10y: parseYahooDailyPoint(treasuryRaw, '^TNX'),
    dxy: parseYahooDailyPoint(dxyRaw, 'DX-Y.NYB'),
    usdKrw: parseNaverMarketPoint(usdKrwRaw?.result, 'USD/KRW', false),
    kospi: parseNaverMarketPoint(kospiRaw, 'KOSPI'),
    kosdaq: parseNaverMarketPoint(kosdaqRaw, 'KOSDAQ'),
    btc: parseCoinbaseDailyStats(btcRaw, 'BTC-USD'),
    eth: parseCoinbaseDailyStats(ethRaw, 'ETH-USD'),
  }
  const datedPoints = [
    snapshot.sp500Futures,
    snapshot.nasdaqFutures,
    snapshot.treasury10y,
    snapshot.dxy,
    snapshot.usdKrw,
    snapshot.kospi,
    snapshot.kosdaq,
  ]
  const stale = datedPoints.filter((point) => point.asOfDate !== sessionDate)
  if (stale.length) {
    throw new Error(`us_open_stale_market_data:${sessionDate}:${stale.map((point) => `${point.symbol}=${point.asOfDate}`).join(',')}`)
  }
  return snapshot
}

export const getUsOpenConfig = () => ({
  enabled: MBAI_US_OPEN_ENABLED,
  targetChannel: MBAI_US_OPEN_TARGET_CHANNEL,
  lane: MBAI_US_OPEN_LANE,
  contentType: 'MBAI_US_OPEN',
  schedule: 'weekdays 09:25 America/New_York via 22:25/23:25 Asia/Seoul triggers',
  sources: ['Yahoo Finance', 'Naver Finance', 'Coinbase'],
})

export const queueUsOpenPost = async (client: any, snapshot: UsOpenSnapshot) => {
  const dedupeKey = buildUsOpenDedupeKey(snapshot.sessionDate)
  const postText = buildUsOpenMessage(snapshot)
  const articleUrl = new URL('https://t.me/MBAI_ch')
  articleUrl.searchParams.set('type', 'us-open')
  articleUrl.searchParams.set('date', snapshot.sessionDate)
  const postRow = {
    status: 'pending',
    lane: MBAI_US_OPEN_LANE,
    article_id: null,
    source_name: 'Yahoo Finance · Naver Finance · Coinbase',
    headline: `US OPEN | ${snapshot.sessionDate}`,
    headline_ko: `US OPEN | ${snapshot.sessionDate}`,
    article_url: String(articleUrl),
    tags: ['MBAI', 'USOpen', 'USFutures', 'Rates', 'KoreanStocks', 'Crypto', 'CrossMarket'],
    post_text: postText,
    target_channel: MBAI_US_OPEN_TARGET_CHANNEL,
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
