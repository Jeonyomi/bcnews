import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRoute } from './helpers/loadRoute.mjs'

const ethSnapshot = { athPrice: 0.0044255, ethPrice: 1923, index: 114.1, fetchedAt: '2026-11-13T23:00:05.000Z' }
function routeFixture({ btcError = false } = {}) {
  const events = []
  const posting = {
    getAltSnapshotConfig: () => ({ enabled: true, targetChannel: '@Krypto_breaking' }),
    fetchAthEthIndexSnapshot: async () => ethSnapshot,
    queueHourlyAthEthIndexPost: async (_client, snapshot) => {
      events.push(['ETH', snapshot])
      return { queued: true, reason: 'queued_worker', dedupeKey: 'eth-key', postText: 'ETH summary' }
    },
    fetchAthBtcIndexSnapshot: async snapshot => {
      assert.strictEqual(snapshot, ethSnapshot, 'BTC must reuse this run’s ATH observation and hour')
      if (btcError) throw new Error('provider unavailable')
      return { athPrice: snapshot.athPrice, btcPrice: 68216, index: 103.1, fetchedAt: snapshot.fetchedAt }
    },
    queueHourlyAthBtcIndexPost: async (_client, snapshot) => {
      events.push(['BTC', snapshot])
      return { queued: true, reason: 'queued_worker', dedupeKey: 'btc-key', postText: 'BTC summary' }
    },
    fetchAltSnapshotPrice: async asset => { events.push([asset.symbol]); return { price: 10, fetchedAt: ethSnapshot.fetchedAt } },
    getPreviousAltSnapshotPrice: async () => null,
    queueHourlyAltSnapshotPost: async () => ({ queued: true, reason: 'queued_worker', dedupeKey: 'alt-key', postText: 'alt summary' }),
  }
  const { route, clientCount } = loadRoute('app/api/jobs/alt-snapshots/route.ts', {
    client: {}, env: { CRON_SECRET: 'test-only' }, mocks: { '@/lib/altSnapshotPosting': posting },
  })
  return { route, events, clientCount }
}
const authorized = () => new Request('https://example.test/api/jobs/alt-snapshots', { method: 'POST', headers: { 'x-cron-secret': 'test-only' } })

test('hourly route includes ATH/BTC beside ETH using the shared ATH observation', async () => {
  const { route, events } = routeFixture()
  const response = await route.POST(authorized())
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.results.map(x => x.symbol), ['ATH/ETH', 'ATH/BTC', 'HYPE', 'ENA'])
  assert.deepEqual(events.map(x => x[0]), ['ETH', 'BTC', 'HYPE', 'ENA'])
  assert.equal(body.results[1].ath_price, ethSnapshot.athPrice)
  assert.equal(body.results[1].btc_price, 68216)
  assert.equal(body.results[1].dedupe_key, 'btc-key')
})

test('BTC provider failure does not suppress existing ETH HYPE or ENA snapshots', async () => {
  const { route, events } = routeFixture({ btcError: true })
  const response = await route.POST(authorized())
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(events.map(x => x[0]), ['ETH', 'HYPE', 'ENA'])
  assert.equal(body.results.find(x => x.symbol === 'ATH/BTC').queued, false)
  assert.equal(body.results.find(x => x.symbol === 'ATH/BTC').error, 'ath_btc_index_unavailable')
  assert.equal(body.results.filter(x => x.queued).length, 3)
})

test('BTC snapshot fetch reuses ATH and hour and fetches only the BTC quote', async () => {
  const calls = []
  const { route } = loadRoute('lib/altSnapshotPosting.ts', { fetch: async (url, options) => {
    calls.push({ url, options })
    return Response.json({ data: { amount: '68216' } })
  } })
  assert.equal(typeof route.fetchAthBtcIndexSnapshot, 'function')
  const snapshot = await route.fetchAthBtcIndexSnapshot(ethSnapshot)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.coinbase.com/v2/prices/BTC-USD/spot')
  assert.equal(calls[0].options.cache, 'no-store')
  assert.equal(snapshot.athPrice, ethSnapshot.athPrice)
  assert.equal(snapshot.fetchedAt, ethSnapshot.fetchedAt)
  assert.equal(snapshot.btcPrice, 68216)
  assert.equal(snapshot.index, 103.1)
})

function queueClient(initial = [], insertError = null) {
  const rows = initial.map(x => ({ ...x }))
  const writes = []
  return { rows, writes, from() {
    const filters = []
    let update
    const q = {
      select() { return q }, order() { return q }, limit() { return q }, maybeSingle() { return q },
      eq(key, value) { filters.push(row => row[key] === value); return q },
      insert(row) {
        if (insertError) return Promise.resolve({ error: insertError })
        rows.push({ ...row, id: rows.length + 1 }); writes.push({ action: 'insert', row })
        return Promise.resolve({ error: null })
      },
      update(row) { update = row; return q },
      then(resolve) {
        const found = rows.find(row => filters.every(match => match(row))) || null
        if (update && found) { Object.assign(found, update); writes.push({ action: 'update', row: update }) }
        return Promise.resolve({ data: found, error: null }).then(resolve)
      },
    }
    return q
  } }
}
const btcSnapshot = { athPrice: 0.0044255, btcPrice: 68216, index: 103.1, fetchedAt: ethSnapshot.fetchedAt }

test('BTC queue uses its own hourly key and does not queue the same hour twice', async () => {
  const client = queueClient()
  const { route } = loadRoute('lib/altSnapshotPosting.ts')
  assert.equal(typeof route.queueHourlyAthBtcIndexPost, 'function')
  const first = await route.queueHourlyAthBtcIndexPost(client, btcSnapshot)
  assert.equal(first.queued, true)
  assert.equal(first.dedupeKey, 'ath_btc_index_hourly:2026-11-13-23')
  assert.equal(client.writes.length, 1)
  const row = client.rows[0]
  assert.equal(row.target_channel, '@Krypto_breaking')
  assert.equal(row.status, 'pending')
  assert.deepEqual(Array.from(row.tags), ['ATH', 'BTC', 'RelativeStrengthIndex', 'HourlyUpdate'])
  assert.match(row.post_text, /ATH\/BTC 상대강도 지수/)
  assert.equal(new URL(row.article_url).searchParams.get('type'), 'ath-btc-index')
  const again = await route.queueHourlyAthBtcIndexPost(client, btcSnapshot)
  assert.equal(again.queued, false)
  assert.equal(client.writes.length, 1)
})

test('BTC fetch refuses HTTP errors and malformed quotes instead of manufacturing an index', async () => {
  for (const response of [Response.json({ message: 'unavailable' }, { status: 503 }), Response.json({ data: { amount: 'oops' } })]) {
    const { route } = loadRoute('lib/altSnapshotPosting.ts', { fetch: async () => response })
    await assert.rejects(route.fetchAthBtcIndexSnapshot(ethSnapshot))
  }
})

test('BTC queue retries a failed row but preserves posted rows and unique-insert races', async () => {
  const { route } = loadRoute('lib/altSnapshotPosting.ts')
  const key = 'ath_btc_index_hourly:2026-11-13-23'
  const failed = queueClient([{ id: 7, status: 'failed', dedupe_key: key }])
  assert.equal((await route.queueHourlyAthBtcIndexPost(failed, btcSnapshot)).queued, true)
  assert.equal(failed.rows.length, 1)
  assert.equal(failed.rows[0].status, 'pending')
  assert.equal(failed.writes[0].action, 'update')
  const posted = queueClient([{ id: 9, status: 'posted', dedupe_key: key }])
  assert.equal((await route.queueHourlyAthBtcIndexPost(posted, btcSnapshot)).queued, false)
  assert.equal(posted.writes.length, 0)
  const raced = queueClient([], { code: '23505', message: 'duplicate key' })
  assert.equal((await route.queueHourlyAthBtcIndexPost(raced, btcSnapshot)).queued, false)
  const broken = queueClient([], { code: 'XX000', message: 'storage unavailable' })
  await assert.rejects(route.queueHourlyAthBtcIndexPost(broken, btcSnapshot))
})

test('BTC queue refuses inconsistent indices and invalid windows before any DB write', async () => {
  const { route } = loadRoute('lib/altSnapshotPosting.ts')
  for (const invalid of [{ ...btcSnapshot, index: 999 }, { ...btcSnapshot, fetchedAt: 'invalid' }]) {
    const client = queueClient()
    await assert.rejects(route.queueHourlyAthBtcIndexPost(client, invalid), /invalid_ath_btc_index_snapshot/)
    assert.equal(client.writes.length, 0)
  }
})

test('unauthorized route never fetches or creates a client', async () => {
  const { route, events, clientCount } = routeFixture()
  const response = await route.POST(new Request('https://example.test/api/jobs/alt-snapshots', { method: 'POST' }))
  assert.equal(response.status, 401)
  assert.equal(events.length, 0)
  assert.equal(clientCount(), 0)
})
