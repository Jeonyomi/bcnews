export type PriceDirection = 'up' | 'down' | 'flat'

export type AltSnapshotAsset = {
  symbol: 'HYPE' | 'ENA'
  providerSymbol: string
  sourceUrl: string
  articleBaseUrl: string
}

export const ALT_SNAPSHOT_ASSETS: readonly AltSnapshotAsset[] = [
  {
    symbol: 'HYPE',
    providerSymbol: 'HYPE-USD',
    sourceUrl: 'https://api.coinbase.com/v2/prices/HYPE-USD/spot',
    articleBaseUrl: 'https://www.coinbase.com/price/hyperliquid',
  },
  {
    symbol: 'ENA',
    providerSymbol: 'ENA-USD',
    sourceUrl: 'https://api.coinbase.com/v2/prices/ENA-USD/spot',
    articleBaseUrl: 'https://www.coinbase.com/price/ethena',
  },
]

export const getPriceDirection = (currentPrice: number, previousPrice: number | null): PriceDirection =>
  previousPrice == null
    ? 'flat'
    : currentPrice > previousPrice
      ? 'up'
      : currentPrice < previousPrice
        ? 'down'
        : 'flat'

export const parseObservedSnapshotPrice = (articleUrl: string) => {
  try {
    const raw = new URL(articleUrl).searchParams.get('observed')
    if (!raw) throw new Error('missing')
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) throw new Error('invalid')
    return value
  } catch {
    throw new Error('invalid_previous_snapshot_price')
  }
}

export const isRetiredSnapshotDedupeKey = (dedupeKey: string | null | undefined) =>
  String(dedupeKey || '').startsWith('strc_snapshot_hourly:')

export const parseCoinbaseSpotPrice = (payload: any) => {
  const value = Number(payload?.data?.amount)
  if (!Number.isFinite(value) || value <= 0) throw new Error('invalid_coinbase_spot_price')
  return value
}

const formatSnapshotPrice = (price: number) => {
  const maximumFractionDigits = price >= 100 ? 0 : price >= 1 ? 2 : 4
  return price.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })
}

export const buildAltSnapshotMessage = (symbol: string, observedPrice: number, direction: PriceDirection) => {
  const emoji = direction === 'up' ? '🟢' : direction === 'down' ? '🔴' : '⚪'
  const escapedPrice = formatSnapshotPrice(observedPrice).replace(/\./g, '\\.')
  return `${emoji} ${symbol} $${escapedPrice}`
}
