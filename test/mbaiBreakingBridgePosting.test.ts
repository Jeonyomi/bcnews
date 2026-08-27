import test from 'node:test'
import assert from 'node:assert/strict'

import { evaluateBreakingSignals, selectPrimarySignal } from '../lib/mbaiBreakingBridgeConfig.ts'
import { fetchBreakingBridgeSnapshot, queueBreakingBridgePost } from '../lib/mbaiBreakingBridgePosting.ts'

const response = (payload: any, status = 200) => new Response(JSON.stringify(payload), { status })
const observedAt = '2026-08-27T06:10:00.000Z'
const end = Date.parse(observedAt) / 1000 - 60
const yahoo = (baseline: number, latest: number, stale = false) => {
  const last = stale ? end - 3600 : end
  return { chart: { result: [{
    timestamp: [last - 3600, last - 1800, last],
    indicators: { quote: [{ close: [baseline, baseline, latest] }] },
  }] } }
}
const coinbase = (baseline: number, latest: number, stale = false) => {
  const last = stale ? end - 3600 : end
  return [
    [last, 0, 0, 0, latest, 0],
    [last - 1800, 0, 0, 0, baseline, 0],
    [last - 3600, 0, 0, 0, baseline, 0],
  ]
}
const payloadFor = (url: string, staleYahoo = false, staleCrypto = false) => {
  if (url.includes('ES%3DF')) return yahoo(100, 100.8, staleYahoo)
  if (url.includes('NQ%3DF')) return yahoo(100, 101, staleYahoo)
  if (url.includes('%5ETNX')) return yahoo(4.6, 4.66, staleYahoo)
  if (url.includes('DX-Y.NYB')) return yahoo(100, 100.45, staleYahoo)
  if (url.includes('KRW%3DX')) return yahoo(100, 100.6, staleYahoo)
  if (url.includes('BTC-USD')) return coinbase(100, 97.8, staleCrypto)
  if (url.includes('ETH-USD')) return coinbase(100, 98, staleCrypto)
  throw new Error(`unexpected_url:${url}`)
}

test('BREAKING BRIDGE fetches seven bounded candle sources and builds fresh window metrics', async () => {
  const calls: Array<RequestInit | undefined> = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(init)
    return response(payloadFor(String(input)))
  }) as typeof fetch
  const snapshot = await fetchBreakingBridgeSnapshot(fetchImpl, observedAt)
  assert.equal(calls.length, 7)
  assert.ok(calls.every((init) => init?.signal instanceof AbortSignal))
  assert.deepEqual(snapshot, {
    observedAt,
    es30: 0.8,
    nq30: 1,
    tnx30Bps: 6,
    dxy30: 0.45,
    krw30: 0.6,
    btc60: -2.2,
    eth60: -2,
  })
})

test('BREAKING BRIDGE excludes stale closed markets and rejects non-2xx without leaking payloads', async () => {
  const staleYahoo = (async (input: string | URL | Request) => response(payloadFor(String(input), true))) as typeof fetch
  const snapshot = await fetchBreakingBridgeSnapshot(staleYahoo, observedAt)
  assert.deepEqual([snapshot.es30, snapshot.nq30, snapshot.tnx30Bps, snapshot.dxy30, snapshot.krw30], [null, null, null, null, null])
  assert.deepEqual(evaluateBreakingSignals(snapshot).map(({ id }) => id), ['CRYPTO_SHOCK'])

  const failed = (async (input: string | URL | Request) => {
    if (String(input).includes('ES%3DF')) return response({ internal: 'do-not-leak' }, 429)
    return response(payloadFor(String(input)))
  }) as typeof fetch
  await assert.rejects(() => fetchBreakingBridgeSnapshot(failed, observedAt), /^Error: mbai_breaking_bridge_fetch_failed:ES=F:429$/)
})

class Client {
  rows: any[]
  loseFailedUpdate = false
  constructor(rows: any[] = []) { this.rows = rows }
  async rpc(name: string, args: any) {
    assert.equal(name, 'queue_mbai_breaking_bridge_post')
    const exact = this.rows.find((row) => row.dedupe_key === args.p_dedupe_key)
    if (exact && exact.status !== 'failed') {
      return { data: { queued: false, reason: 'skipped_duplicate', id: exact.id }, error: null }
    }
    const since = Date.parse(args.p_observed_at) - 2 * 60 * 60 * 1000
    const recent = this.rows.find((row) =>
      row.lane === 'mbai_breaking_bridge'
      && ['pending', 'sending', 'posted'].includes(row.status)
      && [args.p_signal_id, args.p_direction].every((value: string) => row.tags?.includes(value))
      && Math.max(Date.parse(row.created_at), Date.parse(row.updated_at || row.created_at)) >= since)
    if (recent) return { data: { queued: false, reason: 'skipped_duplicate', id: recent.id }, error: null }
    if (exact?.status === 'failed') {
      if (this.loseFailedUpdate) {
        exact.status = 'pending'
        return { data: { queued: false, reason: 'skipped_duplicate', id: exact.id }, error: null }
      }
      Object.assign(exact, {
        status: 'pending',
        lane: 'mbai_breaking_bridge',
        target_channel: '@MBAI_ch',
        tags: args.p_tags,
        post_text: args.p_post_text,
        updated_at: args.p_observed_at,
      })
      return { data: { queued: true, reason: 'queued_worker', id: exact.id }, error: null }
    }
    const row = {
      id: this.rows.length + 1,
      status: 'pending',
      lane: 'mbai_breaking_bridge',
      source_name: args.p_source_name,
      headline: args.p_headline,
      article_url: args.p_article_url,
      tags: args.p_tags,
      post_text: args.p_post_text,
      target_channel: args.p_target_channel,
      target_admin: args.p_target_admin,
      dedupe_key: args.p_dedupe_key,
      created_at: args.p_observed_at,
    }
    this.rows.push(row)
    return { data: { queued: true, reason: 'queued_worker', id: row.id }, error: null }
  }
}
const liveSnapshot = async () => fetchBreakingBridgeSnapshot(
  (async (input: string | URL | Request) => response(payloadFor(String(input)))) as typeof fetch,
  observedAt,
)

test('BREAKING BRIDGE queues only to MB.AI once per signal cooldown bucket', async () => {
  const snapshot = await liveSnapshot()
  const primary = selectPrimarySignal(evaluateBreakingSignals(snapshot))
  assert.ok(primary)
  const client = new Client()
  const first = await queueBreakingBridgePost(client, snapshot, primary)
  const second = await queueBreakingBridgePost(client, snapshot, primary)
  assert.equal(first.queued, true)
  assert.equal(second.queued, false)
  assert.equal(client.rows.length, 1)
  assert.equal(client.rows[0].lane, 'mbai_breaking_bridge')
  assert.equal(client.rows[0].target_channel, '@MBAI_ch')
  assert.equal(client.rows[0].dedupe_key, 'mbai_breaking_bridge:risk_divergence:stocks_up_crypto_down:2026-08-27T06')
})

test('BREAKING BRIDGE atomically retries failed rows and loses a retry race safely', async () => {
  const snapshot = await liveSnapshot()
  const primary = selectPrimarySignal(evaluateBreakingSignals(snapshot))
  assert.ok(primary)
  const key = 'mbai_breaking_bridge:risk_divergence:stocks_up_crypto_down:2026-08-27T06'
  const retryClient = new Client([{ id: 7, status: 'failed', dedupe_key: key }])
  assert.equal((await queueBreakingBridgePost(retryClient, snapshot, primary)).queued, true)
  assert.equal(retryClient.rows[0].status, 'pending')

  const raceClient = new Client([{ id: 8, status: 'failed', dedupe_key: key }])
  raceClient.loseFailedUpdate = true
  assert.equal((await queueBreakingBridgePost(raceClient, snapshot, primary)).queued, false)
})

test('BREAKING BRIDGE does not retry a failed bucket when the same signal was recently posted', async () => {
  const snapshot = await liveSnapshot()
  const primary = selectPrimarySignal(evaluateBreakingSignals(snapshot))
  assert.ok(primary)
  const key = 'mbai_breaking_bridge:risk_divergence:stocks_up_crypto_down:2026-08-27T06'
  const client = new Client([
    { id: 7, status: 'failed', dedupe_key: key },
    {
      id: 6,
      status: 'posted',
      lane: 'mbai_breaking_bridge',
      dedupe_key: 'mbai_breaking_bridge:risk_divergence:stocks_up_crypto_down:2026-08-27T04',
      tags: ['RISK_DIVERGENCE', 'stocks_up_crypto_down'],
      created_at: '2026-08-27T05:30:00.000Z',
    },
  ])
  assert.equal((await queueBreakingBridgePost(client, snapshot, primary)).queued, false)
  assert.equal(client.rows[0].status, 'failed')
})

test('BREAKING BRIDGE cooldown starts again from a late failed-row retry', async () => {
  const retrySnapshot = { ...(await liveSnapshot()), observedAt: '2026-08-27T07:59:00.000Z' }
  const primary = selectPrimarySignal(evaluateBreakingSignals(retrySnapshot))
  assert.ok(primary)
  const client = new Client([{
    id: 7,
    status: 'failed',
    dedupe_key: 'mbai_breaking_bridge:risk_divergence:stocks_up_crypto_down:2026-08-27T06',
    created_at: '2026-08-27T06:01:00.000Z',
    updated_at: '2026-08-27T06:02:00.000Z',
  }])
  assert.equal((await queueBreakingBridgePost(client, retrySnapshot, primary)).queued, true)

  const nextBucket = { ...retrySnapshot, observedAt: '2026-08-27T08:03:00.000Z' }
  assert.equal((await queueBreakingBridgePost(client, nextBucket, primary)).queued, false)
  assert.equal(client.rows.length, 1)
})

test('BREAKING BRIDGE enforces a rolling cooldown across adjacent UTC buckets', async () => {
  const firstSnapshot = { ...(await liveSnapshot()), observedAt: '2026-08-27T07:59:00.000Z' }
  const primary = selectPrimarySignal(evaluateBreakingSignals(firstSnapshot))
  assert.ok(primary)
  const client = new Client()
  assert.equal((await queueBreakingBridgePost(client, firstSnapshot, primary)).queued, true)
  client.rows[0].created_at = firstSnapshot.observedAt

  const boundarySnapshot = { ...firstSnapshot, observedAt: '2026-08-27T08:01:00.000Z' }
  assert.equal((await queueBreakingBridgePost(client, boundarySnapshot, primary)).queued, false)
  assert.equal(client.rows.length, 1)
})
