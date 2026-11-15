import test from 'node:test'
import assert from 'node:assert/strict'

import { ATH_ETH_INDEX_BASELINE } from '../lib/athEthIndexConfig.ts'
import { ATH_BTC_INDEX_BASELINE } from '../lib/athBtcIndexConfig.ts'
import * as config from '../lib/athAltIndexConfig.ts'

const ENA_SOURCE_URL = 'https://api.upbit.com/v1/candles/minutes/1?market=KRW-ENA&to=2026-08-26T07:10:00Z&count=1'
const ENA_SOURCE_SHA256 = '83ede821056f01562084bba06c3121fbec3cb3f0e53574f84ec264ed69e08c89'

test('ENA baseline preserves the ETH anchor with official same-minute KRW close provenance', () => {
  const baseline = config.ATH_ALT_INDEX_BASELINES?.ENA
  assert.ok(baseline, 'ENA baseline must exist')
  assert.equal(baseline.observedAt, ATH_ETH_INDEX_BASELINE.observedAt)
  assert.equal(baseline.observedAt, '2026-08-26T16:09:00+09:00')
  assert.equal(baseline.athKrw, ATH_ETH_INDEX_BASELINE.athKrw)
  assert.equal(baseline.athKrw, 6.91)
  assert.equal(baseline.quoteKrw, 200)
  assert.equal(baseline.baseRatio, 6.91 / 200)
  assert.equal(baseline.priceConvention, 'same-minute-close/native-KRW')
  assert.deepEqual(baseline.source, {
    provider: 'Upbit',
    market: 'KRW-ENA',
    interval: '1m',
    candleOpenAt: '2026-08-26T07:09:00Z',
    url: ENA_SOURCE_URL,
    sha256: ENA_SOURCE_SHA256,
  })
})

test('ZEC baseline derives the same-minute cross-BTC basis without inventing a native KRW quote', () => {
  const baseline = config.ATH_ALT_INDEX_BASELINES.ZEC
  assert.ok(baseline, 'ZEC cross-BTC baseline must exist')
  assert.equal(baseline.observedAt, ATH_ETH_INDEX_BASELINE.observedAt)
  assert.equal(baseline.observedAt, ATH_BTC_INDEX_BASELINE.observedAt)
  assert.equal(baseline.athKrw, ATH_ETH_INDEX_BASELINE.athKrw)
  assert.equal(baseline.observedZecBtc, 0.01000210)
  assert.equal(baseline.baseRatio, (6.91 / ATH_BTC_INDEX_BASELINE.btcKrw) / 0.01000210)
  assert.equal(baseline.priceConvention, 'same-minute-close/cross-BTC')
  assert.equal('quoteKrw' in baseline, false)
  assert.equal('zecKrw' in baseline, false)
  assert.deepEqual(baseline.source, {
    provider: 'Binance',
    market: 'ZECBTC',
    interval: '1m',
    candleOpenAt: '2026-08-26T07:09:00Z',
    openTime: 1787728140000,
    closeTime: 1787728199999,
    url: 'https://api.binance.com/api/v3/klines?symbol=ZECBTC&interval=1m&startTime=1787728140000&endTime=1787728199999&limit=1',
    sha256: '44a9ca175c2caadd4244083059cf14bdb269976ecfa8bdb41e9e7efdbb980f7b',
  })
})

test('both alt indices normalize the relative price ratio to 100 and round to one decimal', () => {
  assert.equal(typeof config.calculateAthAltIndex, 'function')
  const anchors = [
    ['ENA', 200],
    ['ZEC', ATH_BTC_INDEX_BASELINE.btcKrw * 0.01000210],
  ] as const
  for (const [symbol, quotePrice] of anchors) {
    assert.equal(config.calculateAthAltIndex(symbol, 6.91, quotePrice), 100)
    assert.equal(config.calculateAthAltIndex(symbol, 7.3937, quotePrice), 107)
    assert.equal(config.calculateAthAltIndex(symbol, 13.82, quotePrice), 200)
    assert.equal(config.calculateAthAltIndex(symbol, 6.91, quotePrice * 2), 50)
    assert.equal(config.calculateAthAltIndex(symbol, 13.82, quotePrice * 2), 100)
    assert.equal(config.calculateAthAltIndex(symbol, 6.91, quotePrice / 2), 200)
    assert.equal(config.calculateAthAltIndex(symbol, 6.914, quotePrice), 100.1)
    // Both current legs may use USD (or any other common currency).
    assert.equal(config.calculateAthAltIndex(symbol, 6.91 / 1400, quotePrice / 1400), 100)
  }
})

test('alt index input validation rejects unsupported symbols and invalid prices in either leg', () => {
  for (const symbol of ['BTC', 'ena', '', '__proto__', 'constructor', null, undefined, 1, {}]) {
    assert.throws(() => config.calculateAthAltIndex(symbol as config.AthAltIndexSymbol, 6.91, 200), /invalid_ath_alt_index_symbol$/)
  }
  for (const symbol of ['ENA', 'ZEC'] as const) {
    for (const invalid of [0, -0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '1', null, undefined]) {
      assert.throws(() => config.calculateAthAltIndex(symbol, invalid as number, 200), /invalid_ath_alt_index_price$/)
      assert.throws(() => config.calculateAthAltIndex(symbol, 6.91, invalid as number), /invalid_ath_alt_index_price$/)
    }
  }
})

test('alt indices refuse quotient overflow, underflow and rounded zero', () => {
  for (const symbol of ['ENA', 'ZEC'] as const) {
    for (const [athPrice, quotePrice] of [
      [Number.MAX_VALUE, Number.MIN_VALUE],
      [Number.MIN_VALUE, Number.MAX_VALUE],
      [Number.MAX_VALUE, 1],
      [1e-20, 1],
    ]) {
      assert.throws(() => config.calculateAthAltIndex(symbol, athPrice, quotePrice), /invalid_ath_alt_index$/)
    }
  }
})

test('alt index signal preserves ETH threshold boundaries with alt-specific validation', () => {
  assert.equal(typeof config.getAthAltIndexSignal, 'function')
  const cases = [
    [89.9, '🔴', '위험선 하회'],
    [90, '🔴', '위험선 도달'],
    [90.1, '⚪', '대기 구간'],
    [100, '⚪', '대기 구간'],
    [106.9, '⚪', '대기 구간'],
    [107, '🟢', '1차 전환선 도달'],
    [118.9, '🟢', '1차 전환선 도달'],
    [119, '🟢', '2차 전환선 도달'],
    [130.9, '🟢', '2차 전환선 도달'],
    [131, '🚀', '3차 전환선 도달'],
    [200, '🚀', '3차 전환선 도달'],
  ] as const
  for (const [index, emoji, label] of cases) {
    assert.deepEqual(config.getAthAltIndexSignal(index), { emoji, label })
  }
  for (const invalid of [0, -0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => config.getAthAltIndexSignal(invalid), /invalid_ath_alt_index$/)
  }
})

test('ENA message matches mobile MarkdownV2 with at most six escaped quote decimals', () => {
  assert.equal(typeof config.buildAthAltIndexMessage, 'function')
  assert.equal(
    config.buildAthAltIndexMessage('ENA', { athPrice: 0.00496, quotePrice: 0.142857, index: 99.9 }),
    [
      '📊 *ATH/ENA 상대강도 지수 99\\.9*',
      '⚪ 대기 구간',
      'ATH $0\\.00496 · ENA $0\\.142857',
      '기준 2026\\-08\\-26 \\= 100 · 전환 107 / 119 / 131 · 위험 90',
    ].join('\n'),
  )
  assert.equal(
    config.buildAthAltIndexMessage('ENA', { athPrice: 0.004960123456, quotePrice: 0.142857987, index: 119 }),
    [
      '📊 *ATH/ENA 상대강도 지수 119\\.0*',
      '🟢 2차 전환선 도달',
      'ATH $0\\.00496012 · ENA $0\\.142858',
      '기준 2026\\-08\\-26 \\= 100 · 전환 107 / 119 / 131 · 위험 90',
    ].join('\n'),
  )
})

test('ZEC message shows two escaped quote decimals and explicit BTC-cross baseline provenance', () => {
  assert.equal(
    config.buildAthAltIndexMessage('ZEC', { athPrice: 0.004960123456, quotePrice: 1_098.480625, index: 131 }),
    [
      '📊 *ATH/ZEC 상대강도 지수 131\\.0*',
      '🚀 3차 전환선 도달',
      'ATH $0\\.00496012 · ZEC $1,098\\.48',
      '기준 ZEC: BTC 교차환산',
      '기준 2026\\-08\\-26 \\= 100 · 전환 107 / 119 / 131 · 위험 90',
    ].join('\n'),
  )
  assert.equal(
    config.buildAthAltIndexMessage('ZEC', { athPrice: 0.00496, quotePrice: 98.129, index: 90 }),
    [
      '📊 *ATH/ZEC 상대강도 지수 90\\.0*',
      '🔴 위험선 도달',
      'ATH $0\\.00496 · ZEC $98\\.13',
      '기준 ZEC: BTC 교차환산',
      '기준 2026\\-08\\-26 \\= 100 · 전환 107 / 119 / 131 · 위험 90',
    ].join('\n'),
  )
})

test('alt messages reject invalid inputs instead of rendering malformed prices or indices', () => {
  for (const symbol of ['ENA', 'ZEC'] as const) {
    for (const invalid of [0, -0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(
        () => config.buildAthAltIndexMessage(symbol, { athPrice: invalid, quotePrice: 200, index: 100 }),
        /invalid_ath_alt_index_price$/,
      )
      assert.throws(
        () => config.buildAthAltIndexMessage(symbol, { athPrice: 6.91, quotePrice: invalid, index: 100 }),
        /invalid_ath_alt_index_price$/,
      )
      assert.throws(
        () => config.buildAthAltIndexMessage(symbol, { athPrice: 6.91, quotePrice: 200, index: invalid }),
        /invalid_ath_alt_index$/,
      )
    }
    for (const [athPrice, quotePrice] of [
      [Number.MAX_VALUE, Number.MIN_VALUE],
      [Number.MIN_VALUE, Number.MAX_VALUE],
      [Number.MAX_VALUE, 1],
      [1e-20, 1],
    ]) {
      assert.throws(
        () => config.buildAthAltIndexMessage(symbol, { athPrice, quotePrice, index: 100 }),
        /invalid_ath_alt_index$/,
      )
    }
  }
  for (const symbol of ['BTC', 'ena', '', '__proto__', 'constructor', null, undefined, 1, {}]) {
    assert.throws(
      () => config.buildAthAltIndexMessage(symbol as config.AthAltIndexSymbol, { athPrice: 6.91, quotePrice: 200, index: 100 }),
      /invalid_ath_alt_index_symbol$/,
    )
  }
})
