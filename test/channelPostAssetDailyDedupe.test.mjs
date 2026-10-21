import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRoute, memoryClient } from './helpers/loadRoute.mjs'

const priorKey = 'mbai_hot24:2026-10-14:KOREA:ASSET'
const currentKey = 'mbai_hot24:2026-10-20:KOREA:ASSET'

async function runSender({ lane = 'mbai_hot24', previousKey = priorKey, nextKey = currentKey } = {}) {
  const client = memoryClient([
    { id: 1, status: 'posted', lane, dedupe_key: previousKey, article_url: 'https://example.com/repeated-winner', target_channel: '@MBAI_ch' },
    { id: 2, status: 'pending', lane, dedupe_key: nextKey, article_url: 'https://example.com/repeated-winner', target_channel: '@MBAI_ch', post_text: 'Synthetic daily selection', created_at: '2026-10-20T07:05:00Z' },
  ])
  let sends = 0
  const { route } = loadRoute('app/api/jobs/send-pending/route.ts', {
    client,
    env: { X_CRON_SECRET: 'test-only', TG_BOT_TOKEN: 'test-only' },
    fetch: async () => { sends++; return Response.json({ ok: true, result: { message_id: 999, chat: { id: -100123 } } }) },
  })
  const response = await route.POST(new Request('https://example.invalid/api/jobs/send-pending', { method: 'POST', headers: { 'x-cron-secret': 'test-only' } }))
  return { response, body: await response.json(), sends, row: client.rows[1] }
}

test('a new daily ASSET selection is sent even when its source URL won on an earlier day', async () => {
  const result = await runSender()
  assert.equal(result.response.status, 200)
  assert.equal(result.sends, 1, 'old asset URL must not override a different valid daily key')
  assert.equal(result.row.status, 'posted')
  assert.equal(result.row.telegram_message_id, 999)
})

test('same-session ASSET duplicates are still blocked for every supported market', async () => {
  for (const market of ['KOREA', 'US', 'CRYPTO']) {
    const key = `mbai_hot24:2026-10-20:${market}:ASSET`
    const result = await runSender({ previousKey: key, nextKey: key })
    assert.equal(result.sends, 0)
    assert.equal(result.row.status, 'skipped')
    assert.equal(result.row.reason, 'skipped_duplicate')
  }
})

test('repeated news articles remain blocked even when their daily key changes', async () => {
  const result = await runSender({ previousKey: 'mbai_hot24:2026-10-14:KOREA:NEWS', nextKey: 'mbai_hot24:2026-10-20:KOREA:NEWS' })
  assert.equal(result.sends, 0)
  assert.equal(result.row.status, 'skipped')
})

test('an ASSET-looking key on another lane does not relax URL protection', async () => {
  const result = await runSender({ lane: 'breaking' })
  assert.equal(result.sends, 0)
  assert.equal(result.row.status, 'skipped')
})

test('malformed or non-calendar daily keys do not relax URL protection', async () => {
  for (const nextKey of ['mbai_hot24:2026-02-30:KOREA:ASSET', 'mbai_hot24:2026-99-01:US:ASSET', 'mbai_hot24:2026-10-20:OTHER:ASSET', 'mbai_hot24:2026-10-20:US:ASSET ']) {
    const result = await runSender({ nextKey })
    assert.equal(result.sends, 0, nextKey)
    assert.equal(result.row.status, 'skipped')
  }
})
