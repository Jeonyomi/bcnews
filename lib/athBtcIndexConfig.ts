import { ATH_ETH_INDEX_BASELINE, getAthEthIndexSignal } from '@/lib/athEthIndexConfig'

// Recovered the SAME minute close as the ETH baseline, not an exact synchronized tick.
// Official Upbit 1m candle (KST 2026-08-26 16:09), trade_price = 109825000:
// https://api.upbit.com/v1/candles/minutes/1?market=KRW-BTC&to=2026-08-26T07%3A10%3A00Z&count=1
// Evidence SHA256: 79681806d8c07e06584ff517f67a538aa7686bb567c4ca574be0d7f4f0cd2464
export const ATH_BTC_INDEX_BASELINE = {
  observedAt: ATH_ETH_INDEX_BASELINE.observedAt,
  athKrw: ATH_ETH_INDEX_BASELINE.athKrw,
  btcKrw: 109_825_000,
} as const

const ATH_BTC_BASE_RATIO = ATH_BTC_INDEX_BASELINE.athKrw / ATH_BTC_INDEX_BASELINE.btcKrw

export const calculateAthBtcIndex = (athPrice: number, btcPrice: number) => {
  if (!Number.isFinite(athPrice) || athPrice <= 0 || !Number.isFinite(btcPrice) || btcPrice <= 0) {
    throw new Error('invalid_ath_btc_index_price')
  }

  const index = Math.round(((athPrice / btcPrice) / ATH_BTC_BASE_RATIO) * 1_000) / 10
  if (!Number.isFinite(index) || index <= 0) throw new Error('invalid_ath_btc_index')
  return index
}

export const getAthBtcIndexSignal = (index: number) => {
  if (!Number.isFinite(index) || index <= 0) throw new Error('invalid_ath_btc_index')
  return getAthEthIndexSignal(index)
}

const escapeDecimal = (value: string) => value.replace(/\./g, '\\.')

export const buildAthBtcIndexMessage = (args: { athPrice: number; btcPrice: number; index: number }) => {
  calculateAthBtcIndex(args.athPrice, args.btcPrice)
  const signal = getAthBtcIndexSignal(args.index)
  const index = escapeDecimal(args.index.toFixed(1))
  const athPrice = escapeDecimal(args.athPrice.toLocaleString('en-US', { maximumFractionDigits: 8 }))
  const btcPrice = Math.round(args.btcPrice).toLocaleString('en-US')
  const baselineDate = ATH_BTC_INDEX_BASELINE.observedAt.slice(0, 10).replaceAll('-', '\\-')

  return [
    `📊 *ATH/BTC 상대강도 지수 ${index}*`,
    `${signal.emoji} ${signal.label}`,
    `ATH $${athPrice} · BTC $${btcPrice}`,
    `기준 ${baselineDate} \\= 100 · 전환 107 / 119 / 131 · 위험 90`,
  ].join('\n')
}
