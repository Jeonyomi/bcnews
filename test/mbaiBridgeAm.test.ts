import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildBridgeAmDedupeKey,
  buildBridgeAmMessage,
  calculateChangePercent,
  parseCoinbaseDailyStats,
  parseYahooDailyPoint,
} from '../lib/mbaiBridgeAmConfig.ts'

test('BRIDGE AM parses market data and calculates verified changes', () => {
  const yahoo = parseYahooDailyPoint({
    chart: {
      result: [{
        timestamp: [1787529600, 1787616000, 1787702400],
        indicators: { quote: [{ close: [100, null, 102] }] },
      }],
    },
  }, '^GSPC')

  assert.deepEqual(yahoo, { symbol: '^GSPC', previous: 100, value: 102, changePercent: 2, asOfDate: '2026-08-26' })
  assert.equal(calculateChangePercent(4.704, 4.639), -1.38)

  const coinbase = parseCoinbaseDailyStats({ open: '80000', last: '78400' }, 'BTC-USD')
  assert.deepEqual(coinbase, { symbol: 'BTC-USD', open: 80000, value: 78400, changePercent: -2 })
})

test('BRIDGE AM rejects incomplete or invalid upstream market data', () => {
  assert.throws(() => parseYahooDailyPoint({ chart: { result: [] } }, '^GSPC'), /invalid_yahoo_chart/)
  assert.throws(
    () => parseYahooDailyPoint({ chart: { result: [{ indicators: { quote: [{ close: [100] }] } }] } }, '^GSPC'),
    /insufficient_yahoo_closes/,
  )
  assert.throws(() => parseCoinbaseDailyStats({ open: '0', last: '10' }, 'BTC-USD'), /invalid_coinbase_stats/)
})

test('BRIDGE AM builds a sourced cross-market MarkdownV2 briefing', () => {
  const message = buildBridgeAmMessage({
    dateKey: '2026-08-27',
    sp500: { symbol: '^GSPC', previous: 7652.86, value: 7677.28, changePercent: 0.32, asOfDate: '2026-08-26' },
    nasdaq: { symbol: '^IXIC', previous: 25980.19, value: 26151.3, changePercent: 0.66, asOfDate: '2026-08-26' },
    dow: { symbol: '^DJI', previous: 53417.16, value: 53577.4, changePercent: 0.3, asOfDate: '2026-08-26' },
    treasury10y: { symbol: '^TNX', previous: 4.704, value: 4.639, changePercent: -1.38, asOfDate: '2026-08-26' },
    dxy: { symbol: 'DX-Y.NYB', previous: 98.92, value: 99, changePercent: 0.08, asOfDate: '2026-08-26' },
    usdKrw: { symbol: 'KRW=X', previous: 1380.76, value: 1384.74, changePercent: 0.29, asOfDate: '2026-08-26' },
    btc: { symbol: 'BTC-USD', open: 79176.86, value: 78450.3, changePercent: -0.92 },
    eth: { symbol: 'ETH-USD', open: 2473.73, value: 2448.44, changePercent: -1.02 },
  })

  assert.equal(buildBridgeAmDedupeKey('2026-08-27'), 'mbai_bridge_am:2026-08-27')
  assert.equal(message, [
    '🌉 *BRIDGE AM \\| 2026\\-08\\-27*',
    '',
    '🇺🇸 *미국장 마감 · 2026\\-08\\-26*',
    'S&P 500 7,677\\.28 🟢 \\+0\\.32%',
    'NASDAQ 26,151\\.30 🟢 \\+0\\.66%',
    'DOW 53,577\\.40 🟢 \\+0\\.30%',
    '',
    '🌐 *연결 지표*',
    '미 10년물 4\\.64% 🔵 \\-6\\.5bp',
    '달러지수 99\\.00 🟢 \\+0\\.08%',
    'USD/KRW 1,384\\.74 🔴 \\+0\\.29%',
    '',
    '₿ *크립토 24시간*',
    'BTC $78,450 🟠 \\-0\\.92%',
    'ETH $2,448 🟠 \\-1\\.02%',
    '',
    '🧭 *오늘의 브리지*',
    '미국 증시는 위험선호 우위 · 금리 하락은 성장주에 우호적 · 원화 약세는 외국인 수급 부담 · 크립토는 미국 증시 대비 약세',
    '',
    '출처: Yahoo Finance · Coinbase',
  ].join('\n'))
})

test('BRIDGE AM integration is isolated, authenticated, retryable, and scheduled for weekdays at 07:40', () => {
  const posting = readFileSync(new URL('../lib/mbaiBridgeAmPosting.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/jobs/mbai-bridge-am/route.ts', import.meta.url), 'utf8')
  const register = readFileSync(new URL('../scripts/scheduler/Register-BcnewsMbaiBridgeAmTask.ps1', import.meta.url), 'utf8')
  const launcher = readFileSync(new URL('../scripts/scheduler/Run-BcnewsMbaiBridgeAm-Hidden.vbs', import.meta.url), 'utf8')

  assert.match(posting, /MBAI_TARGET_CHANNEL\s*\|\|\s*'@MBAI_ch'/)
  assert.match(posting, /MBAI_BRIDGE_AM_LANE\s*=\s*'mbai_bridge_am'/)
  for (const symbol of ['%5EGSPC', '%5EIXIC', '%5EDJI', '%5ETNX', 'DX-Y.NYB', 'KRW%3DX']) {
    assert.match(posting, new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(posting, /BTC-USD\/stats/)
  assert.match(posting, /ETH-USD\/stats/)
  assert.match(posting, /existing\.status === 'failed'/)
  assert.match(posting, /23505/)

  assert.match(route, /x-cron-secret/)
  assert.doesNotMatch(route, /NEXT_PUBLIC_CRON_SECRET/)
  assert.match(route, /queueBridgeAmPost/)

  assert.match(register, /BCN-MBAI-BridgeAM-0740/)
  assert.match(register, /Monday,Tuesday,Wednesday,Thursday,Friday/)
  assert.match(register, /07:40/)
  assert.match(register, /wscript\.exe/i)
  assert.match(launcher, /Run-BcnewsMbaiBridgeAm\.ps1/)
})
