import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildKoreaCloseDedupeKey,
  buildKoreaCloseMessage,
  parseNaverMarketPoint,
  type KoreaCloseSnapshot,
} from '../lib/mbaiKoreaCloseConfig.ts'

const naverPoint = (stockName: string, closePrice: string, change: string, ratio: string) => ({
  stockName,
  closePrice,
  compareToPreviousClosePrice: change,
  fluctuationsRatio: ratio,
  marketStatus: 'CLOSE',
  localTradedAt: '2026-08-27T15:40:00+09:00',
})

test('KOREA CLOSE parses closed Korean market values and rejects unsafe payloads', () => {
  assert.deepEqual(parseNaverMarketPoint(naverPoint('코스피', '6,808.21', '65.47', '0.97'), 'KOSPI'), {
    symbol: 'KOSPI', value: 6808.21, change: 65.47, changePercent: 0.97, asOfDate: '2026-08-27',
  })
  assert.throws(() => parseNaverMarketPoint(naverPoint('코스피', '0', '1', '1'), 'KOSPI'), /invalid_naver_market_point/)
  assert.throws(
    () => parseNaverMarketPoint({ ...naverPoint('코스피', '6,808.21', '65.47', '0.97'), marketStatus: 'OPEN' }, 'KOSPI'),
    /naver_market_not_closed/,
  )
})

test('KOREA CLOSE builds a sourced MarkdownV2 cross-market briefing and daily dedupe key', () => {
  const snapshot: KoreaCloseSnapshot = {
    dateKey: '2026-08-27',
    kospi: { symbol: 'KOSPI', value: 6808.21, change: 65.47, changePercent: 0.97, asOfDate: '2026-08-27' },
    kosdaq: { symbol: 'KOSDAQ', value: 826.87, change: -0.28, changePercent: -0.03, asOfDate: '2026-08-27' },
    usdKrw: { symbol: 'USD/KRW', value: 1384.3, change: 0.8, changePercent: 0.06, asOfDate: '2026-08-27' },
    sp500Futures: { symbol: 'ES=F', previous: 7692, value: 7689.5, changePercent: -0.03, asOfDate: '2026-08-27' },
    nasdaqFutures: { symbol: 'NQ=F', previous: 29276.75, value: 29251, changePercent: -0.09, asOfDate: '2026-08-27' },
    btc: { symbol: 'BTC-USD', open: 79117.64, value: 78576.51, changePercent: -0.68 },
    eth: { symbol: 'ETH-USD', open: 2477.76, value: 2464.51, changePercent: -0.53 },
  }

  assert.equal(buildKoreaCloseDedupeKey(snapshot.dateKey), 'mbai_korea_close:2026-08-27')
  assert.equal(buildKoreaCloseMessage(snapshot), [
    '🇰🇷 *KOREA CLOSE \\| 2026\\-08\\-27*',
    '',
    '📊 *한국 증시 마감*',
    'KOSPI 6,808\\.21 🟢 \\+0\\.97%',
    'KOSDAQ 826\\.87 🟠 \\-0\\.03%',
    'USD/KRW 1,384\\.30 🔴 \\+0\\.06%',
    '',
    '🌙 *다음 시장 신호*',
    'S&P 500 선물 7,689\\.50 🟠 \\-0\\.03%',
    'NASDAQ 100 선물 29,251\\.00 🟠 \\-0\\.09%',
    'BTC $78,577 🟠 \\-0\\.68%',
    'ETH $2,465 🟠 \\-0\\.53%',
    '',
    '🧭 *오늘의 브리지*',
    '한국 대형주는 강세 · 코스닥은 상대 약세 · 원화 약세는 외국인 수급에 부담 · 미국 선물과 크립토는 위험회피 신호',
    '',
    '출처: 네이버 금융 · Yahoo Finance · Coinbase',
  ].join('\n'))
})
