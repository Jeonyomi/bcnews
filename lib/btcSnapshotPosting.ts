import { TELEGRAM_BREAKING_CHANNEL, insertChannelPostSafe } from '@/lib/channelPosting'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'

export const BTC_SNAPSHOT_LANE = 'market_snapshot'
export const BTC_SNAPSHOT_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.KBN_BTC_SNAPSHOT_ENABLED || '').trim().toLowerCase())
export const BTC_SNAPSHOT_SYMBOL = String(process.env.KBN_BTC_SNAPSHOT_SYMBOL || 'BTC').trim().toUpperCase() || 'BTC'
export const BTC_SNAPSHOT_PROVIDER = String(process.env.KBN_BTC_SNAPSHOT_PROVIDER || 'coinbase_spot').trim().toLowerCase() || 'coinbase_spot'
export const BTC_SNAPSHOT_PROVIDER_SYMBOL = String(process.env.KBN_BTC_SNAPSHOT_PROVIDER_SYMBOL || 'BTC-USD').trim().toUpperCase() || 'BTC-USD'
export const BTC_SNAPSHOT_TARGET_CHANNEL = String(process.env.KBN_BTC_SNAPSHOT_TARGET_CHANNEL || TELEGRAM_BREAKING_CHANNEL).trim() || TELEGRAM_BREAKING_CHANNEL
export const BTC_SNAPSHOT_RUN_INTERVAL_SECONDS = Math.max(1, Number.parseInt(process.env.KBN_BTC_SNAPSHOT_RUN_INTERVAL_SECONDS || '300', 10) || 300)
export const BTC_SNAPSHOT_POST_MINUTE = Number.parseInt(process.env.KBN_BTC_SNAPSHOT_POST_MINUTE || '0', 10)
export const BTC_SNAPSHOT_SOURCE_URL = String(process.env.KBN_BTC_SNAPSHOT_SOURCE_URL || 'https://api.coinbase.com/v2/prices/BTC-USD/spot').trim()

const PROVIDER_META: Record<string, { sourceName: string; articleBaseUrl: string }> = {
  coinbase_spot: {
    sourceName: 'Coinbase',
    articleBaseUrl: 'https://www.coinbase.com/price/bitcoin',
  },
  binance_perp: {
    sourceName: 'Binance',
    articleBaseUrl: 'https://www.binance.com/en/futures/BTCUSDT',
  },
}

export const BTC_SNAPSHOT_SOURCE_NAME = PROVIDER_META[BTC_SNAPSHOT_PROVIDER]?.sourceName || 'Market Data'
export const BTC_SNAPSHOT_ARTICLE_BASE_URL = PROVIDER_META[BTC_SNAPSHOT_PROVIDER]?.articleBaseUrl || 'https://www.coinbase.com/price/bitcoin'

export const buildHourlySnapshotWindow = (observedAtIso: string) => {
  const d = new Date(observedAtIso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCHours()).padStart(2, '0')}`
}

export const buildHourlySnapshotDedupeKey = (symbol: string, windowKey: string) => `btc_snapshot_hourly:${symbol}:${windowKey}`

export const buildHourlySnapshotMessage = (symbol: string, observedPrice: number) => {
  const displayPrice = Math.round(observedPrice)
  return `${symbol} $${displayPrice.toLocaleString('en-US')}`
}

export const buildHourlySnapshotArticleUrl = (observedPrice: number, windowKey: string) => {
  const url = new URL(BTC_SNAPSHOT_ARTICLE_BASE_URL)
  url.searchParams.set('type', 'hourly')
  url.searchParams.set('window', windowKey)
  url.searchParams.set('observed', String(observedPrice))
  return String(url)
}

export const getBtcSnapshotConfig = () => ({
  enabled: BTC_SNAPSHOT_ENABLED,
  symbol: BTC_SNAPSHOT_SYMBOL,
  provider: BTC_SNAPSHOT_PROVIDER,
  providerSymbol: BTC_SNAPSHOT_PROVIDER_SYMBOL,
  targetChannel: BTC_SNAPSHOT_TARGET_CHANNEL,
  runIntervalSeconds: BTC_SNAPSHOT_RUN_INTERVAL_SECONDS,
  postMinute: BTC_SNAPSHOT_POST_MINUTE,
  sourceUrl: BTC_SNAPSHOT_SOURCE_URL,
})

export const fetchBtcSnapshotPrice = async () => {
  const url = new URL(BTC_SNAPSHOT_SOURCE_URL)
  if (BTC_SNAPSHOT_PROVIDER === 'binance_perp' && !url.searchParams.get('symbol')) {
    url.searchParams.set('symbol', BTC_SNAPSHOT_PROVIDER_SYMBOL)
  }

  const response = await fetch(String(url), {
    method: 'GET',
    headers: { 'user-agent': 'bcnews-btc-snapshot/1.0' },
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({} as any))

  let priceRaw: unknown = null
  if (BTC_SNAPSHOT_PROVIDER === 'binance_perp') {
    priceRaw = payload?.price
  } else if (BTC_SNAPSHOT_PROVIDER === 'coinbase_spot') {
    priceRaw = payload?.data?.amount
  } else {
    throw new Error(`unsupported_btc_snapshot_provider:${BTC_SNAPSHOT_PROVIDER}`)
  }

  if (!response.ok || priceRaw == null) {
    throw new Error(`btc_snapshot_price_fetch_failed:${payload?.msg || payload?.error || response.statusText}`)
  }

  const price = Number(priceRaw)
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('btc_snapshot_invalid_price')
  }

  return {
    price,
    fetchedAt: new Date().toISOString(),
    raw: payload,
    sourceUrl: String(url),
  }
}

export const queueHourlyBtcSnapshotPost = async (client: any, args: { observedPrice: number; fetchedAt: string }) => {
  const windowKey = buildHourlySnapshotWindow(args.fetchedAt)
  const dedupeKey = buildHourlySnapshotDedupeKey(BTC_SNAPSHOT_SYMBOL, windowKey)
  const articleUrl = buildHourlySnapshotArticleUrl(args.observedPrice, windowKey)
  const postText = buildHourlySnapshotMessage(BTC_SNAPSHOT_SYMBOL, args.observedPrice)

  const { data: existing } = await client
    .from('channel_posts')
    .select('id,status,created_at,dedupe_key')
    .eq('dedupe_key', dedupeKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    return {
      queued: false,
      reason: CHANNEL_POST_REASONS.SKIPPED_DUPLICATE,
      dedupeKey,
      articleUrl,
      postText,
      existingId: Number(existing.id),
      windowKey,
    }
  }

  await insertChannelPostSafe(client, {
    status: 'pending',
    lane: BTC_SNAPSHOT_LANE,
    article_id: null,
    source_name: BTC_SNAPSHOT_SOURCE_NAME,
    headline: postText,
    headline_ko: postText,
    article_url: articleUrl,
    tags: [BTC_SNAPSHOT_SYMBOL, 'MarketSnapshot', 'HourlyUpdate'],
    post_text: postText,
    target_channel: BTC_SNAPSHOT_TARGET_CHANNEL,
    target_admin: '@master_billybot',
    dedupe_key: dedupeKey,
    approved_by: 'auto',
    reason: CHANNEL_POST_REASONS.QUEUED_WORKER,
  })

  return {
    queued: true,
    reason: CHANNEL_POST_REASONS.QUEUED_WORKER,
    dedupeKey,
    articleUrl,
    postText,
    windowKey,
  }
}
