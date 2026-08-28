import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { fetchTurnoverLeaders, queueRequiredPick, retryRequiredPickOperation } from '../lib/mbaiHot24RequiredPicksPosting.ts'
import { parseCryptoVolumeLeaders } from '../lib/mbaiHot24RequiredPicks.ts'

const root = process.cwd()
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

test('news candidate lookup retries once after a transient failure', async () => {
  let attempts = 0
  const value = await retryRequiredPickOperation(async () => {
    attempts += 1
    if (attempts === 1) throw new Error('transient')
    return 'ok'
  })
  assert.equal(value, 'ok')
  assert.equal(attempts, 2)
})

test('market data fetch retries one transient non-2xx response', async () => {
  let attempts = 0
  const payload = { finance: { result: [{ quotes: [{ symbol: 'NVDA', longName: 'NVIDIA', quoteType: 'EQUITY', regularMarketPrice: 180, regularMarketVolume: 300_000_000, marketCap: 4_000_000_000_000, regularMarketChangePercent: 2.5, regularMarketTime: 1787893200 }] }] } }
  const fetchImpl = async () => {
    attempts += 1
    return attempts === 1
      ? new Response('temporary', { status: 503 })
      : new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const leaders = await fetchTurnoverLeaders('US', '2026-08-28T16:30:00.000Z', fetchImpl as typeof fetch)
  assert.equal(attempts, 2)
  assert.equal(leaders[0].symbol, 'NVDA')
})


test('Korea turnover keeps a successful segment when the other segment fails', async () => {
  const payload = { stocks: [{ itemCode: '000660', stockName: 'SK하이닉스', stockEndType: 'stock', closePriceRaw: '1653000', fluctuationsRatio: '2', accumulatedTradingValueRaw: '4000000000000', marketValueRaw: '1000000000000000', localTradedAt: '2026-08-28T15:56:00+09:00', tradableStatus: 'tradable' }] }
  const fetchImpl = async (input: URL | RequestInfo) => String(input).includes('/KOSPI?')
    ? new Response('temporary', { status: 503 })
    : new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
  const leaders = await fetchTurnoverLeaders('KOREA', '2026-08-28T07:10:00.000Z', fetchImpl as typeof fetch)
  assert.equal(leaders[0].symbol, '000660')
})

test('required pick queue uses a market-kind key, canonical tag and fail-closed MBAI target', async () => {
  let captured: any = null
  const client = {
    rpc: async (name: string, args: any) => {
      captured = { name, args }
      return { data: { queued: true, reason: 'queued_worker', id: 99 }, error: null }
    },
  }
  const asset = parseCryptoVolumeLeaders([{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 79000, total_volume: 55_000_000_000, market_cap: 1_500_000_000_000, price_change_percentage_24h: 2.1, last_updated: '2026-08-28T07:00:00.000Z' }], '2026-08-28T07:10:00.000Z')[0]
  const result = await queueRequiredPick(client, { market: 'CRYPTO', kind: 'ASSET', asset }, '2026-08-28T07:10:00.000Z')
  assert.equal(result.queued, true)
  assert.equal(captured.name, 'queue_mbai_hot24_post')
  assert.equal(captured.args.p_target_channel, '@MBAI_ch')
  assert.equal(captured.args.p_dedupe_key, 'mbai_hot24:2026-08-28:CRYPTO:ASSET')
  assert.equal(captured.args.p_issue_tag, 'Pick:ASSET:CRYPTO:BTC:20260828')
})

test('migration 010 permits only canonical six-pick tags and remains service-role-only', () => {
  const sql = read('migrations/010_mbai_hot24_required_picks.sql')
  assert.match(sql, /Pick:\(NEWS\|ASSET\):\(KOREA\|US\|CRYPTO\)/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /revoke all[\s\S]*anon, authenticated/i)
  assert.match(sql, /grant execute[\s\S]*service_role/i)
  assert.match(sql, /p_target_channel <> '@MBAI_ch'/)
})

test('required picks route supports dry-run slots and never queues in dry-run branch', () => {
  const route = read('app/api/jobs/mbai-hot24/route.ts')
  assert.match(route, /KOREA.*US.*CRYPTO/s)
  assert.match(route, /dryRun/)
  assert.match(route, /fetchRequiredPicksForMarket/)
  assert.match(route, /if \(dryRun\)[\s\S]*queued: false/)
  assert.match(route, /queueRequiredPick/)
})

test('three market schedulers run hidden at completed-market windows', () => {
  const register = read('scripts/scheduler/Register-BcnewsMbaiHot24Task.ps1')
  const launcher = read('scripts/scheduler/Run-BcnewsMbaiHot24-Hidden.vbs')
  const runner = read('scripts/scheduler/Run-BcnewsMbaiHot24.ps1')
  assert.match(register, /BCN-MBAI-Hot24-Korea-1605/)
  assert.match(register, /BCN-MBAI-Hot24-Crypto-2030/)
  assert.match(register, /BCN-MBAI-Hot24-USClose-NY1720/)
  assert.match(register, /06:20/)
  assert.match(register, /07:20/)
  assert.match(register, /Korea Standard Time/)
  assert.match(register, /wscript\.exe/i)
  assert.match(launcher, /\/\/B \/\/Nologo/i)
  assert.match(launcher, /-Slot/)
  assert.match(runner, /dry_run=false/)
})
