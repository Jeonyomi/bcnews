#!/usr/bin/env node
require('dotenv/config')

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ALLOWLIST_IDS = [32, 36, 37, 38, 121, 123, 125, 126, 127, 128, 131, 132, 136, 211, 219, 220, 455, 612, 613, 614, 715, 716, 717]

const args = process.argv.slice(2)
const isApply = args.includes('--apply')
const isDryRun = !isApply || args.includes('--dry-run')

const nowTs = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const backupDir = path.join(process.cwd(), 'data', 'backups')
const backupPath = path.join(backupDir, `sources-${nowTs}.json`)

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or anon key) are required')
  }
  return createClient(url, key)
}

async function main() {
  const db = getClient()

  const { data: allSources, error: allErr } = await db
    .from('sources')
    .select('id,name,enabled,type,tier,region,created_at')
    .order('id', { ascending: true })

  if (allErr) throw allErr

  const rows = allSources || []
  const keep = rows.filter((s) => ALLOWLIST_IDS.includes(Number(s.id)))
  const toDelete = rows.filter((s) => !ALLOWLIST_IDS.includes(Number(s.id)))

  fs.mkdirSync(backupDir, { recursive: true })
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        backed_up_at: new Date().toISOString(),
        mode: isApply ? 'apply' : 'dry-run',
        allowlist_ids: ALLOWLIST_IDS,
        total_sources: rows.length,
        keep_count: keep.length,
        delete_count: toDelete.length,
        sources: rows,
      },
      null,
      2,
    ),
    'utf8',
  )

  console.log(`[backup] ${backupPath}`)
  console.log(`[summary] total=${rows.length} keep=${keep.length} delete=${toDelete.length}`)
  console.log(`[preview:delete:first10] ${toDelete.slice(0, 10).map((s) => `${s.id}:${s.name}`).join(', ') || '(none)'}`)
  console.log(`[preview:keep:first10] ${keep.slice(0, 10).map((s) => `${s.id}:${s.name}`).join(', ') || '(none)'}`)

  const missingAllowlist = ALLOWLIST_IDS.filter((id) => !rows.some((s) => Number(s.id) === id))
  if (missingAllowlist.length) {
    console.log(`[warn] allowlist IDs missing in DB: ${missingAllowlist.join(', ')}`)
  }

  if (isDryRun) {
    console.log('[mode] dry-run (default). No DB mutations executed.')
    console.log('[next] Apply with: node scripts/cleanup_sources_allowlist.cjs --apply')
    return
  }

  const { error: enableErr } = await db
    .from('sources')
    .update({ enabled: true })
    .in('id', ALLOWLIST_IDS)

  if (enableErr) throw enableErr

  if (toDelete.length > 0) {
    const deleteIds = toDelete.map((s) => Number(s.id))
    const { error: delErr } = await db
      .from('sources')
      .delete()
      .in('id', deleteIds)
    if (delErr) throw delErr
  }

  const { count: remainCount, error: countErr } = await db
    .from('sources')
    .select('id', { count: 'exact', head: true })
  if (countErr) throw countErr

  const { data: remainRows, error: remainErr } = await db
    .from('sources')
    .select('id,name,enabled')
    .order('id', { ascending: true })
  if (remainErr) throw remainErr

  const remainIds = (remainRows || []).map((r) => Number(r.id))
  const allInAllowlist = remainIds.every((id) => ALLOWLIST_IDS.includes(id))
  const allAllowlistPresent = ALLOWLIST_IDS.every((id) => remainIds.includes(id))

  console.log(`[applied] sources remaining=${remainCount}`)
  console.log(`[verify] allInAllowlist=${allInAllowlist} allAllowlistPresent=${allAllowlistPresent}`)
  if (!allInAllowlist || !allAllowlistPresent || Number(remainCount) !== ALLOWLIST_IDS.length) {
    process.exitCode = 2
    console.log('[verify] mismatch detected: inspect backup + DB state')
  }
}

main().catch((e) => {
  console.error('[error]', e?.message || e)
  process.exit(1)
})
