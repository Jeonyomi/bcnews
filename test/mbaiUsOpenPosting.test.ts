import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchUsOpenSnapshot, queueUsOpenPost } from '../lib/mbaiUsOpenPosting.ts'

const response = (payload: any, status = 200) => new Response(JSON.stringify(payload), { status })
const naver = (name: string, value: string, change: string, ratio: string, closed = true, date = '2026-08-27') => ({
  stockName: name,
  closePrice: value,
  compareToPreviousClosePrice: change,
  fluctuations: change,
  fluctuationsRatio: ratio,
  marketStatus: closed ? 'CLOSE' : 'OPEN',
  localTradedAt: `${date}T15:40:00+09:00`,
})
const yahoo = (previous: number, value: number, date = '2026-08-27') => {
  const timestamps = date === '2026-08-27' ? [1787706000, 1787792400] : [1787619600, 1787706000]
  return { chart: { result: [{ timestamp: timestamps, indicators: { quote: [{ close: [previous, value] }] } }] } }
}
const payloadFor = (url: string, staleFutures = false) => {
  if (url.includes('/KOSPI/')) return naver('코스피', '6,808.21', '65.47', '0.97')
  if (url.includes('/KOSDAQ/')) return naver('코스닥', '826.87', '-0.28', '-0.03')
  if (url.includes('FX_USDKRW')) return { result: naver('미국 달러', '1,384.40', '0.90', '0.07', false) }
  const date = staleFutures ? '2026-08-26' : '2026-08-27'
  if (url.includes('ES%3DF')) return yahoo(7669.75, 7717, date)
  if (url.includes('NQ%3DF')) return yahoo(29105.75, 29487, date)
  if (url.includes('%5ETNX')) return yahoo(4.632, 4.664, date)
  if (url.includes('DX-Y.NYB')) return yahoo(99, 99.138, date)
  if (url.includes('BTC-USD')) return { open: '79117.64', last: '78332' }
  if (url.includes('ETH-USD')) return { open: '2477.76', last: '2459' }
  throw new Error(`unexpected_url:${url}`)
}

test('US OPEN fetches nine fresh sources with timeout signals', async () => {
  const calls: Array<RequestInit | undefined> = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(init)
    return response(payloadFor(String(input)))
  }) as typeof fetch
  const snapshot = await fetchUsOpenSnapshot(fetchImpl, '2026-08-27')
  assert.equal(calls.length, 9)
  assert.ok(calls.every((init) => init?.signal instanceof AbortSignal))
  assert.equal(snapshot.sessionDate, '2026-08-27')
  assert.equal(snapshot.sp500Futures.changePercent, 0.62)
  assert.equal(snapshot.treasury10y.value, 4.664)
  assert.equal(snapshot.kospi.changePercent, 0.97)
  assert.equal(snapshot.btc.value, 78332)
})

test('US OPEN rejects stale futures and upstream non-2xx', async () => {
  const stale = (async (input: string | URL | Request) => response(payloadFor(String(input), true))) as typeof fetch
  await assert.rejects(() => fetchUsOpenSnapshot(stale, '2026-08-27'), /us_open_stale_market_data/)

  const failed = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('ES%3DF')) return response({ message: 'limited' }, 429)
    return response(payloadFor(url))
  }) as typeof fetch
  await assert.rejects(() => fetchUsOpenSnapshot(failed, '2026-08-27'), /mbai_us_open_fetch_failed:ES=F:429/)
})

class Client {
  rows: any[]
  loseFailedUpdate = false
  constructor(rows: any[] = []) { this.rows = rows }
  from() { return new Query(this) }
}
class Query {
  client: Client
  filters: Array<[string, any]> = []
  mode: 'select' | 'update' = 'select'
  updateRow: any = null
  constructor(client: Client) { this.client = client }
  select() { return this }
  eq(field: string, value: any) { this.filters.push([field, value]); return this }
  order() { return this }
  limit() { return this }
  update(row: any) { this.mode = 'update'; this.updateRow = row; return this }
  async maybeSingle() {
    if (this.mode === 'update' && this.client.loseFailedUpdate) {
      const row = this.client.rows.find((item) => item.id === this.filters.find(([field]) => field === 'id')?.[1])
      if (row) row.status = 'pending'
      return { data: null, error: null }
    }
    const row = this.client.rows.find((item) => this.filters.every(([field, value]) => item[field] === value)) || null
    if (row && this.mode === 'update') Object.assign(row, this.updateRow)
    return { data: row, error: null }
  }
  async insert(row: any) {
    if (this.client.rows.some((item) => item.dedupe_key === row.dedupe_key)) return { error: { code: '23505', message: 'duplicate key' } }
    this.client.rows.push({ id: this.client.rows.length + 1, ...row })
    return { error: null }
  }
}
const snapshot = () => fetchUsOpenSnapshot(
  (async (input: string | URL | Request) => response(payloadFor(String(input)))) as typeof fetch,
  '2026-08-27',
)

test('US OPEN queue inserts once and skips a duplicate', async () => {
  const client = new Client()
  const first = await queueUsOpenPost(client, await snapshot())
  const second = await queueUsOpenPost(client, await snapshot())
  assert.equal(first.queued, true)
  assert.equal(second.queued, false)
  assert.equal(client.rows.length, 1)
  assert.equal(client.rows[0].lane, 'mbai_us_open')
  assert.equal(client.rows[0].target_channel, '@MBAI_ch')
  assert.equal(client.rows[0].dedupe_key, 'mbai_us_open:2026-08-27')
})

test('US OPEN queue atomically retries failed rows and reports a lost race as duplicate', async () => {
  const retryClient = new Client([{ id: 7, status: 'failed', dedupe_key: 'mbai_us_open:2026-08-27' }])
  assert.equal((await queueUsOpenPost(retryClient, await snapshot())).queued, true)
  assert.equal(retryClient.rows[0].status, 'pending')

  const raceClient = new Client([{ id: 8, status: 'failed', dedupe_key: 'mbai_us_open:2026-08-27' }])
  raceClient.loseFailedUpdate = true
  assert.equal((await queueUsOpenPost(raceClient, await snapshot())).queued, false)
  assert.equal(raceClient.rows[0].status, 'pending')
})
