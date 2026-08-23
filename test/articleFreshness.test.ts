import test from 'node:test'
import assert from 'node:assert/strict'
import { isWithinAgeHours, normalizePublicationDate } from '../lib/articleFreshness.ts'

const now = Date.parse('2026-08-23T06:30:00Z')

test('accepts an article inside the posting freshness window', () => {
  assert.equal(isWithinAgeHours('2026-08-23T04:52:54Z', 24, now), true)
})

test('rejects an article older than the posting freshness window', () => {
  assert.equal(isWithinAgeHours('2026-08-21T11:49:40Z', 24, now), false)
})

test('rejects an invalid publication timestamp', () => {
  assert.equal(isWithinAgeHours('not-a-date', 24, now), false)
})

test('rejects a publication timestamp in the future', () => {
  assert.equal(isWithinAgeHours('2026-08-23T07:30:00Z', 24, now), false)
})

test('does not invent a current timestamp when publication time is missing', () => {
  assert.equal(normalizePublicationDate(undefined), null)
  assert.equal(normalizePublicationDate('not-a-date'), null)
})
