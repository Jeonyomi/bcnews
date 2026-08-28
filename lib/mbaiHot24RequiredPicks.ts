import type { EvaluatedHot24Candidate } from './mbaiHot24Config.ts'

export type RequiredPickMarket = 'KOREA' | 'US' | 'CRYPTO'
export type RequiredPickKind = 'NEWS' | 'ASSET'
export type RequiredNewsCandidate = EvaluatedHot24Candidate

export type TurnoverLeader = {
  market: RequiredPickMarket
  symbol: string
  name: string
  price: number
  changePercent: number
  turnover: number
  marketCap: number
  currency: 'KRW' | 'USD'
  asOf: string
  sessionKey: string
  source: string
  url: string
}

export type RequiredPick =
  | { market: RequiredPickMarket; kind: 'NEWS'; news: RequiredNewsCandidate }
  | { market: RequiredPickMarket; kind: 'ASSET'; asset: TurnoverLeader }

const MARKET_TERMS: Record<RequiredPickMarket, string[]> = {
  KOREA: ['코스피', 'kospi', '코스닥', 'kosdaq', '한국 증시', '국내 증시', '삼성전자', 'sk하이닉스', '한국은행', '한은', '외국인 순매수'],
  US: ['나스닥', 'nasdaq', 's&p', '월가', '미국 증시', '미 증시', '연준', 'fed', '엔비디아', 'nvidia', '테슬라', 'tesla', '애플', '마이크로소프트'],
  CRYPTO: ['비트코인', 'bitcoin', 'btc', '이더리움', 'ethereum', 'eth', '크립토', '암호화폐', '가상자산', '블록체인', '스테이블코인', 'xrp', '솔라나'],
}
const CRYPTO_SOURCES = ['coindesk', 'cointelegraph', 'the block', 'blockworks', 'tokenpost', 'blockmedia', 'coinness', 'bithumb', 'upbit', 'coinbase', 'binance']
const HOUR_MS = 60 * 60 * 1000
const escapeMarkdownV2 = (value: string) => String(value || '').replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1')
const finitePositive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0
const dateKey = (value: string, timeZone: string) => {
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new Error('invalid_required_pick_timestamp')
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed)
}
const matchesMarketTerm = (text: string, term: string) => {
  if (!/^[a-z0-9]+$/.test(term) || term.length > 4) return text.includes(term)
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)
}
const affinity = (candidate: RequiredNewsCandidate, market: RequiredPickMarket) => {
  const text = [candidate.title, candidate.summary, candidate.whyItMatters, candidate.topic, candidate.region, ...candidate.keyEntities, ...candidate.tags]
    .join(' ').toLowerCase()
  let score = MARKET_TERMS[market].filter((term) => matchesMarketTerm(text, term)).length
  if (market === 'CRYPTO' && score > 0 && CRYPTO_SOURCES.some((source) => candidate.sourceName.toLowerCase().includes(source))) score += 1
  return score
}

export const selectRequiredNewsPicks = (
  candidates: RequiredNewsCandidate[],
  markets: RequiredPickMarket[] = ['KOREA', 'US', 'CRYPTO'],
) => {
  const result: Partial<Record<RequiredPickMarket, RequiredNewsCandidate>> = {}
  const used = new Set<string>()
  for (const market of markets) {
    const eligible = candidates.filter((candidate) => candidate.importanceScore >= 50
      && (candidate.hotScore >= 55 || candidate.updateCount >= 1)
      && affinity(candidate, market) > 0
      && !used.has(candidate.articleUrl))
    const primary = eligible.filter((candidate) => candidate.hotScore >= 65)
    const selected = (primary.length ? primary : eligible)
      .sort((left, right) => {
        const leftScore = left.hotScore + affinity(left, market) * 2 + Math.min(4, left.updateCount)
        const rightScore = right.hotScore + affinity(right, market) * 2 + Math.min(4, right.updateCount)
        return rightScore - leftScore || right.importanceScore - left.importanceScore || right.issueId - left.issueId
      })[0]
    if (selected) {
      result[market] = selected
      used.add(selected.articleUrl)
    }
  }
  return result
}

export const assembleRequiredPicks = (
  market: RequiredPickMarket,
  evaluatedNews: RequiredNewsCandidate[],
  assetLeaders: TurnoverLeader[],
): RequiredPick[] => {
  const picks: RequiredPick[] = []
  const news = selectRequiredNewsPicks(evaluatedNews, [market])[market]
  if (news) picks.push({ market, kind: 'NEWS', news })
  if (assetLeaders[0]) picks.push({ market, kind: 'ASSET', asset: assetLeaders[0] })
  return picks
}

const validateAsOf = (raw: unknown, observedAt: string, maxAgeHours: number) => {
  const value = String(raw || '')
  const timestamp = new Date(value).getTime()
  const observed = new Date(observedAt).getTime()
  if (!Number.isFinite(timestamp) || !Number.isFinite(observed)) return null
  if (timestamp > observed || observed - timestamp > maxAgeHours * HOUR_MS) return null
  return value
}

const sessionIsCurrentAfterClose = (asOf: string, observedAt: string, timeZone: string, closeMinute: number) => {
  const observed = new Date(observedAt)
  if (!Number.isFinite(observed.getTime())) return false
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(observed).map(({ type, value }) => [type, value]))
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute)
  return minuteOfDay < closeMinute || dateKey(asOf, timeZone) === dateKey(observedAt, timeZone)
}

export const parseKoreaTurnoverLeaders = (payloads: any[], observedAt: string): TurnoverLeader[] => {
  const excluded = /(ETF|ETN|스팩|인버스|레버리지)/i
  return payloads.flatMap((payload) => Array.isArray(payload?.stocks) ? payload.stocks : [])
    .flatMap((stock: any) => {
      const asOf = validateAsOf(stock?.localTradedAt, observedAt, 36)
      const turnover = Number(stock?.accumulatedTradingValueRaw)
      const marketCap = Number(stock?.marketValueRaw)
      const price = Number(stock?.closePriceRaw)
      const changePercent = Number(stock?.fluctuationsRatio ?? 0)
      const symbol = String(stock?.itemCode || '').trim()
      const name = String(stock?.stockName || '').trim()
      if (!asOf || !sessionIsCurrentAfterClose(asOf, observedAt, 'Asia/Seoul', 16 * 60)
        || !/^\d{6}$/.test(symbol) || !name || String(stock?.stockEndType || 'stock').toLowerCase() !== 'stock'
        || excluded.test(name) || stock?.tradableStatus !== 'tradable'
        || !finitePositive(price) || !finitePositive(turnover) || !finitePositive(marketCap)
        || !Number.isFinite(changePercent) || turnover < 50_000_000_000 || marketCap < 100_000_000_000) return []
      return [{
        market: 'KOREA' as const, symbol, name,
        price, changePercent, turnover, marketCap, currency: 'KRW' as const,
        asOf, sessionKey: dateKey(asOf, 'Asia/Seoul'), source: 'Naver Finance',
        url: `https://stock.naver.com/domestic/stock/${encodeURIComponent(symbol)}`,
      }]
    }).sort((a, b) => b.turnover - a.turnover || b.marketCap - a.marketCap)
}

export const parseUsTurnoverLeaders = (payload: any, observedAt: string): TurnoverLeader[] => {
  const quotes = payload?.finance?.result?.[0]?.quotes
  if (!Array.isArray(quotes)) throw new Error('invalid_required_pick_yahoo')
  return quotes.flatMap((quote: any) => {
    const epoch = Number(quote?.regularMarketTime)
    const asOf = validateAsOf(Number.isFinite(epoch) ? new Date(epoch * 1000).toISOString() : '', observedAt, 36)
    const price = Number(quote?.regularMarketPrice)
    const volume = Number(quote?.regularMarketVolume)
    const marketCap = Number(quote?.marketCap)
    const turnover = price * volume
    const changePercent = Number(quote?.regularMarketChangePercent ?? 0)
    const symbol = String(quote?.symbol || '').trim()
    const name = String(quote?.shortName || quote?.longName || quote?.symbol || '').trim()
    if (!asOf || !sessionIsCurrentAfterClose(asOf, observedAt, 'America/New_York', 17 * 60 + 15)
      || !symbol || !name || quote?.quoteType !== 'EQUITY' || !finitePositive(price) || price < 5 || !finitePositive(volume)
      || !finitePositive(marketCap) || !finitePositive(turnover) || !Number.isFinite(changePercent)
      || marketCap < 1_000_000_000 || turnover < 100_000_000) return []
    return [{
      market: 'US' as const, symbol, name,
      price, changePercent, turnover, marketCap, currency: 'USD' as const,
      asOf, sessionKey: dateKey(asOf, 'America/New_York'), source: 'Yahoo Finance',
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
    }]
  }).sort((a, b) => b.turnover - a.turnover || b.marketCap - a.marketCap)
}

const STABLECOINS = new Set([
  'usdt', 'usdc', 'dai', 'usde', 'fdusd', 'tusd', 'usds', 'susds', 'pyusd', 'usd1', 'usdd', 'frax',
  'rlusd', 'usdg', 'eurc', 'gho', 'crvusd', 'usdtb', 'bfusd', 'usdf', 'usdy', 'usyc', 'lusd', 'alusd', 'gusd',
])
export const parseCryptoVolumeLeaders = (payload: any, observedAt: string): TurnoverLeader[] => {
  if (!Array.isArray(payload)) throw new Error('invalid_required_pick_coingecko')
  return payload.flatMap((coin: any) => {
    const symbol = String(coin?.symbol || '').trim().toLowerCase()
    const id = String(coin?.id || '').trim()
    const name = String(coin?.name || '').trim()
    const asOf = validateAsOf(coin?.last_updated, observedAt, 2)
    const price = Number(coin?.current_price)
    const turnover = Number(coin?.total_volume)
    const marketCap = Number(coin?.market_cap)
    const changePercent = Number(coin?.price_change_percentage_24h ?? 0)
    if (!asOf || !id || !symbol || !name || STABLECOINS.has(symbol) || !finitePositive(price) || !finitePositive(turnover)
      || !finitePositive(marketCap) || !Number.isFinite(changePercent) || turnover < 50_000_000
      || marketCap < 100_000_000) return []
    return [{
      market: 'CRYPTO' as const, symbol: symbol.toUpperCase(), name,
      price, changePercent, turnover, marketCap, currency: 'USD' as const,
      asOf, sessionKey: dateKey(observedAt, 'Asia/Seoul'), source: 'CoinGecko',
      url: `https://www.coingecko.com/en/coins/${encodeURIComponent(id)}`,
    }]
  }).sort((a, b) => b.turnover - a.turnover || b.marketCap - a.marketCap)
}

const zonedParts = (now: Date, timeZone: string) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(now).map(({ type, value }) => [type, value]))

export const getRequiredPickExecutionContext = (market: RequiredPickMarket, now = new Date()) => {
  if (!Number.isFinite(now.getTime())) throw new Error('invalid_required_pick_execution_time')
  const timeZone = market === 'US' ? 'America/New_York' : 'Asia/Seoul'
  const parts = zonedParts(now, timeZone)
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute)
  const weekday = String(parts.weekday)
  const weekdayOpen = !['Sat', 'Sun'].includes(weekday)
  const inWindow = market === 'KOREA'
    ? weekdayOpen && minuteOfDay >= 16 * 60 && minuteOfDay <= 16 * 60 + 19
    : market === 'US'
      ? weekdayOpen && minuteOfDay >= 17 * 60 + 15 && minuteOfDay <= 17 * 60 + 29
      : minuteOfDay >= 20 * 60 + 25 && minuteOfDay <= 20 * 60 + 39
  return {
    market, timeZone, weekday, minuteOfDay, inWindow,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

export const buildRequiredPickDedupeKey = (date: string, market: RequiredPickMarket, kind: RequiredPickKind) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid_required_pick_date')
  return `mbai_hot24:${date}:${market}:${kind}`
}

const marketLabel = (market: RequiredPickMarket) => ({ KOREA: '국장', US: '미장', CRYPTO: '크립토' }[market])
const formatTurnover = (leader: TurnoverLeader) => leader.currency === 'KRW'
  ? `${(leader.turnover / 1_000_000_000_000).toFixed(2)}조원`
  : `$${(leader.turnover / 1_000_000_000).toFixed(2)}B`

export const buildRequiredPickMessage = (
  pick: { market: RequiredPickMarket; kind: 'NEWS'; news: RequiredNewsCandidate }
    | { market: RequiredPickMarket; kind: 'ASSET'; asset: TurnoverLeader },
  observedAt: string,
) => {
  const observed = new Date(observedAt)
  if (!Number.isFinite(observed.getTime())) throw new Error('invalid_required_pick_observed_at')
  const observedKst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(observed).replace(',', '')
  const lines = pick.kind === 'NEWS'
    ? [
      `🔥 *HOT 24 \\· ${pick.market} NEWS*`, `*${escapeMarkdownV2(pick.news.title)}*`, '',
      '📰 *오늘의 관심 뉴스*', escapeMarkdownV2(pick.news.summary), '',
      '💡 *왜 중요한가*', escapeMarkdownV2(pick.news.whyItMatters), '',
      `관심도: HOT ${escapeMarkdownV2(pick.news.hotScore.toFixed(1))} · 독립 관련 출처 ${pick.news.updateCount}`,
      `출처: ${escapeMarkdownV2(pick.news.sourceName)}`,
    ]
    : [
      `🔥 *HOT 24 \\· ${pick.market} ASSET*`, `*${escapeMarkdownV2(pick.asset.name)} \\(${escapeMarkdownV2(pick.asset.symbol)}\\)*`, '',
      '📊 *오늘 거래대금 상위 자산*',
      escapeMarkdownV2(`가격 ${pick.asset.price.toLocaleString('en-US')} · 변화 ${pick.asset.changePercent >= 0 ? '+' : ''}${pick.asset.changePercent.toFixed(2)}%`),
      escapeMarkdownV2(`거래대금 ${formatTurnover(pick.asset)}`), '',
      '💡 *왜 중요한가*', escapeMarkdownV2(`${marketLabel(pick.market)}에서 실제 자금이 가장 집중된 고유동성 자산 중 하나입니다. 다음 세션에도 거래대금이 유지되는지 확인해야 합니다.`), '',
      `출처: ${escapeMarkdownV2(pick.asset.source)} · 기준 세션 ${escapeMarkdownV2(pick.asset.sessionKey)}`,
    ]
  const message = [...lines, `조회: ${escapeMarkdownV2(observedKst)} KST`, '', '※ 투자 판단을 위한 참고 정보이며 매수·매도 권유가 아닙니다\.'].join('\n')
  if (message.length > 3900) throw new Error('required_pick_message_too_long')
  return message
}
