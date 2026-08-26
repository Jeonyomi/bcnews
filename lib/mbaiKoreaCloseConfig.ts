import type { CoinbaseDailyPoint, YahooDailyPoint } from './mbaiBridgeAmConfig'

export type NaverMarketPoint = {
  symbol: string
  value: number
  change: number
  changePercent: number
  asOfDate: string
}

export type KoreaCloseSnapshot = {
  dateKey: string
  kospi: NaverMarketPoint
  kosdaq: NaverMarketPoint
  usdKrw: NaverMarketPoint
  sp500Futures: YahooDailyPoint
  nasdaqFutures: YahooDailyPoint
  btc: CoinbaseDailyPoint
  eth: CoinbaseDailyPoint
}

const parseNumber = (value: unknown) => Number(String(value ?? '').replace(/,/g, '').trim())
const escapeMarkdownV2 = (value: string) => value.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1')
const formatNumber = (value: number, decimals: number) => value.toLocaleString('en-US', {
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
})
const formatSigned = (value: number, decimals = 2) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(decimals)}`
const directionEmoji = (value: number) => value > 0 ? '🟢' : value < 0 ? '🟠' : '⚪'

export const parseNaverMarketPoint = (
  payload: any,
  symbol: string,
  requireClosed = true,
): NaverMarketPoint => {
  if (requireClosed && payload?.marketStatus !== 'CLOSE') {
    throw new Error(`naver_market_not_closed:${symbol}`)
  }
  const value = parseNumber(payload?.closePrice)
  const change = parseNumber(payload?.compareToPreviousClosePrice ?? payload?.fluctuations)
  const changePercent = parseNumber(payload?.fluctuationsRatio)
  const tradedAt = String(payload?.localTradedAt || '')
  const asOfDate = tradedAt.slice(0, 10)
  if (
    !Number.isFinite(value) || value <= 0 ||
    !Number.isFinite(change) || !Number.isFinite(changePercent) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)
  ) {
    throw new Error(`invalid_naver_market_point:${symbol}`)
  }
  return { symbol, value, change, changePercent, asOfDate }
}

export const buildKoreaCloseDedupeKey = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('invalid_korea_close_date_key')
  return `mbai_korea_close:${dateKey}`
}

export const buildKoreaCloseInterpretation = (snapshot: KoreaCloseSnapshot) => {
  const relativeKosdaq = snapshot.kosdaq.changePercent - snapshot.kospi.changePercent
  const crossRisk = (
    snapshot.sp500Futures.changePercent + snapshot.nasdaqFutures.changePercent +
    snapshot.btc.changePercent + snapshot.eth.changePercent
  ) / 4
  return [
    snapshot.kospi.changePercent >= 0.3 ? '한국 대형주는 강세' : snapshot.kospi.changePercent <= -0.3 ? '한국 대형주는 약세' : '한국 대형주는 혼조권',
    relativeKosdaq >= 0.5 ? '코스닥은 상대 강세' : relativeKosdaq <= -0.5 ? '코스닥은 상대 약세' : '코스닥은 대형주와 동행',
    snapshot.usdKrw.changePercent >= 0.05 ? '원화 약세는 외국인 수급에 부담' : snapshot.usdKrw.changePercent <= -0.05 ? '원화 강세는 외국인 수급에 우호적' : '원화는 제한적 움직임',
    crossRisk >= 0.2 ? '미국 선물과 크립토는 위험선호 신호' : crossRisk <= -0.2 ? '미국 선물과 크립토는 위험회피 신호' : '미국 선물과 크립토는 중립 신호',
  ].join(' · ')
}

export const buildKoreaCloseMessage = (snapshot: KoreaCloseSnapshot) => [
  `🇰🇷 *KOREA CLOSE \\| ${escapeMarkdownV2(snapshot.dateKey)}*`,
  '',
  '📊 *한국 증시 마감*',
  `KOSPI ${escapeMarkdownV2(formatNumber(snapshot.kospi.value, 2))} ${directionEmoji(snapshot.kospi.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.kospi.changePercent))}%`,
  `KOSDAQ ${escapeMarkdownV2(formatNumber(snapshot.kosdaq.value, 2))} ${directionEmoji(snapshot.kosdaq.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.kosdaq.changePercent))}%`,
  `USD/KRW ${escapeMarkdownV2(formatNumber(snapshot.usdKrw.value, 2))} ${snapshot.usdKrw.changePercent > 0 ? '🔴' : snapshot.usdKrw.changePercent < 0 ? '🟢' : '⚪'} ${escapeMarkdownV2(formatSigned(snapshot.usdKrw.changePercent))}%`,
  '',
  '🌙 *다음 시장 신호*',
  `S&P 500 선물 ${escapeMarkdownV2(formatNumber(snapshot.sp500Futures.value, 2))} ${directionEmoji(snapshot.sp500Futures.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.sp500Futures.changePercent))}%`,
  `NASDAQ 100 선물 ${escapeMarkdownV2(formatNumber(snapshot.nasdaqFutures.value, 2))} ${directionEmoji(snapshot.nasdaqFutures.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.nasdaqFutures.changePercent))}%`,
  `BTC $${escapeMarkdownV2(formatNumber(snapshot.btc.value, 0))} ${directionEmoji(snapshot.btc.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.btc.changePercent))}%`,
  `ETH $${escapeMarkdownV2(formatNumber(snapshot.eth.value, 0))} ${directionEmoji(snapshot.eth.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.eth.changePercent))}%`,
  '',
  '🧭 *오늘의 브리지*',
  buildKoreaCloseInterpretation(snapshot),
  '',
  '출처: 네이버 금융 · Yahoo Finance · Coinbase',
].join('\n')
