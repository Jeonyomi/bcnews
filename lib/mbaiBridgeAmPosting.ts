import { insertChannelPostSafe } from '@/lib/channelPosting'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import {
  buildBridgeAmDedupeKey,
  buildBridgeAmMessage,
  parseCoinbaseDailyStats,
  parseYahooDailyPoint,
  type BridgeAmSnapshot,
} from '@/lib/mbaiBridgeAmConfig'

export const MBAI_BRIDGE_AM_LANE = 'mbai_bridge_am'
export const MBAI_BRIDGE_AM_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.MBAI_BRIDGE_AM_ENABLED || 'true').trim().toLowerCase(),
)
export const MBAI_BRIDGE_AM_TARGET_CHANNEL =
  String(process.env.MBAI_TARGET_CHANNEL || '@MBAI_ch').trim() || '@MBAI_ch'

const YAHOO_URLS = {
  sp500: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d',
  nasdaq: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?range=5d&interval=1d',
  dow: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EDJI?range=5d&interval=1d',
  treasury10y: 'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=5d&interval=1d',
  dxy: 'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=5d&interval=1d',
  usdKrw: 'https://query1.finance.yahoo.com/v8/finance/chart/KRW%3DX?range=5d&interval=1d',
} as const

const COINBASE_URLS = {
  btc: 'https://api.exchange.coinbase.com/products/BTC-USD/stats',
  eth: 'https://api.exchange.coinbase.com/products/ETH-USD/stats',
} as const

export const getKstDateKey = (now = new Date()) =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

const fetchJson = async (url: string, source: string, fetchImpl: typeof fetch) => {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'MB.AI/1.0 (+https://t.me/MBAI_ch)' },
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({} as any))
  if (!response.ok) {
    throw new Error(`mbai_bridge_am_fetch_failed:${source}:${response.status}:${payload?.message || response.statusText}`)
  }
  return payload
}

export const fetchBridgeAmSnapshot = async (
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<BridgeAmSnapshot> => {
  const [sp500, nasdaq, dow, treasury10y, dxy, usdKrw, btc, eth] = await Promise.all([
    fetchJson(YAHOO_URLS.sp500, '^GSPC', fetchImpl),
    fetchJson(YAHOO_URLS.nasdaq, '^IXIC', fetchImpl),
    fetchJson(YAHOO_URLS.dow, '^DJI', fetchImpl),
    fetchJson(YAHOO_URLS.treasury10y, '^TNX', fetchImpl),
    fetchJson(YAHOO_URLS.dxy, 'DX-Y.NYB', fetchImpl),
    fetchJson(YAHOO_URLS.usdKrw, 'KRW=X', fetchImpl),
    fetchJson(COINBASE_URLS.btc, 'BTC-USD', fetchImpl),
    fetchJson(COINBASE_URLS.eth, 'ETH-USD', fetchImpl),
  ])

  return {
    dateKey: getKstDateKey(now),
    sp500: parseYahooDailyPoint(sp500, '^GSPC'),
    nasdaq: parseYahooDailyPoint(nasdaq, '^IXIC'),
    dow: parseYahooDailyPoint(dow, '^DJI'),
    treasury10y: parseYahooDailyPoint(treasury10y, '^TNX'),
    dxy: parseYahooDailyPoint(dxy, 'DX-Y.NYB'),
    usdKrw: parseYahooDailyPoint(usdKrw, 'KRW=X'),
    btc: parseCoinbaseDailyStats(btc, 'BTC-USD'),
    eth: parseCoinbaseDailyStats(eth, 'ETH-USD'),
  }
}

export const getBridgeAmConfig = () => ({
  enabled: MBAI_BRIDGE_AM_ENABLED,
  targetChannel: MBAI_BRIDGE_AM_TARGET_CHANNEL,
  lane: MBAI_BRIDGE_AM_LANE,
  schedule: 'weekdays 07:40 Asia/Seoul',
  sources: ['Yahoo Finance', 'Coinbase'],
})

export const queueBridgeAmPost = async (client: any, snapshot: BridgeAmSnapshot) => {
  const dedupeKey = buildBridgeAmDedupeKey(snapshot.dateKey)
  const postText = buildBridgeAmMessage(snapshot)
  const articleUrl = new URL('https://t.me/MBAI_ch')
  articleUrl.searchParams.set('type', 'bridge-am')
  articleUrl.searchParams.set('date', snapshot.dateKey)
  const postRow = {
    status: 'pending',
    lane: MBAI_BRIDGE_AM_LANE,
    article_id: null,
    source_name: 'Yahoo Finance · Coinbase',
    headline: `BRIDGE AM | ${snapshot.dateKey}`,
    headline_ko: `BRIDGE AM | ${snapshot.dateKey}`,
    article_url: String(articleUrl),
    tags: ['MBAI', 'BridgeAM', 'USStocks', 'Crypto', 'CrossMarket'],
    post_text: postText,
    target_channel: MBAI_BRIDGE_AM_TARGET_CHANNEL,
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
      const { error: retryError } = await client
        .from('channel_posts')
        .update({ ...postRow, updated_at: new Date().toISOString() })
        .eq('id', Number(existing.id))
        .eq('status', 'failed')
      if (retryError) throw retryError
      return { queued: true, reason: CHANNEL_POST_REASONS.QUEUED_WORKER, dedupeKey, postText, existingId: Number(existing.id) }
    }
    return { queued: false, reason: CHANNEL_POST_REASONS.SKIPPED_DUPLICATE, dedupeKey, postText, existingId: Number(existing.id) }
  }

  try {
    await insertChannelPostSafe(client, postRow)
  } catch (insertError: any) {
    const isUniqueViolation = insertError?.code === '23505' || String(insertError?.message || '').includes('duplicate key')
    if (!isUniqueViolation) throw insertError
    return { queued: false, reason: CHANNEL_POST_REASONS.SKIPPED_DUPLICATE, dedupeKey, postText }
  }

  return { queued: true, reason: CHANNEL_POST_REASONS.QUEUED_WORKER, dedupeKey, postText }
}
