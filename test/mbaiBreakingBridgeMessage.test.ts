import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildBreakingBridgeMessage,
  evaluateBreakingSignals,
  selectPrimarySignal,
  type BreakingBridgeSnapshot,
} from '../lib/mbaiBreakingBridgeConfig.ts'

test('BREAKING BRIDGE explains what changed, why it matters, and what to watch next', () => {
  const snapshot: BreakingBridgeSnapshot = {
    observedAt: '2026-08-27T06:07:00.000Z',
    es30: 0.8,
    nq30: 1,
    tnx30Bps: 2.5,
    dxy30: 0.1,
    krw30: 0.2,
    btc60: -2.2,
    eth60: -2,
  }
  const primary = selectPrimarySignal(evaluateBreakingSignals(snapshot))
  assert.ok(primary)
  assert.equal(buildBreakingBridgeMessage(snapshot, primary), [
    '🚨 *BREAKING BRIDGE \\| 주식·크립토 괴리*',
    '기준 2026\\-08\\-27 15:07 KST',
    '',
    '⚡ *포착*',
    '미국 선물 평균 \\+0\\.90% · BTC/ETH 평균 \\-2\\.10%',
    '',
    '📊 *시장 반응*',
    'ES 30분 \\+0\\.80% · NQ 30분 \\+1\\.00%',
    '미 10년물 30분 \\+2\\.5bp',
    '달러지수 30분 \\+0\\.10% · USD/KRW 30분 \\+0\\.20%',
    'BTC 60분 \\-2\\.20% · ETH 60분 \\-2\\.00%',
    '',
    '🔗 *왜 중요한가*',
    '위험선호가 시장 전체로 확산된 것이 아니라 미국 주식 선물에 집중된 흐름입니다\\. 크립토 약세가 지속되면 고베타 자산 전반의 추격 강도는 제한될 수 있습니다\\.',
    '',
    '🎯 *다음 확인*',
    'NASDAQ 선물 강세 유지와 BTC·ETH 60분 낙폭 축소 여부',
    '',
    '출처: Yahoo Finance · Coinbase',
  ].join('\n'))
})

test('BREAKING BRIDGE futures narrative remains valid during both premarket and regular trading', () => {
  const snapshot: BreakingBridgeSnapshot = {
    observedAt: '2026-08-27T15:00:00.000Z',
    es30: 0.8,
    nq30: 1,
    tnx30Bps: 1,
    dxy30: 0.1,
    krw30: 0.1,
    btc60: 0.2,
    eth60: 0.2,
  }
  const primary = selectPrimarySignal(evaluateBreakingSignals(snapshot))
  assert.ok(primary)
  const message = buildBreakingBridgeMessage(snapshot, primary)
  assert.doesNotMatch(message, /개장 전/)
  assert.match(message, /미국 주식 위험선호/)
})

test('BREAKING BRIDGE FX narrative follows the metric that actually breached its threshold most', () => {
  const snapshot: BreakingBridgeSnapshot = {
    observedAt: '2026-08-27T06:07:00.000Z',
    es30: 0.1,
    nq30: 0.1,
    tnx30Bps: 1,
    dxy30: 0.5,
    krw30: -0.1,
    btc60: 0.2,
    eth60: 0.2,
  }
  const primary = selectPrimarySignal(evaluateBreakingSignals(snapshot))
  assert.ok(primary)
  const message = buildBreakingBridgeMessage(snapshot, primary)
  assert.match(message, /달러 강세가/)
  assert.doesNotMatch(message, /원화 강세는/)
})
