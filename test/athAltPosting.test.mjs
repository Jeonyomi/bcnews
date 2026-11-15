import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRoute } from './helpers/loadRoute.mjs'
import { existsSync } from 'node:fs'

const posting = options => existsSync('lib/athAltIndexPosting.ts')
  ? loadRoute('lib/athAltIndexPosting.ts', options).route : {}

const shared = { athPrice: 0.00445, ethPrice: 1932, index: 114.2, fetchedAt: '2026-11-15T11:00:05.000Z' }
const env = { CRON_SECRET: 'test-only' }
const request = () => new Request('https://example.test/api/jobs/alt-snapshots', { method: 'POST', headers: { 'x-cron-secret': 'test-only' } })
function fixture({ failSymbol = null } = {}) {
  const events = []
  const queued = symbol => ({ queued: true, reason: 'queued_worker', dedupeKey: symbol, postText: symbol })
  const { route } = loadRoute('app/api/jobs/alt-snapshots/route.ts', { client: {}, env,
    mocks: {
      '@/lib/altSnapshotPosting': {
        getAltSnapshotConfig: () => ({ enabled: true, targetChannel: '@Krypto_breaking' }),
        fetchAthEthIndexSnapshot: async () => shared,
        queueHourlyAthEthIndexPost: async () => { events.push('ATH/ETH'); return queued('ETH') },
        fetchAthBtcIndexSnapshot: async () => ({ ...shared, btcPrice: 68355 }),
        queueHourlyAthBtcIndexPost: async () => { events.push('ATH/BTC'); return queued('BTC') },
        fetchAltSnapshotPrice: async asset => ({ price: 10, fetchedAt: shared.fetchedAt }),
        getPreviousAltSnapshotPrice: async () => null,
        queueHourlyAltSnapshotPost: async (_client, asset) => { events.push(asset.symbol); return queued(asset.symbol) },
      },
      '@/lib/athAltIndexPosting': {
        fetchAthAltIndexSnapshot: async (symbol, snapshot) => {
          assert.strictEqual(snapshot, shared)
          if (symbol === failSymbol) throw new Error('quote unavailable')
          return { symbol, athPrice: snapshot.athPrice, quotePrice: symbol === 'ENA' ? 0.12 : 916.12, index: 100, fetchedAt: snapshot.fetchedAt }
        },
        queueHourlyAthAltIndexPost: async (_client, snapshot) => { events.push('ATH/' + snapshot.symbol); return queued('ATH/' + snapshot.symbol) },
      },
    },
  })
  return { route, events }
}

test('hourly route includes both ENA and ZEC relative indices without replacing existing feeds', async () => {
  const { route, events } = fixture()
  const response = await route.POST(request())
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.results.map(x => x.symbol), ['ATH/ETH', 'ATH/BTC', 'ATH/ENA', 'ATH/ZEC', 'HYPE', 'ENA'])
  assert.deepEqual(events, ['ATH/ETH', 'ATH/BTC', 'ATH/ENA', 'ATH/ZEC', 'HYPE', 'ENA'])
  assert.equal(body.results[2].quote_price, 0.12)
  assert.equal(body.results[3].quote_price, 916.12)
})

test('new pair fetches validated USD quotes while sharing this run’s ATH observation and hour', async () => {
  const calls = []
  const api = posting({ fetch: async url => {
    calls.push(url)
    const symbol = url.includes('ENA-USD') ? 'ENA' : 'ZEC'
    return Response.json({ data: { amount: symbol === 'ENA' ? '0.12' : '916.12', base: symbol, currency: 'USD' } })
  } })
  assert.equal(typeof api.fetchAthAltIndexSnapshot, 'function')
  for (const symbol of ['ENA', 'ZEC']) {
    const snapshot = await api.fetchAthAltIndexSnapshot(symbol, shared)
    assert.equal(snapshot.symbol, symbol)
    assert.equal(snapshot.athPrice, shared.athPrice)
    assert.equal(snapshot.fetchedAt, shared.fetchedAt)
    assert.ok(Number.isFinite(snapshot.index) && snapshot.index > 0)
    assert.equal(calls.at(-1), `https://api.coinbase.com/v2/prices/${symbol}-USD/spot`)
  }
  assert.equal(calls.length, 2)
})

test('one added pair failing cannot suppress the other pair or existing snapshots', async () => {
  for (const failSymbol of ['ENA', 'ZEC']) {
    const { route, events } = fixture({ failSymbol })
    const response = await route.POST(request())
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.results.find(x => x.symbol === 'ATH/' + failSymbol).error, 'ath_alt_index_unavailable')
    const other = failSymbol === 'ENA' ? 'ZEC' : 'ENA'
    assert.ok(events.includes('ATH/' + other))
    assert.ok(events.includes('HYPE') && events.includes('ENA'))
  }
})

function memoryQueue(initial = [], { insertError = null, loseRetry = false } = {}) {
  const rows = initial.map(x => ({ ...x })), writes = []
  return { rows, writes, from() {
    const filters = []; let update
    const q = {
      select() { return q }, order() { return q }, limit() { return q }, maybeSingle() { return q },
      eq(k, v) { filters.push(row => row[k] === v); return q },
      insert(row) { if (insertError) return Promise.resolve({ error: insertError }); rows.push({ ...row, id: rows.length + 1 }); writes.push(row); return Promise.resolve({ error: null }) },
      update(row) { if (loseRetry && rows[0]) rows[0].status = 'posted'; update = row; return q },
      then(resolve) {
        const found = rows.find(row => filters.every(f => f(row))) || null
        if (update && found) { Object.assign(found, update); writes.push(update) }
        return Promise.resolve({ data: found, error: null }).then(resolve)
      },
    }
    return q
  } }
}

test('new pair queues keep separate hourly identities and suppress duplicate calls', async () => {
  const api = posting({ fetch: async url => {
    const symbol = url.includes('ENA-USD') ? 'ENA' : 'ZEC'
    return Response.json({ data: { amount: symbol === 'ENA' ? '0.12' : '916.12', base: symbol, currency: 'USD' } })
  } })
  assert.equal(typeof api.queueHourlyAthAltIndexPost, 'function')
  const client = memoryQueue()
  for (const symbol of ['ENA', 'ZEC']) {
    const snapshot = await api.fetchAthAltIndexSnapshot(symbol, shared)
    const first = await api.queueHourlyAthAltIndexPost(client, snapshot)
    assert.equal(first.queued, true)
    assert.equal(first.dedupeKey, `ath_${symbol.toLowerCase()}_index_hourly:2026-11-15-11`)
    assert.equal((await api.queueHourlyAthAltIndexPost(client, snapshot)).queued, false)
  }
  assert.equal(client.rows.length, 2)
  assert.equal(client.writes.length, 2)
  assert.ok(client.rows.every(row => row.target_channel === '@Krypto_breaking' && row.status === 'pending'))
  assert.ok(client.rows.some(row => row.post_text.includes('ATH/ENA')))
  assert.ok(client.rows.some(row => row.post_text.includes('ATH/ZEC')))
})


test('new pair quotes reject provider failure, invalid amount and mismatched symbol/currency', async () => {
  for (const symbol of ['ENA', 'ZEC']) {
    for (const response of [
      Response.json({}, { status: 503 }),
      Response.json({ data: { amount: '0', base: symbol, currency: 'USD' } }),
      Response.json({ data: { amount: 'oops', base: symbol, currency: 'USD' } }),
      Response.json({ data: { amount: '1', base: 'ETH', currency: 'USD' } }),
      Response.json({ data: { amount: '1', base: symbol, currency: 'KRW' } }),
    ]) {
      const api = posting({ fetch: async () => response })
      await assert.rejects(api.fetchAthAltIndexSnapshot(symbol, shared))
    }
  }
})

test('new pair queues preserve posted rows, retry failed rows and refuse ambiguous retry ownership', async () => {
  const api = posting({ fetch: async () => Response.json({ data: { amount: '0.12', base: 'ENA', currency: 'USD' } }) })
  const snapshot = await api.fetchAthAltIndexSnapshot('ENA', shared)
  const key = 'ath_ena_index_hourly:2026-11-15-11'
  const failed = memoryQueue([{ id: 7, status: 'failed', dedupe_key: key }])
  assert.equal((await api.queueHourlyAthAltIndexPost(failed, snapshot)).queued, true)
  assert.equal(failed.rows.length, 1)
  assert.equal(failed.rows[0].status, 'pending')
  const posted = memoryQueue([{ id: 8, status: 'posted', dedupe_key: key }])
  assert.equal((await api.queueHourlyAthAltIndexPost(posted, snapshot)).queued, false)
  assert.equal(posted.writes.length, 0)
  const lost = memoryQueue([{ id: 9, status: 'failed', dedupe_key: key }], { loseRetry: true })
  assert.equal((await api.queueHourlyAthAltIndexPost(lost, snapshot)).queued, false)
  assert.equal(lost.writes.length, 0)
  const raced = memoryQueue([], { insertError: { code: '23505', message: 'duplicate key' } })
  assert.equal((await api.queueHourlyAthAltIndexPost(raced, snapshot)).queued, false)
  const broken = memoryQueue([], { insertError: { code: 'XX000', message: 'write failed' } })
  await assert.rejects(api.queueHourlyAthAltIndexPost(broken, snapshot))
  for (const invalid of [{ ...snapshot, index: 999 }, { ...snapshot, fetchedAt: 'bad' }]) {
    const client = memoryQueue()
    await assert.rejects(api.queueHourlyAthAltIndexPost(client, invalid))
    assert.equal(client.writes.length, 0)
  }
})
