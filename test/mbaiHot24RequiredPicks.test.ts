import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRequiredPickDedupeKey,
  buildRequiredPickMessage,
  assembleRequiredPicks,
  getRequiredPickExecutionContext,
  parseCryptoVolumeLeaders,
  parseKoreaTurnoverLeaders,
  parseUsTurnoverLeaders,
  selectRequiredNewsPicks,
  type RequiredNewsCandidate,
} from '../lib/mbaiHot24RequiredPicks.ts'

const observedAt = '2026-08-28T07:10:00.000Z'
const news = (overrides: Partial<RequiredNewsCandidate>): RequiredNewsCandidate => ({
  issueId: 1,
  title: '시장 주요 뉴스입니다',
  summary: '시장 참여자의 관심이 집중된 핵심 뉴스가 가격과 수급에 영향을 줬습니다.',
  whyItMatters: '다음 거래일에도 관련 지수와 자산으로 영향이 이어지는지 확인해야 합니다.',
  topic: 'Market',
  region: 'Global',
  importanceScore: 55,
  importanceLabel: 'watch',
  firstSeenAt: '2026-08-28T05:00:00.000Z',
  lastSeenAt: '2026-08-28T06:00:00.000Z',
  sourceName: 'Reuters',
  sourceTier: 'tier1',
  articleUrl: 'https://example.com/1',
  keyEntities: [],
  tags: [],
  updateCount: 0,
  asset: null,
  hotScore: 58,
  contentType: 'NEWS',
  ...overrides,
})

test('required NEWS selects one meaningful fallback below 65 for every market', () => {
  const picks = selectRequiredNewsPicks([
    news({ issueId: 11, title: '코스피 외국인 순매수와 삼성전자 수급 변화', articleUrl: 'https://example.com/korea', hotScore: 58 }),
    news({ issueId: 12, title: '연준 결정 이후 나스닥과 미국 증시 변동 확대', articleUrl: 'https://example.com/us', hotScore: 57 }),
    news({ issueId: 13, title: '비트코인 현물 ETF 자금 유입과 크립토 거래 증가', articleUrl: 'https://example.com/crypto', hotScore: 55 }),
  ])
  assert.equal(picks.KOREA?.issueId, 11)
  assert.equal(picks.US?.issueId, 12)
  assert.equal(picks.CRYPTO?.issueId, 13)
  assert.equal(new Set(Object.values(picks).map((pick) => pick?.articleUrl)).size, 3)
})

test('primary NEWS at 65 or above always beats a fallback candidate', () => {
  const picks = selectRequiredNewsPicks([
    news({ issueId: 14, title: '코스피 주요 뉴스', articleUrl: 'https://example.com/primary', hotScore: 65 }),
    news({ issueId: 15, title: '코스피 코스닥 한국 증시 국내 증시 삼성전자 수급', articleUrl: 'https://example.com/fallback', hotScore: 64.9 }),
  ], ['KOREA'])
  assert.equal(picks.KOREA?.issueId, 14)
})

test('single-market NEWS selection is not displaced by picks for discarded markets', () => {
  const crossMarket = news({
    issueId: 31,
    title: '연준 결정과 코스피 충격 속 비트코인 ETF 자금 유입 확대',
    articleUrl: 'https://example.com/cross',
    importanceScore: 70,
    hotScore: 75,
  })
  const cryptoOnly = news({ issueId: 32, title: '비트코인 거래 증가', articleUrl: 'https://example.com/crypto-only', hotScore: 60 })
  const picks = selectRequiredNewsPicks([crossMarket, cryptoOnly], ['CRYPTO'])
  assert.equal(picks.CRYPTO?.issueId, 31)
})

test('crypto NEWS requires an actual crypto-market term, not only a crypto publisher', () => {
  const candidate = news({ issueId: 16, title: '오픈AI 연구소가 새 추론 모델을 공개했다', sourceName: 'Tokenpost', hotScore: 70 })
  assert.equal(selectRequiredNewsPicks([candidate], ['CRYPTO']).CRYPTO, undefined)
})

test('short market aliases require token boundaries', () => {
  const candidate = news({ issueId: 17, title: '새로운 method 기반 연구 결과가 공개됐다', sourceName: 'Reuters', hotScore: 70 })
  assert.equal(selectRequiredNewsPicks([candidate], ['CRYPTO']).CRYPTO, undefined)
})

test('required NEWS keeps a meaningful floor and never fills with weak content', () => {
  const picks = selectRequiredNewsPicks([
    news({ issueId: 21, title: '코스피 홍보 이벤트', importanceScore: 49, hotScore: 64 }),
    news({ issueId: 22, title: '코스피 단신', importanceScore: 50, hotScore: 49, updateCount: 0 }),
  ])
  assert.equal(picks.KOREA, undefined)
})

test('Korea ASSET ranks actual turnover and excludes ETF, ETN and stale rows', () => {
  const payloads = [{ stocks: [
    { itemCode: '069500', stockName: 'KODEX 200', stockEndType: 'etf', closePriceRaw: '50000', fluctuationsRatio: '1.2', accumulatedTradingValueRaw: '9000000000000', marketValueRaw: '10000000000000', localTradedAt: '2026-08-28T15:55:00+09:00', marketStatus: 'CLOSE', tradableStatus: 'tradable' },
    { itemCode: '005930', stockName: '삼성전자', closePriceRaw: '257000', fluctuationsRatio: '-3.38', accumulatedTradingValueRaw: '3819817000000', marketValueRaw: '1502493602256000', localTradedAt: '2026-08-28T15:56:00+09:00', marketStatus: 'CLOSE', tradableStatus: 'tradable' },
    { itemCode: '000660', stockName: 'SK하이닉스', closePriceRaw: '1653000', fluctuationsRatio: '-4.45', accumulatedTradingValueRaw: '4720226000000', marketValueRaw: '1207503879345000', localTradedAt: '2026-08-28T15:56:00+09:00', marketStatus: 'CLOSE', tradableStatus: 'tradable' },
    { itemCode: '123456', stockName: '오래된종목', closePriceRaw: '10000', fluctuationsRatio: '2', accumulatedTradingValueRaw: '8000000000000', marketValueRaw: '200000000000', localTradedAt: '2026-08-26T15:30:00+09:00', marketStatus: 'CLOSE', tradableStatus: 'tradable' },
  ] }]
  const leaders = parseKoreaTurnoverLeaders(payloads, observedAt)
  assert.equal(leaders[0].symbol, '000660')
  assert.equal(leaders[0].turnover, 4_720_226_000_000)
})

test('US ASSET ranks dollar turnover and excludes penny or stale equities', () => {
  const payload = { finance: { result: [{ quotes: [
    { symbol: 'PENNY', shortName: 'Penny Corp', quoteType: 'EQUITY', regularMarketPrice: 0.5, regularMarketVolume: 99_000_000_000, regularMarketTime: 1787893200, marketCap: 2_000_000_000, regularMarketChangePercent: 10 },
    { symbol: 'NVDA', shortName: 'NVIDIA', quoteType: 'EQUITY', regularMarketPrice: 200, regularMarketVolume: 300_000_000, regularMarketTime: 1787893200, marketCap: 4_000_000_000_000, regularMarketChangePercent: 5 },
    { symbol: 'AAPL', shortName: 'Apple', quoteType: 'EQUITY', regularMarketPrice: 250, regularMarketVolume: 100_000_000, regularMarketTime: 1787893200, marketCap: 3_000_000_000_000, regularMarketChangePercent: 1 },
  ] }] } }
  const leaders = parseUsTurnoverLeaders(payload, '2026-08-28T16:30:00.000Z')
  assert.equal(leaders[0].symbol, 'NVDA')
  assert.equal(leaders[0].turnover, 60_000_000_000)
})

test('CRYPTO ASSET ranks 24h volume and excludes stablecoins and low-cap tokens', () => {
  const payload = [
    { id: 'tether', symbol: 'usdt', name: 'Tether', current_price: 1, total_volume: 80_000_000_000, market_cap: 180_000_000_000, price_change_percentage_24h: 0, last_updated: '2026-08-28T07:00:00.000Z' },
    { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 79000, total_volume: 55_000_000_000, market_cap: 1_500_000_000_000, price_change_percentage_24h: 2.1, last_updated: '2026-08-28T07:00:00.000Z' },
    { id: 'tiny', symbol: 'tiny', name: 'Tiny', current_price: 2, total_volume: 60_000_000_000, market_cap: 10_000_000, price_change_percentage_24h: 30, last_updated: '2026-08-28T07:00:00.000Z' },
  ]
  const leaders = parseCryptoVolumeLeaders(payload, observedAt)
  assert.equal(leaders[0].symbol, 'BTC')
  assert.equal(leaders[0].turnover, 55_000_000_000)
})

test('CRYPTO ASSET excludes maintained stablecoin symbols beyond USDT', () => {
  const payload = ['rlusd', 'usdg', 'eurc', 'gho', 'crvusd'].map((symbol) => ({
    id: `stable-${symbol}`, symbol, name: `Stable ${symbol}`, current_price: 1,
    total_volume: 80_000_000_000, market_cap: 10_000_000_000,
    price_change_percentage_24h: 0, last_updated: '2026-08-28T07:00:00.000Z',
  }))
  assert.equal(parseCryptoVolumeLeaders(payload, observedAt).length, 0)
})

test('Korea and US ASSET reject a prior session after the current market close', () => {
  const korea = parseKoreaTurnoverLeaders([{ stocks: [{ itemCode: '005930', stockName: '삼성전자', stockEndType: 'stock', closePriceRaw: '70000', fluctuationsRatio: '1', accumulatedTradingValueRaw: '1000000000000', marketValueRaw: '500000000000000', localTradedAt: '2026-08-27T15:56:00+09:00', tradableStatus: 'tradable' }] }], '2026-08-28T07:10:00.000Z')
  const us = parseUsTurnoverLeaders({ finance: { result: [{ quotes: [{ symbol: 'NVDA', shortName: 'NVIDIA', quoteType: 'EQUITY', regularMarketPrice: 200, regularMarketVolume: 300_000_000, regularMarketTime: Date.parse('2026-08-27T20:00:00.000Z') / 1000, marketCap: 4_000_000_000_000, regularMarketChangePercent: 2 }] }] } }, '2026-08-28T21:20:00.000Z')
  assert.deepEqual([korea.length, us.length], [0, 0])
})

test('ASSET parsers reject every non-finite numeric output', () => {
  const korea = parseKoreaTurnoverLeaders([{ stocks: [{ itemCode: '005930', stockName: '삼성전자', stockEndType: 'stock', closePriceRaw: '70000', fluctuationsRatio: 'NaN', accumulatedTradingValueRaw: '1000000000000', marketValueRaw: '500000000000000', localTradedAt: '2026-08-28T15:56:00+09:00', tradableStatus: 'tradable' }] }], observedAt)
  const us = parseUsTurnoverLeaders({ finance: { result: [{ quotes: [{ symbol: 'NVDA', shortName: 'NVIDIA', quoteType: 'EQUITY', regularMarketPrice: 200, regularMarketVolume: 300_000_000, regularMarketTime: 1787893200, marketCap: 4_000_000_000_000, regularMarketChangePercent: Number.NaN }] }] } }, '2026-08-28T16:30:00.000Z')
  const crypto = parseCryptoVolumeLeaders([{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 79000, total_volume: 55_000_000_000, market_cap: 1_500_000_000_000, price_change_percentage_24h: Number.NaN, last_updated: '2026-08-28T07:00:00.000Z' }], observedAt)
  assert.deepEqual([korea.length, us.length, crypto.length], [0, 0, 0])
})

test('ASSET parsers reject missing canonical identifiers', () => {
  const korea = parseKoreaTurnoverLeaders([{ stocks: [{ itemCode: '', stockName: '삼성전자', stockEndType: 'stock', closePriceRaw: '70000', fluctuationsRatio: '1', accumulatedTradingValueRaw: '1000000000000', marketValueRaw: '500000000000000', localTradedAt: '2026-08-28T15:56:00+09:00', tradableStatus: 'tradable' }] }], observedAt)
  const us = parseUsTurnoverLeaders({ finance: { result: [{ quotes: [{ symbol: '', shortName: 'NVIDIA', quoteType: 'EQUITY', regularMarketPrice: 200, regularMarketVolume: 300_000_000, regularMarketTime: 1787893200, marketCap: 4_000_000_000_000, regularMarketChangePercent: 2 }] }] } }, '2026-08-28T16:30:00.000Z')
  const crypto = parseCryptoVolumeLeaders([{ id: '', symbol: 'btc', name: 'Bitcoin', current_price: 79000, total_volume: 55_000_000_000, market_cap: 1_500_000_000_000, price_change_percentage_24h: 2, last_updated: '2026-08-28T07:00:00.000Z' }], observedAt)
  assert.deepEqual([korea.length, us.length, crypto.length], [0, 0, 0])
})

test('required picks isolate news and market-data failures', () => {
  const leader = parseCryptoVolumeLeaders([{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 79000, total_volume: 55_000_000_000, market_cap: 1_500_000_000_000, price_change_percentage_24h: 2.1, last_updated: '2026-08-28T07:00:00.000Z' }], observedAt)[0]
  assert.deepEqual(assembleRequiredPicks('CRYPTO', [], [leader]).map((pick) => pick.kind), ['ASSET'])
  assert.deepEqual(assembleRequiredPicks('CRYPTO', [news({ title: '비트코인 기관 수요 증가' })], []).map((pick) => pick.kind), ['NEWS'])
})

test('required picks use market-complete distributed windows including New York DST', () => {
  assert.equal(getRequiredPickExecutionContext('KOREA', new Date('2026-08-28T07:05:00.000Z')).inWindow, true)
  assert.equal(getRequiredPickExecutionContext('CRYPTO', new Date('2026-08-28T11:30:00.000Z')).inWindow, true)
  assert.equal(getRequiredPickExecutionContext('US', new Date('2026-08-28T21:20:00.000Z')).inWindow, true)
  assert.equal(getRequiredPickExecutionContext('US', new Date('2026-01-15T22:20:00.000Z')).inWindow, true)
  assert.equal(getRequiredPickExecutionContext('US', new Date('2026-08-28T20:20:00.000Z')).inWindow, false)
})

test('required pick uses a market-kind daily key and a safe MarkdownV2 message', () => {
  assert.equal(buildRequiredPickDedupeKey('2026-08-28', 'US', 'ASSET'), 'mbai_hot24:2026-08-28:US:ASSET')
  const leader = parseCryptoVolumeLeaders([{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 79000, total_volume: 55_000_000_000, market_cap: 1_500_000_000_000, price_change_percentage_24h: 2.1, last_updated: '2026-08-28T07:00:00.000Z' }], observedAt)[0]
  const message = buildRequiredPickMessage({ market: 'CRYPTO', kind: 'ASSET', asset: leader }, observedAt)
  assert.match(message, /HOT 24 \\· CRYPTO ASSET/)
  assert.match(message, /거래대금/)
  assert.ok(message.length <= 3900)
})
