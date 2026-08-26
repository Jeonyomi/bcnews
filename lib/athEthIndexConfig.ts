export const ATH_ETH_INDEX_BASELINE = {
  observedAt: '2026-08-26T16:09:00+09:00',
  athKrw: 6.91,
  ethKrw: 3_426_000,
} as const

const ATH_ETH_BASE_RATIO = ATH_ETH_INDEX_BASELINE.athKrw / ATH_ETH_INDEX_BASELINE.ethKrw

export const calculateAthEthIndex = (athPrice: number, ethPrice: number) => {
  if (!Number.isFinite(athPrice) || athPrice <= 0 || !Number.isFinite(ethPrice) || ethPrice <= 0) {
    throw new Error('invalid_ath_eth_index_price')
  }

  return Math.round(((athPrice / ethPrice) / ATH_ETH_BASE_RATIO) * 1_000) / 10
}

export const getAthEthIndexSignal = (index: number) => {
  if (!Number.isFinite(index) || index <= 0) throw new Error('invalid_ath_eth_index')
  if (index >= 131) return { emoji: '🚀', label: '3차 전환선 도달' }
  if (index >= 119) return { emoji: '🟢', label: '2차 전환선 도달' }
  if (index >= 107) return { emoji: '🟢', label: '1차 전환선 도달' }
  if (index < 90) return { emoji: '🔴', label: '위험선 하회' }
  if (index === 90) return { emoji: '🔴', label: '위험선 도달' }
  return { emoji: '⚪', label: '대기 구간' }
}

const escapeDecimal = (value: string) => value.replace(/\./g, '\\.')

export const buildAthEthIndexMessage = (args: { athPrice: number; ethPrice: number; index: number }) => {
  const signal = getAthEthIndexSignal(args.index)
  const index = escapeDecimal(args.index.toFixed(1))
  const athPrice = escapeDecimal(args.athPrice.toLocaleString('en-US', { maximumFractionDigits: 8 }))
  const ethPrice = Math.round(args.ethPrice).toLocaleString('en-US')
  const baselineDate = ATH_ETH_INDEX_BASELINE.observedAt.slice(0, 10).replaceAll('-', '\\-')

  return [
    `📊 *ATH/ETH 상대강도 지수 ${index}*`,
    `${signal.emoji} ${signal.label}`,
    `ATH $${athPrice} · ETH $${ethPrice}`,
    `기준 ${baselineDate} \\= 100 · 전환 107 / 119 / 131 · 위험 90`,
  ].join('\n')
}
