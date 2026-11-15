import { buildAthAltIndexMessage, calculateAthAltIndex, type AthAltIndexSymbol } from '@/lib/athAltIndexConfig'
import { ALT_SNAPSHOT_LANE, ALT_SNAPSHOT_TARGET_CHANNEL, buildHourlyAltSnapshotWindow } from '@/lib/altSnapshotPosting'
import { insertChannelPostSafe } from '@/lib/channelPosting'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'
import { parseCoinbaseSpotPrice } from '@/lib/altSnapshotConfig'

export type AthAltIndexSnapshot = {
  symbol: AthAltIndexSymbol
  athPrice: number
  quotePrice: number
  index: number
  fetchedAt: string
}

export const fetchAthAltIndexSnapshot = async (
  symbol: AthAltIndexSymbol,
  shared: { athPrice: number; fetchedAt: string },
): Promise<AthAltIndexSnapshot> => {
  if (symbol !== 'ENA' && symbol !== 'ZEC') throw new Error('invalid_ath_alt_index_symbol')
  const response = await fetch(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`, {
    method: 'GET', headers: { 'user-agent': 'bcnews-ath-alt-index/1.0' }, cache: 'no-store',
  })
  if (!response.ok) throw new Error(`ath_alt_index_price_unavailable:${symbol}:${response.status}`)
  const payload = await response.json()
  if (payload?.data?.base !== symbol || payload?.data?.currency !== 'USD') {
    throw new Error('invalid_ath_alt_index_quote_identity')
  }
  const quotePrice = parseCoinbaseSpotPrice(payload)
  return { symbol, athPrice: shared.athPrice, quotePrice,
    index: calculateAthAltIndex(symbol, shared.athPrice, quotePrice), fetchedAt: shared.fetchedAt }
}

export const queueHourlyAthAltIndexPost = async (client: any, args: AthAltIndexSnapshot) => {
  const index = calculateAthAltIndex(args.symbol, args.athPrice, args.quotePrice)
  if (index !== args.index || !Number.isFinite(Date.parse(args.fetchedAt))) throw new Error('invalid_ath_alt_index_snapshot')
  const window = buildHourlyAltSnapshotWindow(args.fetchedAt)
  const name = args.symbol.toLowerCase()
  const dedupeKey = `ath_${name}_index_hourly:${window}`
  const article = new URL('https://www.coinbase.com/price/aethir')
  for (const [key, value] of Object.entries({ type: `ath-${name}-index`, window,
    ath: String(args.athPrice), [name]: String(args.quotePrice), index: String(index) })) article.searchParams.set(key, value)
  const postText = buildAthAltIndexMessage(args.symbol, args)
  const row = {
    status: 'pending', lane: ALT_SNAPSHOT_LANE, article_id: null, source_name: 'Coinbase',
    headline: postText, headline_ko: postText, article_url: String(article),
    tags: ['ATH', args.symbol, 'RelativeStrengthIndex', 'HourlyUpdate'], post_text: postText,
    target_channel: ALT_SNAPSHOT_TARGET_CHANNEL, target_admin: '@master_billybot',
    dedupe_key: dedupeKey, approved_by: 'auto', reason: CHANNEL_POST_REASONS.QUEUED_WORKER,
  }
  const { data: existing, error } = await client.from('channel_posts')
    .select('id,status').eq('dedupe_key', dedupeKey).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (existing?.id) {
    if (existing.status === 'failed') {
      const { data: retried, error: retryError } = await client.from('channel_posts')
        .update({ ...row, updated_at: new Date().toISOString() }).eq('id', Number(existing.id))
        .eq('status', 'failed').select('id').maybeSingle()
      if (retryError) throw retryError
      return { queued: Boolean(retried), reason: retried ? CHANNEL_POST_REASONS.QUEUED_WORKER : CHANNEL_POST_REASONS.SKIPPED_DUPLICATE,
        dedupeKey, postText, existingId: Number(existing.id) }
    }
    return { queued: false, reason: CHANNEL_POST_REASONS.SKIPPED_DUPLICATE, dedupeKey, postText, existingId: Number(existing.id) }
  }
  try { await insertChannelPostSafe(client, row) }
  catch (error: any) {
    if (error?.code !== '23505' && !String(error?.message || '').includes('duplicate key')) throw error
    return { queued: false, reason: CHANNEL_POST_REASONS.SKIPPED_DUPLICATE, dedupeKey, postText }
  }
  return { queued: true, reason: CHANNEL_POST_REASONS.QUEUED_WORKER, dedupeKey, postText }
}
