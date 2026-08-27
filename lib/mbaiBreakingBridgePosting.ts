import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import {
  buildBreakingBridgeDedupeKey,
  buildBreakingBridgeMessage,
  calculateFreshSeriesChange,
  calculateFreshSeriesDelta,
  parseCoinbaseCandleSeries,
  parseYahooCandleSeries,
  type BreakingBridgeSnapshot,
  type BreakingSignal,
} from '@/lib/mbaiBreakingBridgeConfig'

export const MBAI_BREAKING_BRIDGE_LANE = 'mbai_breaking_bridge'
export const MBAI_BREAKING_BRIDGE_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.MBAI_BREAKING_BRIDGE_ENABLED || 'false').trim().toLowerCase(),
)
export const MBAI_BREAKING_BRIDGE_TARGET_CHANNEL =
  String(process.env.MBAI_TARGET_CHANNEL || '@MBAI_ch').trim() || '@MBAI_ch'

const SOURCE_URLS = {
  es: 'https://query1.finance.yahoo.com/v8/finance/chart/ES%3DF?range=1d&interval=5m',
  nq: 'https://query1.finance.yahoo.com/v8/finance/chart/NQ%3DF?range=1d&interval=5m',
  tnx: 'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=1d&interval=5m',
  dxy: 'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=1d&interval=5m',
  krw: 'https://query1.finance.yahoo.com/v8/finance/chart/KRW%3DX?range=1d&interval=5m',
  btc: 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=300',
  eth: 'https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=300',
} as const

const fetchJson = async (url: string, source: string, fetchImpl: typeof fetch) => {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'MB.AI/1.0 (+https://t.me/MBAI_ch)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`mbai_breaking_bridge_fetch_failed:${source}:${response.status}`)
  try {
    return await response.json()
  } catch {
    throw new Error(`mbai_breaking_bridge_invalid_json:${source}`)
  }
}

export const fetchBreakingBridgeSnapshot = async (
  fetchImpl: typeof fetch = fetch,
  observedAt = new Date().toISOString(),
): Promise<BreakingBridgeSnapshot> => {
  const [esRaw, nqRaw, tnxRaw, dxyRaw, krwRaw, btcRaw, ethRaw] = await Promise.all([
    fetchJson(SOURCE_URLS.es, 'ES=F', fetchImpl),
    fetchJson(SOURCE_URLS.nq, 'NQ=F', fetchImpl),
    fetchJson(SOURCE_URLS.tnx, '^TNX', fetchImpl),
    fetchJson(SOURCE_URLS.dxy, 'DX-Y.NYB', fetchImpl),
    fetchJson(SOURCE_URLS.krw, 'KRW=X', fetchImpl),
    fetchJson(SOURCE_URLS.btc, 'BTC-USD', fetchImpl),
    fetchJson(SOURCE_URLS.eth, 'ETH-USD', fetchImpl),
  ])
  const es = parseYahooCandleSeries(esRaw, 'ES=F')
  const nq = parseYahooCandleSeries(nqRaw, 'NQ=F')
  const tnx = parseYahooCandleSeries(tnxRaw, '^TNX')
  const dxy = parseYahooCandleSeries(dxyRaw, 'DX-Y.NYB')
  const krw = parseYahooCandleSeries(krwRaw, 'KRW=X')
  const btc = parseCoinbaseCandleSeries(btcRaw, 'BTC-USD')
  const eth = parseCoinbaseCandleSeries(ethRaw, 'ETH-USD')
  return {
    observedAt,
    es30: calculateFreshSeriesChange(es, 30, observedAt, 15),
    nq30: calculateFreshSeriesChange(nq, 30, observedAt, 15),
    tnx30Bps: calculateFreshSeriesDelta(tnx, 30, observedAt, 15, 100),
    dxy30: calculateFreshSeriesChange(dxy, 30, observedAt, 15),
    krw30: calculateFreshSeriesChange(krw, 30, observedAt, 15),
    btc60: calculateFreshSeriesChange(btc, 60, observedAt, 10),
    eth60: calculateFreshSeriesChange(eth, 60, observedAt, 10),
  }
}

export const getBreakingBridgeConfig = () => ({
  enabled: MBAI_BREAKING_BRIDGE_ENABLED,
  targetChannel: MBAI_BREAKING_BRIDGE_TARGET_CHANNEL,
  lane: MBAI_BREAKING_BRIDGE_LANE,
  contentType: 'MBAI_BREAKING_BRIDGE',
  schedule: 'every 2 minutes',
  cooldown: '2 hours per signal and direction',
  sources: ['Yahoo Finance', 'Coinbase'],
})

export const queueBreakingBridgePost = async (
  client: any,
  snapshot: BreakingBridgeSnapshot,
  primary: BreakingSignal,
) => {
  const dedupeKey = buildBreakingBridgeDedupeKey(primary, snapshot.observedAt)
  const postText = buildBreakingBridgeMessage(snapshot, primary)
  const articleUrl = new URL('https://t.me/MBAI_ch')
  articleUrl.searchParams.set('type', 'breaking-bridge')
  articleUrl.searchParams.set('signal', primary.id.toLowerCase())
  articleUrl.searchParams.set('bucket', dedupeKey.split(':').at(-1) || '')
  const rpcArgs = {
    p_observed_at: snapshot.observedAt,
    p_signal_id: primary.id,
    p_direction: primary.direction,
    p_dedupe_key: dedupeKey,
    p_source_name: 'Yahoo Finance · Coinbase',
    p_headline: `BREAKING BRIDGE | ${primary.label}`,
    p_article_url: String(articleUrl),
    p_tags: ['MBAI', 'BreakingBridge', primary.id, primary.direction, 'CrossMarket', 'Signal'],
    p_post_text: postText,
    p_target_channel: MBAI_BREAKING_BRIDGE_TARGET_CHANNEL,
    p_target_admin: '@master_billybot',
    p_approved_by: 'auto',
    p_reason: CHANNEL_POST_REASONS.QUEUED_WORKER,
  }
  const { data, error } = await client.rpc('queue_mbai_breaking_bridge_post', rpcArgs)
  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  if (!result || typeof result.queued !== 'boolean') {
    throw new Error('invalid_mbai_breaking_bridge_queue_result')
  }
  return {
    queued: result.queued,
    reason: result.queued ? CHANNEL_POST_REASONS.QUEUED_WORKER : CHANNEL_POST_REASONS.SKIPPED_DUPLICATE,
    dedupeKey,
    postText,
    existingId: Number(result.id || 0) || undefined,
  }
}
