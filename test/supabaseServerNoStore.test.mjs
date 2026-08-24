import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../lib/supabaseServer.ts', import.meta.url), 'utf8')

test('server-side Supabase reads bypass the Next.js data cache', () => {
  assert.match(source, /cache:\s*['"]no-store['"]/)
  assert.match(source, /global:\s*\{\s*fetch:/)
})
