import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('HOT 24 route is private, supports six-slot dry run, and stays silent below meaningful floor', () => {
  const route = readFileSync(new URL('../app/api/jobs/mbai-hot24/route.ts', import.meta.url), 'utf8')
  assert.match(route, /BCNEWS_CRON_SECRET\s*\|\|\s*process\.env\.X_CRON_SECRET\s*\|\|\s*process\.env\.CRON_SECRET/)
  assert.match(route, /x-cron-secret/)
  assert.doesNotMatch(route, /NEXT_PUBLIC_CRON_SECRET/)
  assert.match(route, /dry_run/)
  assert.match(route, /skipped_no_meaningful_required_pick/)
  assert.match(route, /queueRequiredPick/)
  assert.match(route, /MBAI_HOT24_\$\{market\}_\$\{pick\.kind\}/)
  assert.match(route, /internal_error/)
  assert.doesNotMatch(route, /error:\s*String\(error\)/)
})

test('HOT 24 schedulers run hidden at Korea, crypto and New York-complete windows', () => {
  const register = readFileSync(new URL('../scripts/scheduler/Register-BcnewsMbaiHot24Task.ps1', import.meta.url), 'utf8')
  const runner = readFileSync(new URL('../scripts/scheduler/Run-BcnewsMbaiHot24.ps1', import.meta.url), 'utf8')
  const launcher = readFileSync(new URL('../scripts/scheduler/Run-BcnewsMbaiHot24-Hidden.vbs', import.meta.url), 'utf8')
  const unregister = readFileSync(new URL('../scripts/scheduler/Unregister-BcnewsScheduledTasks.ps1', import.meta.url), 'utf8')

  assert.match(register, /BCN-MBAI-Hot24-Korea-1605/)
  assert.match(register, /BCN-MBAI-Hot24-Crypto-2030/)
  assert.match(register, /BCN-MBAI-Hot24-USClose-NY1720/)
  assert.match(register, /-Daily/)
  assert.match(register, /16:05/)
  assert.match(register, /20:30/)
  assert.match(register, /06:20/)
  assert.match(register, /07:20/)
  assert.match(register, /Korea Standard Time/)
  assert.match(register, /Get-TimeZone/)
  assert.match(register, /wscript\.exe/i)
  assert.match(runner, /api\/jobs\/mbai-hot24/)
  assert.match(launcher, /Run-BcnewsMbaiHot24\.ps1/)
  assert.match(unregister, /BCN-MBAI-Hot24-Korea-1605/)
  assert.match(unregister, /BCN-MBAI-Hot24-Crypto-2030/)
  assert.match(unregister, /BCN-MBAI-Hot24-USClose-NY1720/)
})

test('HOT 24 canonical issue cooldown is atomic for every delivery state', () => {
  const migration = readFileSync(new URL('../migrations/010_mbai_hot24_required_picks.sql', import.meta.url), 'utf8')
  const posting = readFileSync(new URL('../lib/mbaiHot24RequiredPicksPosting.ts', import.meta.url), 'utf8')

  assert.match(migration, /queue_mbai_hot24_post/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /set search_path = pg_catalog, public/i)
  assert.match(migration, /interval '24 hours'/)
  assert.match(migration, /status in \('pending', 'sending', 'posted', 'failed', 'skipped'\)/)
  assert.match(migration, /tags @> array\[p_issue_tag\]::text\[\]/)
  assert.match(migration, /grant execute[\s\S]+service_role/i)
  assert.match(migration, /revoke all[\s\S]+public, anon, authenticated/i)
  assert.match(posting, /\.rpc\('queue_mbai_hot24_post'/)
  assert.doesNotMatch(posting, /\.from\('channel_posts'\)/)
  assert.match(posting, /Pick:/)
})

test('HOT 24 is fail-closed to the MB.AI channel, ranks all candidates, and prevents ambiguous resend', () => {
  const posting = readFileSync(new URL('../lib/mbaiHot24Posting.ts', import.meta.url), 'utf8')
  const apiWorker = readFileSync(new URL('../lib/channelPosting.ts', import.meta.url), 'utf8')
  const scriptWorker = readFileSync(new URL('../scripts/sendPendingChannelPosts.mjs', import.meta.url), 'utf8')

  assert.match(posting, /MBAI_HOT24_TARGET_CHANNEL\s*=\s*'@MBAI_ch'/)
  assert.doesNotMatch(posting, /process\.env\.MBAI_TARGET_CHANNEL/)
  assert.match(posting, /\.lte\('published_at_utc', observedAt\)/)
  assert.match(posting, /\.range\(offset, offset \+ pageSize - 1\)/)
  assert.match(posting, /while \(true\)/)
  assert.doesNotMatch(posting, /\.limit\(200\)/)
  assert.doesNotMatch(posting, /candidates\.slice\(0,\s*20\)/)
  for (const worker of [apiWorker, scriptWorker]) {
    assert.match(worker, /\['mbai_breaking_bridge',\s*'mbai_hot24'\]\.includes\(String\(row\.lane\)\)/)
    assert.match(worker, /skipped_delivery_unknown/i)
  }
})
