export type YahooDailyPoint = {
  symbol: string
  previous: number
  value: number
  changePercent: number
  asOfDate: string
}

export type CoinbaseDailyPoint = {
  symbol: string
  open: number
  value: number
  changePercent: number
}

export type BridgeAmSnapshot = {
  dateKey: string
  sp500: YahooDailyPoint
  nasdaq: YahooDailyPoint
  dow: YahooDailyPoint
  treasury10y: YahooDailyPoint
  dxy: YahooDailyPoint
  usdKrw: YahooDailyPoint
  btc: CoinbaseDailyPoint
  eth: CoinbaseDailyPoint
}

const round = (value: number, decimals = 2) => {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export const calculateChangePercent = (previous: number, value: number) => {
  if (!Number.isFinite(previous) || previous <= 0 || !Number.isFinite(value) || value <= 0) {
    throw new Error('invalid_market_change_values')
  }
  return round(((value - previous) / previous) * 100)
}

export const parseYahooDailyPoint = (payload: any, symbol: string): YahooDailyPoint => {
  const result = payload?.chart?.result?.[0]
  if (!result) throw new Error(`invalid_yahoo_chart:${symbol}`)
  const closes = result?.indicators?.quote?.[0]?.close
  const timestamps = result?.timestamp
  const points = Array.isArray(closes) && Array.isArray(timestamps)
    ? closes.map((rawValue: unknown, index: number) => ({
        value: Number(rawValue),
        timestamp: Number(timestamps[index]),
      })).filter(({ value, timestamp }: { value: number; timestamp: number }) =>
        Number.isFinite(value) && value > 0 && Number.isFinite(timestamp) && timestamp > 0)
    : []
  if (points.length < 2) throw new Error(`insufficient_yahoo_closes:${symbol}`)
  const previous = points[points.length - 2].value
  const latest = points[points.length - 1]
  const asOfDate = new Date(latest.timestamp * 1000).toISOString().slice(0, 10)
  return { symbol, previous, value: latest.value, changePercent: calculateChangePercent(previous, latest.value), asOfDate }
}

export const parseCoinbaseDailyStats = (payload: any, symbol: string): CoinbaseDailyPoint => {
  const open = Number(payload?.open)
  const value = Number(payload?.last)
  if (!Number.isFinite(open) || open <= 0 || !Number.isFinite(value) || value <= 0) {
    throw new Error(`invalid_coinbase_stats:${symbol}`)
  }
  return { symbol, open, value, changePercent: calculateChangePercent(open, value) }
}

const escapeMarkdownV2 = (value: string) => value.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1')
const formatNumber = (value: number, decimals: number) => value.toLocaleString('en-US', {
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
})
const formatSigned = (value: number, decimals = 2) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(decimals)}`
const directionEmoji = (value: number) => value > 0 ? '🟢' : value < 0 ? '🟠' : '⚪'

export const buildBridgeAmDedupeKey = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('invalid_bridge_am_date_key')
  return `mbai_bridge_am:${dateKey}`
}

export const buildBridgeInterpretation = (snapshot: BridgeAmSnapshot) => {
  const usAverage = (snapshot.sp500.changePercent + snapshot.nasdaq.changePercent + snapshot.dow.changePercent) / 3
  const cryptoAverage = (snapshot.btc.changePercent + snapshot.eth.changePercent) / 2
  const rateBps = (snapshot.treasury10y.value - snapshot.treasury10y.previous) * 100
  const signals = [
    usAverage >= 0.3 ? '미국 증시는 위험선호 우위' : usAverage <= -0.3 ? '미국 증시는 위험회피 우위' : '미국 증시는 혼조권',
    rateBps <= -3 ? '금리 하락은 성장주에 우호적' : rateBps >= 3 ? '금리 상승은 성장주에 부담' : '금리는 중립 범위',
    snapshot.usdKrw.changePercent >= 0.2 ? '원화 약세는 외국인 수급 부담' : snapshot.usdKrw.changePercent <= -0.2 ? '원화 강세는 외국인 수급에 우호적' : '원화는 제한적 움직임',
    cryptoAverage >= 0.5 ? '크립토는 미국 증시 대비 강세' : cryptoAverage <= -0.5 ? '크립토는 미국 증시 대비 약세' : '크립토는 중립 흐름',
  ]
  return signals.join(' · ')
}

export const buildBridgeAmMessage = (snapshot: BridgeAmSnapshot) => {
  const rateBps = round((snapshot.treasury10y.value - snapshot.treasury10y.previous) * 100, 1)
  const lines = [
    `🌉 *BRIDGE AM \\| ${escapeMarkdownV2(snapshot.dateKey)}*`,
    '',
    `🇺🇸 *미국장 마감 · ${escapeMarkdownV2(snapshot.sp500.asOfDate)}*`,
    `S&P 500 ${escapeMarkdownV2(formatNumber(snapshot.sp500.value, 2))} ${directionEmoji(snapshot.sp500.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.sp500.changePercent))}%`,
    `NASDAQ ${escapeMarkdownV2(formatNumber(snapshot.nasdaq.value, 2))} ${directionEmoji(snapshot.nasdaq.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.nasdaq.changePercent))}%`,
    `DOW ${escapeMarkdownV2(formatNumber(snapshot.dow.value, 2))} ${directionEmoji(snapshot.dow.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.dow.changePercent))}%`,
    '',
    '🌐 *연결 지표*',
    `미 10년물 ${escapeMarkdownV2(formatNumber(snapshot.treasury10y.value, 2))}% ${rateBps < 0 ? '🔵' : rateBps > 0 ? '🔴' : '⚪'} ${escapeMarkdownV2(formatSigned(rateBps, 1))}bp`,
    `달러지수 ${escapeMarkdownV2(formatNumber(snapshot.dxy.value, 2))} ${directionEmoji(snapshot.dxy.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.dxy.changePercent))}%`,
    `USD/KRW ${escapeMarkdownV2(formatNumber(snapshot.usdKrw.value, 2))} ${snapshot.usdKrw.changePercent > 0 ? '🔴' : snapshot.usdKrw.changePercent < 0 ? '🟢' : '⚪'} ${escapeMarkdownV2(formatSigned(snapshot.usdKrw.changePercent))}%`,
    '',
    '₿ *크립토 24시간*',
    `BTC $${escapeMarkdownV2(formatNumber(snapshot.btc.value, 0))} ${directionEmoji(snapshot.btc.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.btc.changePercent))}%`,
    `ETH $${escapeMarkdownV2(formatNumber(snapshot.eth.value, 0))} ${directionEmoji(snapshot.eth.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.eth.changePercent))}%`,
    '',
    '🧭 *오늘의 브리지*',
    buildBridgeInterpretation(snapshot),
    '',
    '출처: Yahoo Finance · Coinbase',
  ]
  return lines.join('\n')
}
