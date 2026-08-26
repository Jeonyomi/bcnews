import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fetchKoreaCloseSnapshot,
  queueKoreaClosePost,
} from '../lib/mbaiKoreaClosePosting.ts'

const jsonResponse = (payload: any, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json' },
})
const naver = (name: string, value: string, change: string, ratio: string, closed = true) => ({
  stockName: name,
  closePrice: value,
  compareToPreviousClosePrice: change,
  fluctuations: change,
  fluctuationsRatio: ratio,
  marketStatus: closed ? 'CLOSE' : 'OPEN',
  localTradedAt: '2026-08-27T15:40:00+09:00',
})
const yahoo = (a: number, b: number) => ({ chart: { result: [{
  timestamp: [1787792400, 1787878800],
  indicators: { quote: [{ close: [a, b] }] },
}] } })

const payloadForUrl = (url: string) => {
  if (url.includes('/KOSPI/')) return naver('코스피', '6,808.21', '65.47', '0.97')
  if (url.includes('/KOSDAQ/')) return naver('코스닥', '826.87', '-0.28', '-0.03')
  if (url.includes('FX_USDKRW')) return { result: naver('미국 달러', '1,384.30', '0.80', '0.06', false) }
  if (url.includes('ES%3DF')) return yahoo(7692, 7689.5)
  if (url.includes('NQ%3DF')) return yahoo(29276.75, 29251)
  if (url.includes('BTC-USD')) return { open: '79117.64', last: '78576.51' }
  if (url.includes('ETH-USD')) return { open: '2477.76', last: '2464.51' }
  throw new Error(`unexpected_url:${url}`)
}

test('KOREA CLOSE fetches seven isolated sources with timeout signals and assembles a KST snapshot', async () => {
  const calls: Array<{ url: string; signal: AbortSignal | undefined }> = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, signal: init?.signal })
    return jsonResponse(payloadForUrl(url))
  }) as typeof fetch

  const snapshot = await fetchKoreaCloseSnapshot(fetchImpl, new Date('2026-08-27T06:40:00.000Z'))
  assert.equal(calls.length, 7)
  assert.ok(calls.every(({ signal }) => signal instanceof AbortSignal))
  assert.equal(snapshot.dateKey, '2026-08-27')
  assert.equal(snapshot.kospi.value, 6808.21)
  assert.equal(snapshot.usdKrw.changePercent, 0.06)
  assert.equal(snapshot.sp500Futures.changePercent, -0.03)
  assert.equal(snapshot.btc.changePercent, -0.68)
})

test('KOREA CLOSE rejects upstream non-2xx with a controlled source error', async () => {
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/KOSPI/')) return jsonResponse({ message: 'limited' }, 429)
    return jsonResponse(payloadForUrl(url))
  }) as typeof fetch
  await assert.rejects(
    () => fetchKoreaCloseSnapshot(fetchImpl, new Date('2026-08-27T06:40:00.000Z')),
    /mbai_korea_close_fetch_failed:KOSPI:429/,
  )
})

class FakeClient {
  rows: any[]
  nextId: number
  pendingUpdate: any = null
  loseFailedUpdate = false
  constructor(rows: any[] = []) { this.rows = rows; this.nextId = Math.max(0, ...rows.map((row) => row.id || 0)) + 1 }
  from() { return new FakeQuery(this) }
}
class FakeQuery {
  client: FakeClient
  filters: Array<[string, any]> = []
  mode: 'select' | 'update' | 'insert' = 'select'
  updateRow: any = null
  constructor(client: FakeClient) { this.client = client }
  select() { this.mode = this.mode === 'update' ? 'update' : 'select'; return this }
  eq(field: string, value: any) { this.filters.push([field, value]); return this }
  order() { return this }
  limit() { return this }
  async maybeSingle() {
    if (this.mode === 'update' && this.client.loseFailedUpdate && this.filters.some(([field, value]) => field === 'status' && value === 'failed')) {
      const concurrent = this.client.rows.find((item) => this.filters.filter(([field]) => field !== 'status').every(([field, value]) => item[field] === value))
      if (concurrent) concurrent.status = 'pending'
      return { data: null, error: null }
    }
    const row = this.client.rows.find((item) => this.filters.every(([field, value]) => item[field] === value)) || null
    if (this.mode === 'update' && row) Object.assign(row, this.updateRow)
    return { data: row, error: null }
  }
  update(row: any) { this.mode = 'update'; this.updateRow = row; return this }
  async insert(row: any) {
    if (this.client.rows.some((item) => item.dedupe_key === row.dedupe_key)) return { error: { code: '23505', message: 'duplicate key' } }
    this.client.rows.push({ id: this.client.nextId++, ...row })
    return { error: null }
  }
  then(resolve: (value: any) => any) {
    if (this.mode === 'update') return this.maybeSingle().then(resolve)
    return Promise.resolve({ data: null, error: null }).then(resolve)
  }
}

const snapshot = async () => fetchKoreaCloseSnapshot(
  (async (input: string | URL | Request) => jsonResponse(payloadForUrl(String(input)))) as typeof fetch,
  new Date('2026-08-27T06:40:00.000Z'),
)

test('KOREA CLOSE queue inserts once and skips a posted duplicate', async () => {
  const client = new FakeClient()
  const first = await queueKoreaClosePost(client, await snapshot())
  const second = await queueKoreaClosePost(client, await snapshot())
  assert.equal(first.queued, true)
  assert.equal(client.rows[0].target_channel, '@MBAI_ch')
  assert.equal(client.rows[0].lane, 'mbai_korea_close')
  assert.equal(client.rows[0].dedupe_key, 'mbai_korea_close:2026-08-27')
  assert.equal(second.queued, false)
  assert.equal(client.rows.length, 1)
})

test('KOREA CLOSE queue retries a failed daily row without inserting another row', async () => {
  const client = new FakeClient([{ id: 91, status: 'failed', dedupe_key: 'mbai_korea_close:2026-08-27' }])
  const result = await queueKoreaClosePost(client, await snapshot())
  assert.equal(result.queued, true)
  assert.equal(result.existingId, 91)
  assert.equal(client.rows[0].status, 'pending')
  assert.equal(client.rows.length, 1)
})

test('KOREA CLOSE queue reports duplicate when another caller wins the failed-row retry race', async () => {
  const client = new FakeClient([{ id: 92, status: 'failed', dedupe_key: 'mbai_korea_close:2026-08-27' }])
  client.loseFailedUpdate = true
  const result = await queueKoreaClosePost(client, await snapshot())
  assert.equal(result.queued, false)
  assert.equal(result.existingId, 92)
  assert.equal(client.rows[0].status, 'pending')
})
