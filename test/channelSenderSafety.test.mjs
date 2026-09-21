import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRoute, memoryClient } from './helpers/loadRoute.mjs'
const env = { CRON_SECRET: 'test-cron', TG_BOT_TOKEN: 'test-bot' }
const request = () => new Request('https://example.test/api/jobs/send-pending', { method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET } })
const row = () => ({ id: 1, status: 'pending', lane: 'mbai_hot24', dedupe_key: 'test-key', article_url: 'https://example.test/article', post_text: 'test', target_channel: '@test' })

test('cron still claims and delivers approved or automated pending posts without admin bearer', async () => {
  for (const approved_by of [null, 'auto', 'channel-posts-admin']) {
    const client = memoryClient([{ ...row(), approved_by }])
    let sends = 0
    const { route } = loadRoute('app/api/jobs/send-pending/route.ts', { client, env, fetch: async () => {
      sends++
      return Response.json({ ok: true, result: { message_id: 99, chat: { id: 'stored-chat' } } })
    } })
    assert.equal((await route.POST(request())).status, 200)
    assert.equal(client.rows[0].status, 'posted')
    assert.equal(client.rows[0].telegram_message_id, 99)
    assert.equal(sends, 1)
  }
})

test('successful send with receipt DB failure is quarantined as delivery unknown and never resent', async () => {
  const client = memoryClient([row()], { failPosted: true })
  let sends = 0
  const { route } = loadRoute('app/api/jobs/send-pending/route.ts', { client, env, fetch: async () => {
    sends++
    return Response.json({ ok: true, result: { message_id: 99, chat: { id: 'stored-chat' } } })
  } })
  const result = await (await route.POST(request())).json()
  assert.equal(result.posted, 0)
  assert.equal(result.delivery_unknown, 1)
  assert.equal(client.rows[0].status, 'skipped')
  assert.equal(client.rows[0].reason, 'skipped_delivery_unknown')
  assert.equal(client.rows[0].telegram_message_id, 99)
  await route.POST(request())
  assert.equal(sends, 1)
})
