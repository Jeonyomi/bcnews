import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('KOREA CLOSE route is private, fail-safe on holidays, and hides internal diagnostics', () => {
  const route = readFileSync(new URL('../app/api/jobs/mbai-korea-close/route.ts', import.meta.url), 'utf8')
  assert.match(route, /x-cron-secret/)
  assert.doesNotMatch(route, /NEXT_PUBLIC_CRON_SECRET/)
  assert.match(route, /queueKoreaClosePost/)
  assert.match(route, /skipped_korea_market_closed_or_stale/)
  assert.match(route, /internal_error/)
  assert.doesNotMatch(route, /error:\s*String\(error\)/)
  assert.match(route, /event_type:\s*'mbai_korea_close'/)
})

test('KOREA CLOSE scheduler runs hidden on weekdays at 15:40 and unregisters cleanly', () => {
  const register = readFileSync(new URL('../scripts/scheduler/Register-BcnewsMbaiKoreaCloseTask.ps1', import.meta.url), 'utf8')
  const runner = readFileSync(new URL('../scripts/scheduler/Run-BcnewsMbaiKoreaClose.ps1', import.meta.url), 'utf8')
  const launcher = readFileSync(new URL('../scripts/scheduler/Run-BcnewsMbaiKoreaClose-Hidden.vbs', import.meta.url), 'utf8')
  const unregister = readFileSync(new URL('../scripts/scheduler/Unregister-BcnewsScheduledTasks.ps1', import.meta.url), 'utf8')

  assert.match(register, /BCN-MBAI-KoreaClose-1540/)
  assert.match(register, /Monday,Tuesday,Wednesday,Thursday,Friday/)
  assert.match(register, /15:40/)
  assert.match(register, /wscript\.exe/i)
  assert.match(runner, /api\/jobs\/mbai-korea-close/)
  assert.match(launcher, /Run-BcnewsMbaiKoreaClose\.ps1/)
  assert.match(unregister, /BCN-MBAI-KoreaClose-1540/)
})
