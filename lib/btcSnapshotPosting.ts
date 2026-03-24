import { createHash } from 'crypto'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import { TELEGRAM_BREAKING_CHANNEL, insertChannelPostSafe } from '@/lib/channelPosting'

export const BTC_SNAPSHOT_LANE = 'market_snapshot'
export const BTC_SNAPSHOT_SOURCE_NAME = 'Binance'
export const BTC_SNAPSHOT_ARTICLE_BASE_URL = 'https://www.binance.com/en/futures/BTCUSDT'

export const BTC_SNAPSHOT_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.KBN_BTC_SNAPSHOT_ENABLED || '').trim().toLowerCase())
export const BTC_SNAPSHOT_SYMBOL = String(process.env.KBN_BTC_SNAPSHOT_SYMBOL || 'BTC').trim().toUpperCase() || 'BTC'
export const BTC_SNAPSHOT_PROVIDER = String(process.env.KBN_BTC_SNAPSHOT_PROVIDER || 'binance_perp').trim().toLowerCase() || 'binance_perp'
export const BTC_SNAPSHOT_PROVIDER_SYMBOL = String(process.env.KBN_BTC_SNAPSHOT_PROVIDER_SYMBOL || 'BTCUSDT').trim().toUpperCase() || 'BTCUSDT'
export const BTC_SNAPSHOT_STEP = Math.max(1, Number.parseInt(process.env.KBN_BTC_SNAPSHOT_STEP || '1000', 10) || 1000)
export const BTC_SNAPSHOT_TARGET_CHANNEL = String(process.env.KBN_BTC_SNAPSHOT_TARGET_CHANNEL || TELEGRAM_BREAKING_CHANNEL).trim() || TELEGRAM_BREAKING_CHANNEL
export const BTC_SNAPSHOT_RUN_INTERVAL_SECONDS = Math.max(1, Number.parseInt(process.env.KBN_BTC_SNAPSHOT_RUN_INTERVAL_SECONDS || '300', 10) || 300)
export const BTC_SNAPSHOT_SOURCE_URL = String(process.env.KBN_BTC_SNAPSHOT_SOURCE_URL || 'https://fapi.binance.com/fapi/v1/ticker/price').trim()

export const buildBucketPrice = (price: number, step = BTC_SNAPSHOT_STEP) => Math.floor(price / step) * step
export const buildDirection = (previousBucket: number, nextBucket: number) => (nextBucket > previousBucket ? 'up' : 'down') as 'up' | 'down'
export const buildSnapshotMessage = (symbol: string, bucketPrice: number, direction: 'up' | 'down') => `${direction === 'up' ? '🟢' : '🔴'} ${symbol} $${bucketPrice.toLocaleString('en-US')}`
export const buildSnapshotArticleUrl = (bucketPrice: number, direction: 'up' | 'down') => `${BTC_SNAPSHOT_ARTICLE_BASE_URL}?snapshot=${bucketPrice}&dir=${direction}`
export const buildSnapshotDedupeKey = (symbol: string, bucketPrice: number, direction: 'up' | 'down') => `btc_snapshot:${symbol}:${direction}:${bucketPrice}`

export const getBtcSnapshotConfig = () => ({
  enabled: BTC_SNAPSHOT_ENABLED,
  symbol: BTC_SNAPSHOT_SYMBOL,
  provider: BTC_SNAPSHOT_PROVIDER,
  providerSymbol: BTC_SNAPSHOT_PROVIDER_SYMBOL,
  step: BTC_SNAPSHOT_STEP,
  targetChannel: BTC_SNAPSHOT_TARGET_CHANNEL,
  runIntervalSeconds: BTC_SNAPSHOT_RUN_INTERVAL_SECONDS,
  sourceUrl: BTC_SNAPSHOT_SOURCE_URL,
})

export const fetchBtcSnapshotPrice = async () => {
  if (BTC_SNAPSHOT_PROVIDER !== 'binance_perp') throw new Error(`unsupported_btc_snapshot_provider:${BTC_SNAPSHOT_PROVIDER}`)

  const url = new URL(BTC_SNAPSHOT_SOURCE_URL)
  if (!url.searchParams.get('symbol')) {
    url.searchParams.set('symbol', BTC_SNAPSHOT_PROVIDER_SYMBOL)
  }

  const response = await fetch(String(url), {
    method: 'GET',
    headers: { 'user-agent': 'bcnews-btc-snapshot/1.0' },
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({} as any))
  if (!response.ok || payload?.price == null) {
    throw new Error(`btc_snapshot_price_fetch_failed:${payload?.msg || response.statusText}`)
  }

  const price = Number(payload.price)
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
  const postText = buildSnapshotMessage(BTC_SNAPSHOT_SYMBOL, args.bucketPrice, 'up')

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
  const articleUrl = buildSnapshotArticleUrl(args.bucketPrice, args.direction)
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
