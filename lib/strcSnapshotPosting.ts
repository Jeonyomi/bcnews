import { TELEGRAM_BREAKING_CHANNEL, insertChannelPostSafe } from '@/lib/channelPosting'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'

export const STRC_SNAPSHOT_LANE = 'market_snapshot'
export const STRC_SNAPSHOT_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.KBN_STRC_SNAPSHOT_ENABLED || 'true').trim().toLowerCase())
export const STRC_SNAPSHOT_SYMBOL = String(process.env.KBN_STRC_SNAPSHOT_SYMBOL || 'STRC').trim().toUpperCase() || 'STRC'
export const STRC_SNAPSHOT_PROVIDER = String(process.env.KBN_STRC_SNAPSHOT_PROVIDER || 'yahoo_chart').trim().toLowerCase() || 'yahoo_chart'
export const STRC_SNAPSHOT_PROVIDER_SYMBOL = String(process.env.KBN_STRC_SNAPSHOT_PROVIDER_SYMBOL || 'STRC').trim().toUpperCase() || 'STRC'
export const STRC_SNAPSHOT_TARGET_CHANNEL = String(process.env.KBN_STRC_SNAPSHOT_TARGET_CHANNEL || TELEGRAM_BREAKING_CHANNEL).trim() || TELEGRAM_BREAKING_CHANNEL
export const STRC_SNAPSHOT_RUN_INTERVAL_SECONDS = Math.max(1, Number.parseInt(process.env.KBN_STRC_SNAPSHOT_RUN_INTERVAL_SECONDS || '300', 10) || 300)
export const STRC_SNAPSHOT_POST_MINUTE = Number.parseInt(process.env.KBN_STRC_SNAPSHOT_POST_MINUTE || '0', 10)
export const STRC_SNAPSHOT_SOURCE_URL = String(process.env.KBN_STRC_SNAPSHOT_SOURCE_URL || 'https://query1.finance.yahoo.com/v8/finance/chart/STRC').trim()

const PROVIDER_META: Record<string, { sourceName: string; articleBaseUrl: string }> = {
  yahoo_chart: {
    sourceName: 'Yahoo Finance',
    articleBaseUrl: 'https://finance.yahoo.com/quote/STRC',
  },
}

export const STRC_SNAPSHOT_SOURCE_NAME = PROVIDER_META[STRC_SNAPSHOT_PROVIDER]?.sourceName || 'Market Data'
export const STRC_SNAPSHOT_ARTICLE_BASE_URL = PROVIDER_META[STRC_SNAPSHOT_PROVIDER]?.articleBaseUrl || 'https://finance.yahoo.com/quote/STRC'

export const buildHourlySnapshotWindow = (observedAtIso: string) => {
  const d = new Date(observedAtIso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCHours()).padStart(2, '0')}`
}

export const buildHourlySnapshotDedupeKey = (symbol: string, windowKey: string) => `strc_snapshot_hourly:${symbol}:${windowKey}`

export const buildHourlySnapshotMessage = (symbol: string, observedPrice: number, direction: 'up' | 'down' | 'flat') => {
  const displayPrice = observedPrice >= 10 ? observedPrice.toFixed(2) : observedPrice.toFixed(3)
  const normalized = displayPrice.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
  const emoji = direction === 'up' ? '🟢' : direction === 'down' ? '🔴' : '⚪'
  return `${emoji} ${symbol} $${normalized}`
}

export const buildHourlySnapshotArticleUrl = (observedPrice: number, windowKey: string) => {
  const url = new URL(STRC_SNAPSHOT_ARTICLE_BASE_URL)
  url.searchParams.set('type', 'hourly')
  url.searchParams.set('window', windowKey)
  url.searchParams.set('observed', String(observedPrice))
  return String(url)
}

export const getStrcSnapshotConfig = () => ({
  enabled: STRC_SNAPSHOT_ENABLED,
  symbol: STRC_SNAPSHOT_SYMBOL,
  provider: STRC_SNAPSHOT_PROVIDER,
  providerSymbol: STRC_SNAPSHOT_PROVIDER_SYMBOL,
  targetChannel: STRC_SNAPSHOT_TARGET_CHANNEL,
  runIntervalSeconds: STRC_SNAPSHOT_RUN_INTERVAL_SECONDS,
  postMinute: STRC_SNAPSHOT_POST_MINUTE,
  sourceUrl: STRC_SNAPSHOT_SOURCE_URL,
})

export const fetchStrcSnapshotPrice = async () => {
  const url = new URL(STRC_SNAPSHOT_SOURCE_URL)
  if (STRC_SNAPSHOT_PROVIDER === 'yahoo_chart') {
    if (!url.searchParams.get('interval')) url.searchParams.set('interval', '1d')
    if (!url.searchParams.get('range')) url.searchParams.set('range', '1d')
    if (!url.searchParams.get('includePrePost')) url.searchParams.set('includePrePost', 'true')
  }

  const response = await fetch(String(url), {
    method: 'GET',
    headers: { 'user-agent': 'bcnews-strc-snapshot/1.0' },
    cache: 'no-store',
  })

  const payload = await response.json().catch(() => ({} as any))

  let priceRaw: unknown = null
  if (STRC_SNAPSHOT_PROVIDER === 'yahoo_chart') {
    const result = payload?.chart?.result?.[0]
    priceRaw = result?.meta?.regularMarketPrice ?? result?.meta?.previousClose ?? null
  } else {
    throw new Error(`unsupported_strc_snapshot_provider:${STRC_SNAPSHOT_PROVIDER}`)
  }

  if (!response.ok || priceRaw == null) {
    throw new Error(`strc_snapshot_price_fetch_failed:${payload?.chart?.error?.description || payload?.error || response.statusText}`)
  }

  const price = Number(priceRaw)
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('strc_snapshot_invalid_price')
  }

  return {
    price,
    fetchedAt: new Date().toISOString(),
    raw: payload,
    sourceUrl: String(url),
  }
}

export const queueHourlyStrcSnapshotPost = async (client: any, args: { observedPrice: number; fetchedAt: string; direction: 'up' | 'down' | 'flat' }) => {
  const windowKey = buildHourlySnapshotWindow(args.fetchedAt)
  const dedupeKey = buildHourlySnapshotDedupeKey(STRC_SNAPSHOT_SYMBOL, windowKey)
  const articleUrl = buildHourlySnapshotArticleUrl(args.observedPrice, windowKey)
  const postText = buildHourlySnapshotMessage(STRC_SNAPSHOT_SYMBOL, args.observedPrice, args.direction)

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
    lane: STRC_SNAPSHOT_LANE,
    article_id: null,
    source_name: STRC_SNAPSHOT_SOURCE_NAME,
    headline: postText,
    headline_ko: postText,
    article_url: articleUrl,
    tags: [STRC_SNAPSHOT_SYMBOL, 'MarketSnapshot', 'HourlyUpdate'],
    post_text: postText,
    target_channel: STRC_SNAPSHOT_TARGET_CHANNEL,
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
