import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildUsOpenMessage,
  type UsOpenSnapshot,
} from '../lib/mbaiUsOpenConfig.ts'

test('US OPEN builds an escaped sourced briefing connecting futures, rates, Korea, and crypto', () => {
  const snapshot: UsOpenSnapshot = {
    sessionDate: '2026-08-27',
    sp500Futures: { symbol: 'ES=F', previous: 7669.75, value: 7717, changePercent: 0.62, asOfDate: '2026-08-27' },
    nasdaqFutures: { symbol: 'NQ=F', previous: 29105.75, value: 29487, changePercent: 1.31, asOfDate: '2026-08-27' },
    treasury10y: { symbol: '^TNX', previous: 4.632, value: 4.664, changePercent: 0.69, asOfDate: '2026-08-27' },
    dxy: { symbol: 'DX-Y.NYB', previous: 99, value: 99.138, changePercent: 0.14, asOfDate: '2026-08-27' },
    usdKrw: { symbol: 'USD/KRW', value: 1384.4, change: 0.9, changePercent: 0.07, asOfDate: '2026-08-27' },
    kospi: { symbol: 'KOSPI', value: 6808.21, change: 65.47, changePercent: 0.97, asOfDate: '2026-08-27' },
    kosdaq: { symbol: 'KOSDAQ', value: 826.87, change: -0.28, changePercent: -0.03, asOfDate: '2026-08-27' },
    btc: { symbol: 'BTC-USD', open: 79117.64, value: 78332, changePercent: -0.99 },
    eth: { symbol: 'ETH-USD', open: 2477.76, value: 2459, changePercent: -0.76 },
  }

  assert.equal(buildUsOpenMessage(snapshot), [
    '🇺🇸 *US OPEN \\| 2026\\-08\\-27*',
    '⏱ *뉴욕 개장 직전*',
    '',
    '📈 *미국 선물*',
    'S&P 500 선물 7,717\\.00 🟢 \\+0\\.62%',
    'NASDAQ 100 선물 29,487\\.00 🟢 \\+1\\.31%',
    '',
    '🌐 *금리 · 달러*',
    '미 10년물 4\\.66% 🔴 \\+3\\.2bp',
    '달러지수 99\\.14 🟢 \\+0\\.14%',
    'USD/KRW 1,384\\.40 🔴 \\+0\\.07%',
    '',
    '🇰🇷 *한국장 마감*',
    'KOSPI 6,808\\.21 🟢 \\+0\\.97%',
    'KOSDAQ 826\\.87 🟠 \\-0\\.03%',
    '',
    '₿ *크립토 24시간*',
    'BTC $78,332 🟠 \\-0\\.99%',
    'ETH $2,459 🟠 \\-0\\.76%',
    '',
    '🧭 *오프닝 브리지*',
    '미국 선물은 위험선호 우위 · 금리 상승은 성장주에 부담 · 달러 강세와 원화 약세 동반 · 한국장 강세 이후 미국 선물도 강세 · 크립토는 주식 대비 약세',
    '',
    '출처: Yahoo Finance · 네이버 금융 · Coinbase',
  ].join('\n'))
})
