import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/sources/route.ts', import.meta.url), 'utf8')

test('source health reads the direct latest row without a failing stage-column probe', () => {
  const block = route.match(/const sourceWindowQueryParams[\s\S]*?\n\s*let globalWindow/)
  assert.ok(block, 'source latest-query block should exist')
  assert.doesNotMatch(block[0], /error_message,stage/)
  assert.match(block[0], /\.maybeSingle\(\)/)
})
