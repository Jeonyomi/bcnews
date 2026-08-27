import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildBreakingBridgeDedupeKey,
  calculateFreshSeriesChange,
  calculateSeriesChange,
  evaluateBreakingSignals,
  parseCoinbaseCandleSeries,
  parseYahooCandleSeries,
  selectPrimarySignal,
  type BreakingBridgeSnapshot,
} from '../lib/mbaiBreakingBridgeConfig.ts'

test('BREAKING BRIDGE parses ordered Yahoo and Coinbase candles and calculates a true lookback change', () => {
  const yahoo = parseYahooCandleSeries({ chart: { result: [{
    timestamp: [1000, 1300, 1600, 1900],
    indicators: { quote: [{ close: [100, null, 102, 104] }] },
  }] } }, 'ES=F')
  assert.deepEqual(yahoo.points, [
    { timestamp: 1000, value: 100 },
    { timestamp: 1600, value: 102 },
    { timestamp: 1900, value: 104 },
  ])
  assert.equal(calculateSeriesChange(yahoo, 15), 4)

  const coinbase = parseCoinbaseCandleSeries([
    [1900, 0, 0, 0, 104, 0],
    [1600, 0, 0, 0, 102, 0],
    [1000, 0, 0, 0, 100, 0],
  ], 'BTC-USD')
  assert.deepEqual(coinbase.points, yahoo.points)
  assert.throws(() => calculateSeriesChange(yahoo, 60), /insufficient_series_lookback/)
  assert.equal(calculateFreshSeriesChange(yahoo, 15, '1970-01-01T00:33:20.000Z', 10), 4)
  assert.equal(calculateFreshSeriesChange(yahoo, 15, '1970-01-01T01:00:00.000Z', 10), null)
  assert.equal(calculateFreshSeriesChange({
    symbol: 'GAPPED',
    points: [{ timestamp: 1000, value: 100 }, { timestamp: 1900, value: 104 }],
  }, 5, '1970-01-01T00:33:20.000Z', 5), null)
})

const baseSnapshot = (overrides: Partial<BreakingBridgeSnapshot> = {}): BreakingBridgeSnapshot => ({
  observedAt: '2026-08-27T06:07:00.000Z',
  es30: 0.1,
  nq30: 0.1,
  tnx30Bps: 1,
  dxy30: 0.05,
  krw30: 0.05,
  btc60: 0.2,
  eth60: 0.2,
  ...overrides,
})

test('BREAKING BRIDGE stays silent below thresholds', () => {
  assert.deepEqual(evaluateBreakingSignals(baseSnapshot()), [])
})

test('BREAKING BRIDGE ignores stale inactive markets while retaining a live crypto shock', () => {
  const signals = evaluateBreakingSignals(baseSnapshot({
    es30: null,
    nq30: null,
    tnx30Bps: null,
    dxy30: null,
    krw30: null,
    btc60: -2.4,
    eth60: -2.2,
  }))
  assert.deepEqual(signals.map(({ id }) => id), ['CRYPTO_SHOCK'])
})

test('BREAKING BRIDGE detects rate, futures, FX, crypto, and cross-market divergence signals', () => {
  const signals = evaluateBreakingSignals(baseSnapshot({
    es30: 0.8,
    nq30: 1,
    tnx30Bps: 6,
    dxy30: 0.45,
    krw30: 0.6,
    btc60: -2.2,
    eth60: -2,
  }))
  assert.deepEqual(signals.map(({ id }) => id).sort(), [
    'CRYPTO_SHOCK', 'FX_SHOCK', 'RATE_SHOCK', 'RISK_DIVERGENCE', 'US_FUTURES_SHOCK',
  ])
  assert.equal(selectPrimarySignal(signals)?.id, 'RISK_DIVERGENCE')
})

test('BREAKING BRIDGE dedupe uses signal direction and a two-hour UTC cooldown bucket', () => {
  const signal = evaluateBreakingSignals(baseSnapshot({ tnx30Bps: 7 }))[0]
  assert.equal(buildBreakingBridgeDedupeKey(signal, '2026-08-27T06:07:00.000Z'), 'mbai_breaking_bridge:rate_shock:up:2026-08-27T06')
  assert.equal(buildBreakingBridgeDedupeKey(signal, '2026-08-27T07:59:59.000Z'), 'mbai_breaking_bridge:rate_shock:up:2026-08-27T06')
  assert.equal(buildBreakingBridgeDedupeKey(signal, '2026-08-27T08:00:00.000Z'), 'mbai_breaking_bridge:rate_shock:up:2026-08-27T08')
})
