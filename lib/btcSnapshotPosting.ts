import { createHash } from 'crypto'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import { TELEGRAM_BREAKING_CHANNEL, insertChannelPostSafe } from '@/lib/channelPosting'

export const BTC_SNAPSHOT_LANE = 'market_snapshot'
export const BTC_SNAPSHOT_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.KBN_BTC_SNAPSHOT_ENABLED || '').trim().toLowerCase())
export const BTC_SNAPSHOT_SYMBOL = String(process.env.KBN_BTC_SNAPSHOT_SYMBOL || 'BTC').trim().toUpperCase() || 'BTC'
export const BTC_SNAPSHOT_PROVIDER = String(process.env.KBN_BTC_SNAPSHOT_PROVIDER || 'coinbase_spot').trim().toLowerCase() || 'coinbase_spot'
export const BTC_SNAPSHOT_PROVIDER_SYMBOL = String(process.env.KBN_BTC_SNAPSHOT_PROVIDER_SYMBOL || 'BTC-USD').trim().toUpperCase() || 'BTC-USD'
export const BTC_SNAPSHOT_STEP = Math.max(1, Number.parseInt(process.env.KBN_BTC_SNAPSHOT_STEP || '1000', 10) || 1000)
export const BTC_SNAPSHOT_TARGET_CHANNEL = String(process.env.KBN_BTC_SNAPSHOT_TARGET_CHANNEL || TELEGRAM_BREAKING_CHANNEL).trim() || TELEGRAM_BREAKING_CHANNEL
export const BTC_SNAPSHOT_RUN_INTERVAL_SECONDS = Math.max(1, Number.parseInt(process.env.KBN_BTC_SNAPSHOT_RUN_INTERVAL_SECONDS || '300', 10) || 300)
export const BTC_SNAPSHOT_FORCE_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.KBN_BTC_SNAPSHOT_FORCE_ENABLED || 'true').trim().toLowerCase())
export const BTC_SNAPSHOT_FORCE_INTERVAL_SECONDS = Math.max(60, Number.parseInt(process.env.KBN_BTC_SNAPSHOT_FORCE_INTERVAL_SECONDS || '3600', 10) || 3600)
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

export const buildBucketPrice = (price: number, step = BTC_SNAPSHOT_STEP) => Math.floor(price / step) * step
export const buildDirection = (previousBucket: number, nextBucket: number) => (nextBucket > previousBucket ? 'up' : 'down') as 'up' | 'down'
export const buildSnapshotMessage = (symbol: string, bucketPrice: number, direction: 'up' | 'down' | 'flat') => {
  const emoji = direction === 'up' ? '🟢' : direction === 'down' ? '🔴' : '⚪'
  return `${emoji} ${symbol} $${bucketPrice.toLocaleString('en-US')}`
}

export const buildForcedSnapshotMessage = (symbol: string, observedPrice: number) => {
  const displayPrice = Math.round(observedPrice)
  return `${symbol} $${displayPrice.toLocaleString('en-US')}`
}
export const buildSnapshotArticleUrl = (bucketPrice: number, direction: 'up' | 'down', observedPrice?: number) => {
  const url = new URL(BTC_SNAPSHOT_ARTICLE_BASE_URL)
  url.searchParams.set('snapshot', String(bucketPrice))
  url.searchParams.set('dir', direction)
  if (Number.isFinite(observedPrice)) {
    url.searchParams.set('observed', String(observedPrice))
  }
  return String(url)
}
export const buildSnapshotDedupeKey = (symbol: string, bucketPrice: number, direction: 'up' | 'down') => `btc_snapshot:${symbol}:${direction}:${bucketPrice}`
export const buildForcedSnapshotWindow = (observedAtIso: string, intervalSeconds = BTC_SNAPSHOT_FORCE_INTERVAL_SECONDS) => {
  const epochSeconds = Math.floor(new Date(observedAtIso).getTime() / 1000)
  return Math.floor(epochSeconds / intervalSeconds)
}
export const buildForcedSnapshotDedupeKey = (symbol: string, bucketPrice: number, windowKey: number) => `btc_snapshot_hourly:${symbol}:${bucketPrice}:${windowKey}`
export const buildForcedSnapshotArticleUrl = (bucketPrice: number, windowKey: number, observedPrice?: number) => {
  const url = new URL(BTC_SNAPSHOT_ARTICLE_BASE_URL)
  url.searchParams.set('snapshot', String(bucketPrice))
  url.searchParams.set('type', 'hourly')
  url.searchParams.set('window', String(windowKey))
  if (Number.isFinite(observedPrice)) {
    url.searchParams.set('observed', String(observedPrice))
  }
  return String(url)
}

export const getBtcSnapshotConfig = () => ({
  enabled: BTC_SNAPSHOT_ENABLED,
  symbol: BTC_SNAPSHOT_SYMBOL,
  provider: BTC_SNAPSHOT_PROVIDER,
  providerSymbol: BTC_SNAPSHOT_PROVIDER_SYMBOL,
  step: BTC_SNAPSHOT_STEP,
  targetChannel: BTC_SNAPSHOT_TARGET_CHANNEL,
  runIntervalSeconds: BTC_SNAPSHOT_RUN_INTERVAL_SECONDS,
  forceEnabled: BTC_SNAPSHOT_FORCE_ENABLED,
  forceIntervalSeconds: BTC_SNAPSHOT_FORCE_INTERVAL_SECONDS,
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

const fingerprintPostText = (text: string) => createHash('sha256').update(String(text || '')).digest('hex').slice(0, 16)

export const recordBtcSnapshotBaseline = async (client: any, args: { bucketPrice: number; observedPrice: number; fetchedAt?: string | null }) => {
  const dedupeKey = `btc_snapshot_baseline:${BTC_SNAPSHOT_SYMBOL}:${args.bucketPrice}`
  const articleUrl = `${BTC_SNAPSHOT_ARTICLE_BASE_URL}?snapshot=${args.bucketPrice}&baseline=1`
  const postText = buildSnapshotMessage(BTC_SNAPSHOT_SYMBOL, args.bucketPrice, 'flat')

  const { data: existing } = await client
    .from('channel_posts')
    .select('id,status,created_at,dedupe_key')
    .eq('dedupe_key', dedupeKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    return { recorded: false, dedupeKey, existingId: Number(existing.id) }
  }

  await insertChannelPostSafe(client, {
    status: 'skipped',
    lane: BTC_SNAPSHOT_LANE,
    article_id: null,
    source_name: BTC_SNAPSHOT_SOURCE_NAME,
    headline: `${BTC_SNAPSHOT_SYMBOL} baseline $${args.bucketPrice.toLocaleString('en-US')}`,
    headline_ko: `${BTC_SNAPSHOT_SYMBOL} baseline $${args.bucketPrice.toLocaleString('en-US')}`,
    article_url: articleUrl,
    tags: [BTC_SNAPSHOT_SYMBOL, 'MarketSnapshot', 'Baseline'],
    post_text: postText,
    target_channel: BTC_SNAPSHOT_TARGET_CHANNEL,
    target_admin: '@master_billybot',
    dedupe_key: dedupeKey,
    approved_by: 'auto',
    reason: CHANNEL_POST_REASONS.SKIPPED_BTC_SNAPSHOT_NO_BASELINE,
  })

  return { recorded: true, dedupeKey }
}

export const queueBtcSnapshotPost = async (client: any, args: { bucketPrice: number; direction: 'up' | 'down'; observedPrice: number; fetchedAt?: string | null }) => {
  const dedupeKey = buildSnapshotDedupeKey(BTC_SNAPSHOT_SYMBOL, args.bucketPrice, args.direction)
  const articleUrl = buildSnapshotArticleUrl(args.bucketPrice, args.direction, args.observedPrice)
  const postText = buildSnapshotMessage(BTC_SNAPSHOT_SYMBOL, args.bucketPrice, args.direction)
  const headline = postText

  const { data: existing } = await client
    .from('channel_posts')
    .select('id,status,created_at,dedupe_key,post_text')
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
    }
  }

  await insertChannelPostSafe(client, {
    status: 'pending',
    lane: BTC_SNAPSHOT_LANE,
    article_id: null,
    source_name: BTC_SNAPSHOT_SOURCE_NAME,
    headline,
    headline_ko: headline,
    article_url: articleUrl,
    tags: [BTC_SNAPSHOT_SYMBOL, 'MarketSnapshot'],
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
    postFingerprint: fingerprintPostText(postText),
  }
}

export const queueForcedBtcSnapshotPost = async (client: any, args: { bucketPrice: number; observedPrice: number; fetchedAt: string; direction: 'up' | 'down' | 'flat' }) => {
  const windowKey = buildForcedSnapshotWindow(args.fetchedAt)
  const dedupeKey = buildForcedSnapshotDedupeKey(BTC_SNAPSHOT_SYMBOL, args.bucketPrice, windowKey)
  const articleUrl = buildForcedSnapshotArticleUrl(args.bucketPrice, windowKey, args.observedPrice)
  const postText = buildForcedSnapshotMessage(BTC_SNAPSHOT_SYMBOL, args.observedPrice)
  const headline = postText

  const { data: existing } = await client
    .from('channel_posts')
    .select('id,status,created_at,dedupe_key,post_text')
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
    headline,
    headline_ko: headline,
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
    postFingerprint: fingerprintPostText(postText),
    windowKey,
  }
}
