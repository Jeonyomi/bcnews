import { ATH_ETH_INDEX_BASELINE, getAthEthIndexSignal } from '@/lib/athEthIndexConfig'
import { ATH_BTC_INDEX_BASELINE } from '@/lib/athBtcIndexConfig'

export type AthAltIndexSymbol = 'ENA' | 'ZEC'

// Official 1m closes match the ETH baseline minute, not an exact synchronized tick.
export const ATH_ALT_INDEX_BASELINES = {
  ENA: {
    observedAt: ATH_ETH_INDEX_BASELINE.observedAt,
    athKrw: ATH_ETH_INDEX_BASELINE.athKrw,
    quoteKrw: 200,
    baseRatio: ATH_ETH_INDEX_BASELINE.athKrw / 200,
    priceConvention: 'same-minute-close/native-KRW',
    source: {
      provider: 'Upbit',
      market: 'KRW-ENA',
      interval: '1m',
      candleOpenAt: '2026-08-26T07:09:00Z',
      url: 'https://api.upbit.com/v1/candles/minutes/1?market=KRW-ENA&to=2026-08-26T07:10:00Z&count=1',
      sha256: '83ede821056f01562084bba06c3121fbec3cb3f0e53574f84ec264ed69e08c89',
    },
  },
  ZEC: {
    observedAt: ATH_ETH_INDEX_BASELINE.observedAt,
    athKrw: ATH_ETH_INDEX_BASELINE.athKrw,
    observedZecBtc: 0.01000210,
    baseRatio: (ATH_BTC_INDEX_BASELINE.athKrw / ATH_BTC_INDEX_BASELINE.btcKrw) / 0.01000210,
    priceConvention: 'same-minute-close/cross-BTC',
    source: {
      provider: 'Binance',
      market: 'ZECBTC',
      interval: '1m',
      candleOpenAt: '2026-08-26T07:09:00Z',
      openTime: 1787728140000,
      closeTime: 1787728199999,
      url: 'https://api.binance.com/api/v3/klines?symbol=ZECBTC&interval=1m&startTime=1787728140000&endTime=1787728199999&limit=1',
      sha256: '44a9ca175c2caadd4244083059cf14bdb269976ecfa8bdb41e9e7efdbb980f7b',
    },
  },
} as const

export const calculateAthAltIndex = (symbol: AthAltIndexSymbol, athPrice: number, quotePrice: number) => {
  if (symbol !== 'ENA' && symbol !== 'ZEC') throw new Error('invalid_ath_alt_index_symbol')
  if (!Number.isFinite(athPrice) || athPrice <= 0 || !Number.isFinite(quotePrice) || quotePrice <= 0) {
    throw new Error('invalid_ath_alt_index_price')
  }
  const index = Math.round(((athPrice / quotePrice) / ATH_ALT_INDEX_BASELINES[symbol].baseRatio) * 1_000) / 10
  if (!Number.isFinite(index) || index <= 0) throw new Error('invalid_ath_alt_index')
  return index
}

export const getAthAltIndexSignal = (index: number) => {
  if (!Number.isFinite(index) || index <= 0) throw new Error('invalid_ath_alt_index')
  return getAthEthIndexSignal(index)
}

const escapeDecimal = (value: string) => value.replace(/\./g, '\\.')

export const buildAthAltIndexMessage = (
  symbol: AthAltIndexSymbol,
  args: { athPrice: number; quotePrice: number; index: number },
) => {
  calculateAthAltIndex(symbol, args.athPrice, args.quotePrice)
  const signal = getAthAltIndexSignal(args.index)
  const index = escapeDecimal(args.index.toFixed(1))
  const athPrice = escapeDecimal(args.athPrice.toLocaleString('en-US', { maximumFractionDigits: 8 }))
  const quotePrice = escapeDecimal(args.quotePrice.toLocaleString('en-US', { maximumFractionDigits: symbol === 'ENA' ? 6 : 2 }))
  const baselineDate = ATH_ALT_INDEX_BASELINES[symbol].observedAt.slice(0, 10).replaceAll('-', '\\-')

  return [
    `📊 *ATH/${symbol} 상대강도 지수 ${index}*`,
    `${signal.emoji} ${signal.label}`,
    `ATH $${athPrice} · ${symbol} $${quotePrice}`,
    ...(symbol === 'ZEC' ? ['기준 ZEC: BTC 교차환산'] : []),
    `기준 ${baselineDate} \\= 100 · 전환 107 / 119 / 131 · 위험 90`,
  ].join('\n')
}
