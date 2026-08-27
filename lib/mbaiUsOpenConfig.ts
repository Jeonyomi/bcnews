import type { CoinbaseDailyPoint, YahooDailyPoint } from './mbaiBridgeAmConfig'
import type { NaverMarketPoint } from './mbaiKoreaCloseConfig'

const dateKey = (date: Date) => date.toISOString().slice(0, 10)
const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day))

const observedFixedHoliday = (year: number, month: number, day: number) => {
  const date = utcDate(year, month, day)
  const weekday = date.getUTCDay()
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1)
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1)
  return dateKey(date)
}

const nthWeekday = (year: number, month: number, weekday: number, nth: number) => {
  const date = utcDate(year, month, 1)
  const offset = (weekday - date.getUTCDay() + 7) % 7
  date.setUTCDate(1 + offset + (nth - 1) * 7)
  return dateKey(date)
}

const lastWeekday = (year: number, month: number, weekday: number) => {
  const date = utcDate(year, month + 1, 0)
  const offset = (date.getUTCDay() - weekday + 7) % 7
  date.setUTCDate(date.getUTCDate() - offset)
  return dateKey(date)
}

const easterSunday = (year: number) => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return utcDate(year, month, day)
}

export const isUsEquityHoliday = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('invalid_us_session_date')
  const year = Number(value.slice(0, 4))
  const goodFriday = easterSunday(year)
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2)
  const holidays = new Set([
    observedFixedHoliday(year, 1, 1),
    observedFixedHoliday(year + 1, 1, 1),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    dateKey(goodFriday),
    lastWeekday(year, 5, 1),
    observedFixedHoliday(year, 6, 19),
    observedFixedHoliday(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observedFixedHoliday(year, 12, 25),
  ])
  return holidays.has(value)
}

export type UsOpenExecutionContext = {
  dateKey: string
  localTime: string
  weekday: string
  isHoliday: boolean
  shouldRun: boolean
}

export const getUsOpenExecutionContext = (now = new Date()): UsOpenExecutionContext => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    weekday: 'short',
  })
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]))
  const sessionDate = `${parts.year}-${parts.month}-${parts.day}`
  const localTime = `${parts.hour}:${parts.minute}`
  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  const weekday = parts.weekday
  const isWeekday = !['Sat', 'Sun'].includes(weekday)
  const isHoliday = isUsEquityHoliday(sessionDate)
  return {
    dateKey: sessionDate,
    localTime,
    weekday,
    isHoliday,
    shouldRun: isWeekday && !isHoliday && minutes >= 9 * 60 + 20 && minutes <= 9 * 60 + 29,
  }
}

export const buildUsOpenDedupeKey = (sessionDate: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) throw new Error('invalid_us_open_date_key')
  return `mbai_us_open:${sessionDate}`
}

export type UsOpenSnapshot = {
  sessionDate: string
  sp500Futures: YahooDailyPoint
  nasdaqFutures: YahooDailyPoint
  treasury10y: YahooDailyPoint
  dxy: YahooDailyPoint
  usdKrw: NaverMarketPoint
  kospi: NaverMarketPoint
  kosdaq: NaverMarketPoint
  btc: CoinbaseDailyPoint
  eth: CoinbaseDailyPoint
}

const escapeMarkdownV2 = (value: string) => value.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1')
const formatNumber = (value: number, decimals: number) => value.toLocaleString('en-US', {
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
})
const formatSigned = (value: number, decimals = 2) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(decimals)}`
const directionEmoji = (value: number) => value > 0 ? '🟢' : value < 0 ? '🟠' : '⚪'
const round = (value: number, decimals = 1) => {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export const buildUsOpenInterpretation = (snapshot: UsOpenSnapshot) => {
  const futuresAverage = (snapshot.sp500Futures.changePercent + snapshot.nasdaqFutures.changePercent) / 2
  const cryptoAverage = (snapshot.btc.changePercent + snapshot.eth.changePercent) / 2
  const rateBps = (snapshot.treasury10y.value - snapshot.treasury10y.previous) * 100
  return [
    futuresAverage >= 0.3 ? '미국 선물은 위험선호 우위' : futuresAverage <= -0.3 ? '미국 선물은 위험회피 우위' : '미국 선물은 혼조권',
    rateBps >= 3 ? '금리 상승은 성장주에 부담' : rateBps <= -3 ? '금리 하락은 성장주에 우호적' : '금리는 중립 범위',
    snapshot.dxy.changePercent >= 0.1 && snapshot.usdKrw.changePercent >= 0.05
      ? '달러 강세와 원화 약세 동반'
      : snapshot.dxy.changePercent <= -0.1 && snapshot.usdKrw.changePercent <= -0.05
        ? '달러 약세와 원화 강세 동반'
        : '달러와 원화 신호는 혼조',
    snapshot.kospi.changePercent >= 0.3 && futuresAverage >= 0.3
      ? '한국장 강세 이후 미국 선물도 강세'
      : snapshot.kospi.changePercent <= -0.3 && futuresAverage <= -0.3
        ? '한국장 약세 이후 미국 선물도 약세'
        : '한국장과 미국 선물은 엇갈림',
    cryptoAverage <= futuresAverage - 0.5
      ? '크립토는 주식 대비 약세'
      : cryptoAverage >= futuresAverage + 0.5
        ? '크립토는 주식 대비 강세'
        : '크립토는 주식과 유사한 흐름',
  ].join(' · ')
}

export const buildUsOpenMessage = (snapshot: UsOpenSnapshot) => {
  const rateBps = round((snapshot.treasury10y.value - snapshot.treasury10y.previous) * 100)
  return [
    `🇺🇸 *US OPEN \\| ${escapeMarkdownV2(snapshot.sessionDate)}*`,
    '⏱ *뉴욕 개장 직전*',
    '',
    '📈 *미국 선물*',
    `S&P 500 선물 ${escapeMarkdownV2(formatNumber(snapshot.sp500Futures.value, 2))} ${directionEmoji(snapshot.sp500Futures.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.sp500Futures.changePercent))}%`,
    `NASDAQ 100 선물 ${escapeMarkdownV2(formatNumber(snapshot.nasdaqFutures.value, 2))} ${directionEmoji(snapshot.nasdaqFutures.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.nasdaqFutures.changePercent))}%`,
    '',
    '🌐 *금리 · 달러*',
    `미 10년물 ${escapeMarkdownV2(formatNumber(snapshot.treasury10y.value, 2))}% ${rateBps > 0 ? '🔴' : rateBps < 0 ? '🔵' : '⚪'} ${escapeMarkdownV2(formatSigned(rateBps, 1))}bp`,
    `달러지수 ${escapeMarkdownV2(formatNumber(snapshot.dxy.value, 2))} ${directionEmoji(snapshot.dxy.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.dxy.changePercent))}%`,
    `USD/KRW ${escapeMarkdownV2(formatNumber(snapshot.usdKrw.value, 2))} ${snapshot.usdKrw.changePercent > 0 ? '🔴' : snapshot.usdKrw.changePercent < 0 ? '🟢' : '⚪'} ${escapeMarkdownV2(formatSigned(snapshot.usdKrw.changePercent))}%`,
    '',
    '🇰🇷 *한국장 마감*',
    `KOSPI ${escapeMarkdownV2(formatNumber(snapshot.kospi.value, 2))} ${directionEmoji(snapshot.kospi.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.kospi.changePercent))}%`,
    `KOSDAQ ${escapeMarkdownV2(formatNumber(snapshot.kosdaq.value, 2))} ${directionEmoji(snapshot.kosdaq.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.kosdaq.changePercent))}%`,
    '',
    '₿ *크립토 24시간*',
    `BTC $${escapeMarkdownV2(formatNumber(snapshot.btc.value, 0))} ${directionEmoji(snapshot.btc.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.btc.changePercent))}%`,
    `ETH $${escapeMarkdownV2(formatNumber(snapshot.eth.value, 0))} ${directionEmoji(snapshot.eth.changePercent)} ${escapeMarkdownV2(formatSigned(snapshot.eth.changePercent))}%`,
    '',
    '🧭 *오프닝 브리지*',
    buildUsOpenInterpretation(snapshot),
    '',
    '출처: Yahoo Finance · 네이버 금융 · Coinbase',
  ].join('\n')
}
