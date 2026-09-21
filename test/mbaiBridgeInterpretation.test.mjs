import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRoute } from './helpers/loadRoute.mjs'
const { buildBridgeInterpretation } = loadRoute('lib/mbaiBridgeAmConfig.ts').route
const snapshot = (stocks, btc, eth) => {
  const daily = changePercent => ({ previous: 100, value: 100 + changePercent, changePercent, asOfDate: '2026-09-18' })
  return { sp500: daily(stocks), nasdaq: daily(stocks), dow: daily(stocks), treasury10y: daily(0), usdKrw: daily(0), btc: { changePercent: btc }, eth: { changePercent: eth } }
}

test('both negative markets describe crypto decline without claiming relative underperformance', () => {
  const text = buildBridgeInterpretation(snapshot(-3, -1, -1))
  assert.match(text, /크립토는 최근 24시간 하락 흐름/)
  assert.doesNotMatch(text, /증시 대비/)
})

test('positive crypto does not claim outperformance when stocks rose more over a different window', () => {
  const text = buildBridgeInterpretation(snapshot(3, 1, 1))
  assert.match(text, /크립토는 최근 24시간 상승 흐름/)
  assert.doesNotMatch(text, /증시 대비/)
})
