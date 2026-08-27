import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('US OPEN route authenticates privately and skips outside New York window before fetching', () => {
  const route = readFileSync(new URL('../app/api/jobs/mbai-us-open/route.ts', import.meta.url), 'utf8')
  assert.match(route, /BCNEWS_CRON_SECRET\s*\|\|\s*process\.env\.X_CRON_SECRET\s*\|\|\s*process\.env\.CRON_SECRET/)
  assert.match(route, /x-cron-secret/)
  assert.doesNotMatch(route, /NEXT_PUBLIC_CRON_SECRET/)
  assert.match(route, /skipped_outside_us_open_window/)
  assert.match(route, /skipped_us_equity_holiday/)
  assert.match(route, /skipped_us_open_stale_data/)
  assert.match(route, /event_type:\s*'mbai_us_open'/)
  assert.match(route, /error:\s*'internal_error'/)
  assert.doesNotMatch(route, /error:\s*String\(error\)/)
  assert.ok(route.indexOf('if (!execution.shouldRun)') < route.indexOf('const snapshot = await fetchUsOpenSnapshot'))
})

test('US OPEN scheduler validates KST and runs hidden at both DST-safe KST times', () => {
  const register = readFileSync(new URL('../scripts/scheduler/Register-BcnewsMbaiUsOpenTask.ps1', import.meta.url), 'utf8')
  const runner = readFileSync(new URL('../scripts/scheduler/Run-BcnewsMbaiUsOpen.ps1', import.meta.url), 'utf8')
  const launcher = readFileSync(new URL('../scripts/scheduler/Run-BcnewsMbaiUsOpen-Hidden.vbs', import.meta.url), 'utf8')
  const unregister = readFileSync(new URL('../scripts/scheduler/Unregister-BcnewsScheduledTasks.ps1', import.meta.url), 'utf8')

  assert.match(register, /Korea Standard Time/)
  assert.match(register, /Monday,Tuesday,Wednesday,Thursday,Friday/)
  assert.match(register, /22:25/)
  assert.match(register, /23:25/)
  assert.match(register, /wscript\.exe/i)
  assert.match(runner, /api\/jobs\/mbai-us-open/)
  assert.match(launcher, /Run-BcnewsMbaiUsOpen\.ps1/)
  assert.match(unregister, /BCN-MBAI-USOpen-NY0925/)
})
