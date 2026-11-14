import test from 'node:test'
import assert from 'node:assert/strict'

import { ATH_ETH_INDEX_BASELINE } from '../lib/athEthIndexConfig.ts'
import * as config from '../lib/athBtcIndexConfig.ts'

test('ATH BTC baseline uses the recovered same-minute close at the ETH baseline time', () => {
  assert.deepEqual(config.ATH_BTC_INDEX_BASELINE, {
    observedAt: '2026-08-26T16:09:00+09:00',
    athKrw: 6.91,
    btcKrw: 109_825_000,
  })
  assert.equal(config.ATH_BTC_INDEX_BASELINE.observedAt, ATH_ETH_INDEX_BASELINE.observedAt)
  assert.equal(config.ATH_BTC_INDEX_BASELINE.athKrw, ATH_ETH_INDEX_BASELINE.athKrw)
})

test('ATH BTC index normalizes the price ratio to 100 rather than tracking ATH alone', () => {
  assert.equal(typeof config.calculateAthBtcIndex, 'function')
  assert.equal(config.calculateAthBtcIndex(6.91, 109_825_000), 100)
  assert.equal(config.calculateAthBtcIndex(7.3937, 109_825_000), 107)
  assert.equal(config.calculateAthBtcIndex(13.82, 109_825_000), 200)
  assert.equal(config.calculateAthBtcIndex(6.91, 219_650_000), 50)
  assert.equal(config.calculateAthBtcIndex(13.82, 219_650_000), 100)
  assert.equal(config.calculateAthBtcIndex(6.91, 54_912_500), 200)
  assert.equal(config.calculateAthBtcIndex(6.914, 109_825_000), 100.1)
})

test('ATH BTC index rejects non-positive or non-finite prices in either leg', () => {
  for (const invalid of [0, -0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => config.calculateAthBtcIndex(invalid, 109_825_000), /invalid_ath_btc_index_price/)
    assert.throws(() => config.calculateAthBtcIndex(6.91, invalid), /invalid_ath_btc_index_price/)
  }
})

test('ATH BTC index refuses quotient overflow, underflow or a rounded zero', () => {
  for (const [athPrice, btcPrice] of [
    [Number.MAX_VALUE, Number.MIN_VALUE],
    [Number.MIN_VALUE, Number.MAX_VALUE],
    [Number.MAX_VALUE, 1],
    [1e-20, 1],
  ]) {
    assert.throws(() => config.calculateAthBtcIndex(athPrice, btcPrice), /invalid_ath_btc_index/)
  }
})

test('ATH BTC signal preserves the ETH risk and rotation threshold boundaries', () => {
  assert.equal(typeof config.getAthBtcIndexSignal, 'function')
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
    assert.deepEqual(config.getAthBtcIndexSignal(index), { emoji, label })
  }
})

test('ATH BTC signal rejects invalid indices with a BTC-specific error', () => {
  for (const invalid of [0, -0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => config.getAthBtcIndexSignal(invalid), /invalid_ath_btc_index$/)
  }
})

test('ATH BTC message matches compact ETH-style MarkdownV2 with BTC prices', () => {
  assert.equal(typeof config.buildAthBtcIndexMessage, 'function')
  assert.equal(
    config.buildAthBtcIndexMessage({ athPrice: 0.00496, btcPrice: 90_523.61, index: 99.9 }),
    [
      '📊 *ATH/BTC 상대강도 지수 99\\.9*',
      '⚪ 대기 구간',
      'ATH $0\\.00496 · BTC $90,524',
      '기준 2026\\-08\\-26 \\= 100 · 전환 107 / 119 / 131 · 위험 90',
    ].join('\n'),
  )
  assert.equal(
    config.buildAthBtcIndexMessage({ athPrice: 0.004960123456, btcPrice: 90_523.49, index: 119 }),
    [
      '📊 *ATH/BTC 상대강도 지수 119\\.0*',
      '🟢 2차 전환선 도달',
      'ATH $0\\.00496012 · BTC $90,523',
      '기준 2026\\-08\\-26 \\= 100 · 전환 107 / 119 / 131 · 위험 90',
    ].join('\n'),
  )
})

test('ATH BTC message refuses invalid prices instead of rendering them', () => {
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => config.buildAthBtcIndexMessage({ athPrice: invalid, btcPrice: 90_523, index: 100 }),
      /invalid_ath_btc_index_price/,
    )
    assert.throws(
      () => config.buildAthBtcIndexMessage({ athPrice: 0.00496, btcPrice: invalid, index: 100 }),
      /invalid_ath_btc_index_price/,
    )
  }
  for (const [athPrice, btcPrice] of [
    [Number.MAX_VALUE, Number.MIN_VALUE],
    [Number.MIN_VALUE, Number.MAX_VALUE],
  ]) {
    assert.throws(
      () => config.buildAthBtcIndexMessage({ athPrice, btcPrice, index: 100 }),
      /invalid_ath_btc_index$/,
    )
  }
})
