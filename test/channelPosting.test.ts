import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeChannelPostRow } from '../lib/channelPosting'

test('normalizes null skipped post text to an empty string for the NOT NULL schema', () => {
  const row = normalizeChannelPostRow({
    status: 'skipped',
    headline: 'Skipped article',
    article_url: 'https://example.com/article',
    post_text: null,
  })

  assert.equal(row.post_text, '')
})

test('preserves a valid post text unchanged', () => {
  const row = normalizeChannelPostRow({ post_text: 'ready to send' })
  assert.equal(row.post_text, 'ready to send')
})

test('does not hide a null post text on a pending row', () => {
  const row = normalizeChannelPostRow({ status: 'pending', post_text: null })
  assert.equal(row.post_text, null)
})
