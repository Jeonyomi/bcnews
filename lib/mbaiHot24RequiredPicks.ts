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

const formatTurnover = (leader: TurnoverLeader) => leader.currency === 'KRW'
  ? `${(leader.turnover / 1_000_000_000_000).toFixed(2)}조원`
  : `$${(leader.turnover / 1_000_000_000).toFixed(2)}B`

const newsNextCheck: Record<RequiredPickMarket, string> = {
  KOREA: '다음 거래일 외국인·기관 수급이 이어지는지, 영향이 관련 업종으로 번지는지 확인합니다.',
  US: '다음 세션 지수 선물과 동종 종목이 같은 방향으로 움직이는지, 금리 변화가 흐름을 되돌리는지 확인합니다.',
  CRYPTO: '후속 보도가 실제 가격과 현물 거래대금으로 이어지는지, 비트코인과 주요 알트코인이 같은 방향으로 반응하는지 확인합니다.',
}

const newsMarketInterpretation: Record<RequiredPickMarket, string> = {
  KOREA: '국내 증시에서는 헤드라인 자체보다 외국인·기관 수급과 주도 업종의 확산 여부가 실제 영향력을 가릅니다. 기사 이후 가격과 수급이 함께 움직여야 시장 재료로 확인할 수 있습니다.',
  US: '미국 시장에서는 뉴스가 해당 종목을 넘어 동종주와 지수로 번지는지가 중요합니다. 기사 이후 가격과 거래대금이 함께 반응해야 시장 전체 재료로 볼 수 있습니다.',
  CRYPTO: '크립토 시장에서는 정책·상품 뉴스와 실제 가격 반응이 자주 엇갈립니다. 현물 거래대금과 주요 코인의 동반 움직임이 확인돼야 영향이 이어졌다고 볼 수 있습니다.',
}
const normalizedNarrative = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
const distinctNewsInterpretation = (candidate: RequiredNewsCandidate, market: RequiredPickMarket) => {
  const summary = normalizedNarrative(candidate.summary)
  const explanation = normalizedNarrative(candidate.whyItMatters)
  return explanation.length >= 20 && (summary.includes(explanation) || explanation.includes(summary))
    ? newsMarketInterpretation[market]
    : candidate.whyItMatters
}

const assetDirection = (changePercent: number) => Math.abs(changePercent) < 0.1
  ? '보합권'
  : changePercent > 0 ? '상승' : '하락'
const withTopicParticle = (name: string) => {
  const last = name.at(-1) || ''
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return `${name}${(code - 0xac00) % 28 === 0 ? '는' : '은'}`
  return `${name}은`
}
const formatAssetPrice = (leader: TurnoverLeader) => leader.currency === 'KRW'
  ? `${leader.price.toLocaleString('en-US')}원`
  : `$${leader.price.toLocaleString('en-US')}`
const withInstrumentalParticle = (value: string) => {
  const last = value.at(-1) || ''
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return `${value}로`
  const finalConsonant = (code - 0xac00) % 28
  return `${value}${finalConsonant === 0 || finalConsonant === 8 ? '로' : '으로'}`
}
const assetNextCheck = (leader: TurnoverLeader) => {
  const direction = assetDirection(leader.changePercent)
  if (leader.market === 'CRYPTO') {
    return `다음 24시간에도 거래대금이 유지되는지, ${direction === '보합권' ? '가격 방향이 새로 정해지는지' : `${direction} 흐름이 주요 코인으로 확산되는지`} 확인합니다.`
  }
  return `다음 거래일에도 거래대금이 유지되는지, ${direction === '보합권' ? '가격 방향이 새로 정해지는지' : `${direction} 흐름이 동종 종목과 관련 업종으로 이어지는지`} 확인합니다.`
}

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
      '📰 *무슨 일이 있었나*', escapeMarkdownV2(pick.news.summary), '',
      '🔎 *시장은 이렇게 읽는다*', escapeMarkdownV2(distinctNewsInterpretation(pick.news, pick.market)), '',
      '👀 *다음 체크*', escapeMarkdownV2(newsNextCheck[pick.market]), '',
      `관심 신호: HOT ${escapeMarkdownV2(pick.news.hotScore.toFixed(1))} · 독립 관련 출처 ${pick.news.updateCount}`,
      `원문: ${escapeMarkdownV2(pick.news.sourceName)}`,
    ]
    : (() => {
      const direction = assetDirection(pick.asset.changePercent)
      const period = pick.market === 'CRYPTO' ? '최근 24시간' : `${pick.asset.sessionKey} 세션`
      const move = direction === '보합권'
        ? `${Math.abs(pick.asset.changePercent).toFixed(2)}%로 보합권에 머물렀습니다.`
        : `${Math.abs(pick.asset.changePercent).toFixed(2)}% ${direction}했습니다.`
      const scene = `${withTopicParticle(pick.asset.name)} ${period} ${formatAssetPrice(pick.asset)}에 거래됐고, ${move} 거래대금은 ${withInstrumentalParticle(formatTurnover(pick.asset))} 집계됐습니다.`
      const meaning = direction === '보합권'
        ? '가격은 보합권이었지만 큰 거래대금이 실렸습니다. 방향은 제한적이어도 실제 매수·매도 공방과 시장의 관심은 컸다는 뜻입니다. 다만 거래대금만으로 다음 방향을 단정할 수는 없습니다.'
        : `${direction}과 함께 큰 거래대금이 실렸습니다. 단순 등락보다 실제 매수·매도 공방과 시장의 관심이 컸다는 뜻입니다. 다만 거래대금만으로 움직임의 원인을 단정할 수는 없습니다.`
      return [
        `🔥 *HOT 24 \\· ${pick.market} ASSET*`, `*${escapeMarkdownV2(pick.asset.name)} \\(${escapeMarkdownV2(pick.asset.symbol)}\\)*`, '',
        '📊 *오늘의 장면*', escapeMarkdownV2(scene), '',
        '🔎 *숫자가 말하는 것*', escapeMarkdownV2(meaning), '',
        '👀 *다음 체크*', escapeMarkdownV2(assetNextCheck(pick.asset)), '',
        `근거: ${escapeMarkdownV2(pick.asset.source)} · 기준 세션 ${escapeMarkdownV2(pick.asset.sessionKey)}`,
      ]
    })()
  const message = [...lines, `조회: ${escapeMarkdownV2(observedKst)} KST`, '', '※ 투자 판단을 위한 참고 정보이며 매수·매도 권유가 아닙니다\.'].join('\n')
  if (message.length > 3900) throw new Error('required_pick_message_too_long')
  return message
}
