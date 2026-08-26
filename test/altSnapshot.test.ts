import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  ALT_SNAPSHOT_ASSETS,
  buildAltSnapshotMessage,
  getPriceDirection,
  isRetiredSnapshotDedupeKey,
  parseCoinbaseSpotPrice,
  parseObservedSnapshotPrice,
} from '../lib/altSnapshotConfig.ts'
import {
  ATH_ETH_INDEX_BASELINE,
  buildAthEthIndexMessage,
  calculateAthEthIndex,
  getAthEthIndexSignal,
} from '../lib/athEthIndexConfig.ts'

test('replaces STRC with HYPE and ENA snapshot assets', () => {
  assert.deepEqual(
    ALT_SNAPSHOT_ASSETS.map(({ symbol, providerSymbol }) => ({ symbol, providerSymbol })),
    [
      { symbol: 'HYPE', providerSymbol: 'HYPE-USD' },
      { symbol: 'ENA', providerSymbol: 'ENA-USD' },
    ],
  )
  assert.equal(ALT_SNAPSHOT_ASSETS.some(({ symbol }) => symbol === 'STRC'), false)
})

test('uses the existing up down and flat price-change indicators', () => {
  assert.equal(getPriceDirection(78.59, 78.58), 'up')
  assert.equal(getPriceDirection(0.1554, 0.1555), 'down')
  assert.equal(getPriceDirection(1, 1), 'flat')
  assert.equal(getPriceDirection(1, null), 'flat')

  assert.equal(buildAltSnapshotMessage('HYPE', 78.586, 'up'), '🟢 HYPE $78\\.59')
  assert.equal(buildAltSnapshotMessage('ENA', 0.15548, 'down'), '🔴 ENA $0\\.1555')
  assert.equal(buildAltSnapshotMessage('ENA', 0.1555, 'flat'), '⚪ ENA $0\\.1555')
})

test('scheduler migration unregisters the legacy STRC task before registering alt snapshots', () => {
  const registerScript = readFileSync(
    new URL('../scripts/scheduler/Register-BcnewsScheduledTasks.ps1', import.meta.url),
    'utf8',
  )
  assert.match(registerScript, /Unregister-ScheduledTask\s+-TaskName\s+'BCN-StrcSnapshot-Hourly'/)
  assert.match(registerScript, /Name\s*=\s*'BCN-AltSnapshot-Hourly'/)
  assert.doesNotMatch(registerScript, /Name\s*=\s*'BCN-StrcSnapshot-Hourly'/)
})

test('scheduled jobs use wscript launchers so no console window can flash', () => {
  const registerScript = readFileSync(
    new URL('../scripts/scheduler/Register-BcnewsScheduledTasks.ps1', import.meta.url),
    'utf8',
  )
  assert.match(registerScript, /wscript\.exe/i)
  assert.doesNotMatch(registerScript, /New-ScheduledTaskAction\s+-Execute\s+\$powerShell/)
  for (const launcher of [
    'Run-BcnewsIngest-Hidden.vbs',
    'Run-BcnewsSendPending-Hidden.vbs',
    'Run-BcnewsBtcSnapshot-Hidden.vbs',
    'Run-BcnewsAltSnapshot-Hidden.vbs',
  ]) {
    assert.match(registerScript, new RegExp(launcher.replace('.', '\\.')))
  }
})

test('rejects malformed prior snapshot prices instead of showing a false direction', () => {
  assert.equal(parseObservedSnapshotPrice('https://example.com/?observed=0.15548'), 0.15548)
  assert.throws(() => parseObservedSnapshotPrice('https://example.com/'), /invalid_previous_snapshot_price/)
  assert.throws(() => parseObservedSnapshotPrice('https://example.com/?observed=oops'), /invalid_previous_snapshot_price/)
  assert.throws(() => parseObservedSnapshotPrice('not-a-url'), /invalid_previous_snapshot_price/)
})

test('parses valid Coinbase spot prices and rejects malformed responses', () => {
  assert.equal(parseCoinbaseSpotPrice({ data: { amount: '78.455' } }), 78.455)
  assert.equal(parseCoinbaseSpotPrice({ data: { amount: '0.1535' } }), 0.1535)
  assert.throws(() => parseCoinbaseSpotPrice({ data: {} }), /invalid_coinbase_spot_price/)
  assert.throws(() => parseCoinbaseSpotPrice({ data: { amount: 'oops' } }), /invalid_coinbase_spot_price/)
})

test('ATH ETH index uses the agreed 2026-08-26 baseline as 100', () => {
  assert.equal(ATH_ETH_INDEX_BASELINE.athKrw, 6.91)
  assert.equal(ATH_ETH_INDEX_BASELINE.ethKrw, 3_426_000)
  assert.equal(calculateAthEthIndex(6.91, 3_426_000), 100)
  assert.equal(calculateAthEthIndex(7.3937, 3_426_000), 107)
  assert.throws(() => calculateAthEthIndex(0, 3_426_000), /invalid_ath_eth_index_price/)
  assert.throws(() => calculateAthEthIndex(6.91, Number.NaN), /invalid_ath_eth_index_price/)
})

test('ATH ETH index maps risk and rotation thresholds to clear signals', () => {
  assert.equal(getAthEthIndexSignal(89.9).label, '위험선 하회')
  assert.equal(getAthEthIndexSignal(90).label, '위험선 도달')
  assert.equal(getAthEthIndexSignal(100).label, '대기 구간')
  assert.equal(getAthEthIndexSignal(107).label, '1차 전환선 도달')
  assert.equal(getAthEthIndexSignal(119).label, '2차 전환선 도달')
  assert.equal(getAthEthIndexSignal(131).label, '3차 전환선 도달')
})

test('ATH ETH index builds a compact Telegram MarkdownV2 channel post', () => {
  assert.equal(
    buildAthEthIndexMessage({ athPrice: 0.00496, ethPrice: 2462.61, index: 99.9 }),
    [
      '📊 *ATH/ETH 상대강도 지수 99\\.9*',
      '⚪ 대기 구간',
      'ATH $0\\.00496 · ETH $2,463',
      '기준 2026\\-08\\-26 \\= 100 · 전환 107 / 119 / 131 · 위험 90',
    ].join('\n'),
  )
})

test('alt snapshot route queues ATH ETH before unrelated asset snapshots', () => {
  const route = readFileSync(new URL('../app/api/jobs/alt-snapshots/route.ts', import.meta.url), 'utf8')
  assert.match(route, /fetchAthEthIndexSnapshot/)
  assert.match(route, /queueHourlyAthEthIndexPost/)
  assert.match(route, /symbol:\s*'ATH\/ETH'/)
  assert.ok(route.indexOf('fetchAthEthIndexSnapshot()') < route.indexOf('for (const asset of ALT_SNAPSHOT_ASSETS)'))
})

test('ATH ETH queue retries failed rows and treats unique races as duplicates', () => {
  const posting = readFileSync(new URL('../lib/altSnapshotPosting.ts', import.meta.url), 'utf8')
  assert.match(posting, /existing\.status === 'failed'/)
  assert.match(posting, /status:\s*'pending'/)
  assert.match(posting, /23505/)
})

test('posting endpoints never accept a public environment variable as their secret', () => {
  const altRoute = readFileSync(new URL('../app/api/jobs/alt-snapshots/route.ts', import.meta.url), 'utf8')
  const sendRoute = readFileSync(new URL('../app/api/jobs/send-pending/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(altRoute, /NEXT_PUBLIC_CRON_SECRET/)
  assert.doesNotMatch(sendRoute, /NEXT_PUBLIC_CRON_SECRET/)
})

test('retired STRC snapshot rows are identified before any Telegram send', () => {
  assert.equal(isRetiredSnapshotDedupeKey('strc_snapshot_hourly:STRC:2026-08-23-07'), true)
  assert.equal(isRetiredSnapshotDedupeKey('alt_snapshot_hourly:HYPE:2026-08-23-07'), false)

  const apiWorker = readFileSync(new URL('../app/api/jobs/send-pending/route.ts', import.meta.url), 'utf8')
  const scriptWorker = readFileSync(new URL('../scripts/sendPendingChannelPosts.mjs', import.meta.url), 'utf8')
  assert.match(apiWorker, /isRetiredSnapshotDedupeKey/)
  assert.match(scriptWorker, /strc_snapshot_hourly:/)
  assert.ok(apiWorker.indexOf('const claim = await claimPendingChannelPost') < apiWorker.lastIndexOf('isRetiredSnapshotDedupeKey'))
  assert.ok(scriptWorker.indexOf(".update({ status: 'sending'") < scriptWorker.indexOf("startsWith('strc_snapshot_hourly:')"))
})
