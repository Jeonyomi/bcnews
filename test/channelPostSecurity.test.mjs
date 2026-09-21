import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRoute, memoryClient } from './helpers/loadRoute.mjs'

const endpoints = [
  ['app/api/channel-posts/route.ts', 'GET'],
  ['app/api/channel-posts/route.ts', 'PATCH'],
  ['app/api/channel-posts/retract/route.ts', 'POST'],
  ['app/api/ops/channel-posts/route.ts', 'GET'],
]
const token = 'test-only-admin-credential'
const env = { CHANNEL_POSTS_ADMIN_TOKEN: token }
const admin = `Bearer ${token}`

test('approval records server actor but leaves actual delivery to pending sender', async () => {
  const client = memoryClient([{ id: 1, status: 'pending' }])
  const { route } = loadRoute('app/api/channel-posts/route.ts', { client, env })
  const response = await route.PATCH(request('PATCH', { id: 1, action: 'approve', approvedBy: 'forged', telegramMessageId: 123, telegramChatId: 'fake' }, admin))
  assert.equal(response.status, 200)
  assert.equal(client.rows[0].status, 'pending')
  assert.equal(client.rows[0].approved_by, 'channel-posts-admin')
  for (const key of ['posted_at', 'telegram_message_id', 'telegram_chat_id']) assert.equal(client.rows[0][key], undefined)
})
test('operator actions cannot overwrite claimed, delivered, failed or skipped rows; concurrent skip wins once', async () => {
  for (const status of ['sending', 'posted', 'failed', 'skipped']) {
    for (const action of ['approve', 'skip']) {
      const client = memoryClient([{ id: 1, status }])
      const { route } = loadRoute('app/api/channel-posts/route.ts', { client, env })
      assert.equal((await route.PATCH(request('PATCH', { id: 1, action }, admin))).status, 409)
      assert.equal(client.writes.length, 0)
    }
  }
  const client = memoryClient([{ id: 1, status: 'pending' }])
  const { route } = loadRoute('app/api/channel-posts/route.ts', { client, env })
  const results = await Promise.all([1, 2].map(() => route.PATCH(request('PATCH', { id: 1, action: 'skip' }, admin))))
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409])
  assert.equal(client.writes.length, 1)
})

test('retraction only operates on posted rows and CAS refuses a concurrent state change', async () => {
  let calls = 0
  const client = memoryClient([{ id: 1, status: 'pending', telegram_message_id: 7, telegram_chat_id: 'stored' }])
  const app = loadRoute('app/api/channel-posts/retract/route.ts', {
    client, env: { ...env, TG_BOT_TOKEN: 'test-only' },
    fetch: async () => { calls++; client.rows[0].status = 'skipped'; return Response.json({ ok: true }) },
  })
  assert.equal((await app.route.POST(request('POST', { id: 1 }, admin))).status, 409)
  assert.equal(calls, 0)
  client.rows[0].status = 'posted'
  assert.equal((await app.route.POST(request('POST', { id: 1 }, admin))).status, 409)
  assert.equal(calls, 1)
  assert.equal(client.writes.length, 0)
})

const request = (method, body, authorization) => new Request('https://example.test/api/channel-posts', {
  method, headers: authorization ? { authorization } : {},
  ...(body ? { body: JSON.stringify(body) } : {}),
})

test('all privileged channel-post endpoints fail closed before accessing DB or Telegram', async () => {
  for (const [file, method] of endpoints) {
    for (const [env, header] of [
      [{}, undefined],
      [{ CHANNEL_POSTS_ADMIN_TOKEN: token }, undefined],
      [{ CHANNEL_POSTS_ADMIN_TOKEN: token }, 'Bearer wrong'],
      [{ CRON_SECRET: token }, `Bearer ${token}`],
    ]) {
      const app = loadRoute(file, { client: memoryClient(), env })
      const response = await app.route[method](request(method, method === 'GET' ? null : { id: 1, action: 'approve' }, header))
      assert.equal(response.status, 401, `${file} ${method}`)
      assert.equal(app.clientCount(), 0)
    }
  }
})
