import { TELEGRAM_BREAKING_CHANNEL, insertChannelPostSafe } from '@/lib/channelPosting'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import {
  ALT_SNAPSHOT_ASSETS,
  buildAltSnapshotMessage,
  parseCoinbaseSpotPrice,
  parseObservedSnapshotPrice,
  type AltSnapshotAsset,
  type PriceDirection,
} from '@/lib/altSnapshotConfig'

export const ALT_SNAPSHOT_LANE = 'market_snapshot'
export const ALT_SNAPSHOT_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.KBN_ALT_SNAPSHOT_ENABLED || 'true').trim().toLowerCase(),
)
export const ALT_SNAPSHOT_TARGET_CHANNEL =
  String(process.env.KBN_ALT_SNAPSHOT_TARGET_CHANNEL || TELEGRAM_BREAKING_CHANNEL).trim() || TELEGRAM_BREAKING_CHANNEL

export const buildHourlyAltSnapshotWindow = (observedAtIso: string) => {
  const d = new Date(observedAtIso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCHours()).padStart(2, '0')}`
}

export const buildHourlyAltSnapshotDedupeKey = (symbol: string, windowKey: string) =>
  `alt_snapshot_hourly:${symbol}:${windowKey}`

export const getAltSnapshotConfig = () => ({
  enabled: ALT_SNAPSHOT_ENABLED,
  targetChannel: ALT_SNAPSHOT_TARGET_CHANNEL,
  provider: 'coinbase_spot',
  assets: ALT_SNAPSHOT_ASSETS.map(({ symbol, providerSymbol }) => ({ symbol, providerSymbol })),
})

export const fetchAltSnapshotPrice = async (asset: AltSnapshotAsset) => {
  const response = await fetch(asset.sourceUrl, {
    method: 'GET',
    headers: { 'user-agent': 'bcnews-alt-snapshot/1.0' },
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({} as any))
  const price = parseCoinbaseSpotPrice(payload)

  if (!response.ok || !Number.isFinite(price) || price <= 0) {
    throw new Error(`alt_snapshot_price_fetch_failed:${asset.symbol}:${payload?.msg || response.statusText}`)
  }

  return {
    symbol: asset.symbol,
    price,
    fetchedAt: new Date().toISOString(),
    sourceUrl: asset.sourceUrl,
  }
}

export const getPreviousAltSnapshotPrice = async (client: any, symbol: string) => {
  const { data: latestPostedHourly, error } = await client
    .from('channel_posts')
    .select('article_url')
    .eq('lane', ALT_SNAPSHOT_LANE)
    .eq('status', 'posted')
    .like('dedupe_key', `alt_snapshot_hourly:${symbol}:%`)
    .order('posted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  if (!latestPostedHourly) return null
  return parseObservedSnapshotPrice(String(latestPostedHourly.article_url || ''))
}

export const queueHourlyAltSnapshotPost = async (
  client: any,
  asset: AltSnapshotAsset,
  args: { observedPrice: number; fetchedAt: string; direction: PriceDirection },
) => {
  const windowKey = buildHourlyAltSnapshotWindow(args.fetchedAt)
  const dedupeKey = buildHourlyAltSnapshotDedupeKey(asset.symbol, windowKey)
  const articleUrl = new URL(asset.articleBaseUrl)
  articleUrl.searchParams.set('type', 'hourly')
  articleUrl.searchParams.set('window', windowKey)
  articleUrl.searchParams.set('observed', String(args.observedPrice))
  const postText = buildAltSnapshotMessage(asset.symbol, args.observedPrice, args.direction)

  const { data: existing, error } = await client
    .from('channel_posts')
    .select('id,status,created_at,dedupe_key')
    .eq('dedupe_key', dedupeKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  if (existing?.id) {
    return {
      queued: false,
      reason: CHANNEL_POST_REASONS.SKIPPED_DUPLICATE,
      dedupeKey,
      postText,
      existingId: Number(existing.id),
    }
  }

  await insertChannelPostSafe(client, {
    status: 'pending',
    lane: ALT_SNAPSHOT_LANE,
    article_id: null,
    source_name: 'Coinbase',
    headline: postText,
    headline_ko: postText,
    article_url: String(articleUrl),
    tags: [asset.symbol, 'MarketSnapshot', 'HourlyUpdate'],
    post_text: postText,
    target_channel: ALT_SNAPSHOT_TARGET_CHANNEL,
    target_admin: '@master_billybot',
    dedupe_key: dedupeKey,
    approved_by: 'auto',
    reason: CHANNEL_POST_REASONS.QUEUED_WORKER,
  })

  return {
    queued: true,
    reason: CHANNEL_POST_REASONS.QUEUED_WORKER,
    dedupeKey,
    postText,
  }
}
