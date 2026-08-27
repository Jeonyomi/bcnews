import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('BREAKING BRIDGE route authenticates privately and writes only after a real signal', () => {
  const route = readFileSync(new URL('../app/api/jobs/mbai-breaking-bridge/route.ts', import.meta.url), 'utf8')
  assert.match(route, /BCNEWS_CRON_SECRET\s*\|\|\s*process\.env\.X_CRON_SECRET\s*\|\|\s*process\.env\.CRON_SECRET/)
  assert.match(route, /x-cron-secret/)
  assert.doesNotMatch(route, /NEXT_PUBLIC_CRON_SECRET/)
  assert.match(route, /skipped_mbai_breaking_bridge_disabled/)
  assert.match(route, /skipped_no_breaking_signal/)
  assert.match(route, /event_type:\s*'mbai_breaking_bridge'/)
  assert.match(route, /error:\s*'internal_error'/)
  assert.doesNotMatch(route, /error:\s*String\(error\)/)
  assert.ok(route.indexOf('if (!config.enabled)') < route.indexOf('const snapshot = await fetchBreakingBridgeSnapshot'))
  assert.ok(route.indexOf('if (!primary)') < route.indexOf('const client = createSupabaseServerClient'))
})

test('BREAKING BRIDGE scheduler runs hidden every two minutes and is removable', () => {
  const register = readFileSync(new URL('../scripts/scheduler/Register-BcnewsMbaiBreakingBridgeTask.ps1', import.meta.url), 'utf8')
  const runner = readFileSync(new URL('../scripts/scheduler/Run-BcnewsMbaiBreakingBridge.ps1', import.meta.url), 'utf8')
  const launcher = readFileSync(new URL('../scripts/scheduler/Run-BcnewsMbaiBreakingBridge-Hidden.vbs', import.meta.url), 'utf8')
  const unregister = readFileSync(new URL('../scripts/scheduler/Unregister-BcnewsScheduledTasks.ps1', import.meta.url), 'utf8')
  const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

  assert.match(register, /Minutes 2/)
  assert.match(register, /MultipleInstances IgnoreNew/)
  assert.match(register, /wscript\.exe/i)
  assert.match(runner, /api\/jobs\/mbai-breaking-bridge/)
  assert.match(launcher, /Run-BcnewsMbaiBreakingBridge\.ps1/)
  assert.match(unregister, /BCN-MBAI-BreakingBridge-2m/)
  assert.match(packageJson, /job:mbai-breaking-bridge/)
})

test('BREAKING BRIDGE rolling cooldown is atomic inside a service-role-only database transaction', () => {
  const migration = readFileSync(new URL('../migrations/007_mbai_breaking_bridge_queue.sql', import.meta.url), 'utf8')
  const posting = readFileSync(new URL('../lib/mbaiBreakingBridgePosting.ts', import.meta.url), 'utf8')

  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /for update/)
  assert.match(migration, /interval '2 hours'/)
  assert.match(migration, /grant execute[\s\S]+service_role/i)
  assert.match(migration, /revoke all[\s\S]+public/i)
  assert.match(posting, /\.rpc\('queue_mbai_breaking_bridge_post'/)
  assert.doesNotMatch(posting, /\.from\('channel_posts'\)/)
})
