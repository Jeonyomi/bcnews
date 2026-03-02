import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const BASE_URL =
  process.env.BCNEWS_APP_URL ||
  process.env.BCNEWS_APP_ORIGIN ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_URL ||
  process.env.VERCEL_URL

const CRON_SECRET = process.env.BCNEWS_CRON_SECRET || process.env.X_CRON_SECRET || process.env.CRON_SECRET

const normalizeBaseUrl = (value) => {
  const trimmed = String(value || '').trim().replace(/\/$/, '')
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

const logGlobalRun = async (client, { runAtUtc, status, stage, errorMessage, itemsFetched = 0, itemsSaved = 0 }) => {
  if (!client) return

  const baseRow = {
    source_id: null,
    run_at_utc: runAtUtc,
    status,
    error_message: errorMessage || null,
    items_fetched: itemsFetched,
    items_saved: itemsSaved,
  }

  const withStage = { ...baseRow, stage }
  const { error } = await client.from('ingest_logs').insert(withStage)
  if (!error) return
  await client.from('ingest_logs').insert(baseRow)
}

async function fetchJson(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      Accept: 'application/json',
    },
  })

  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = text
  }

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} :: ${typeof json === 'string' ? json : JSON.stringify(json)}`)
  }

  return json
}

const runAt = new Date().toISOString()
const adminClient = getAdminClient()

if (!BASE_URL || !CRON_SECRET) {
  await logGlobalRun(adminClient, {
    runAtUtc: runAt,
    status: 'error',
    stage: 'preflight',
    errorMessage: !BASE_URL
      ? 'missing_base_url: set BCNEWS_APP_URL/BCNEWS_APP_ORIGIN/NEXT_PUBLIC_SITE_URL'
      : 'missing_cron_secret: set BCNEWS_CRON_SECRET/X_CRON_SECRET/CRON_SECRET',
  })

  if (!BASE_URL) throw new Error('BCNEWS_APP_URL (or BCNEWS_APP_ORIGIN) is required')
  throw new Error('CRON secret is required (BCNEWS_CRON_SECRET/X_CRON_SECRET/CRON_SECRET)')
}

const normBase = normalizeBaseUrl(BASE_URL)

const result = {
  startedAt: runAt,
  ingest: null,
  checks: [],
}

try {
  result.ingest = await fetchJson(`${normBase}/api/jobs/ingest`, {
    method: 'POST',
    headers: {
      'x-cron-secret': CRON_SECRET,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  const checks = [
    `${normBase}/api/issues?time_window=24h&limit=5`,
    `${normBase}/api/trends?time_window=7d&limit=5`,
  ]

  for (const target of checks) {
    result.checks.push(await fetchJson(target, { method: 'GET' }))
  }

  const ingestPayload = result.ingest
  const inserted = ingestPayload?.inserted_articles ?? 0
  const updates = ingestPayload?.issue_updates_created ?? 0

  const checksState = result.checks.map((check) => (check?.ok === false || !check?.ok ? 'fail' : 'ok'))
  const failedEndpoint = result.checks.find((check) => check?.ok === false || !check?.ok)
  const failedName = failedEndpoint ? (failedEndpoint?.data?.window ? 'issues_or_trends' : 'unknown') : 'none'

  const checksText = checksState.every((s) => s === 'ok') ? 'ok' : 'fail'
  const ingestState = result?.ingest && !ingestPayload?.error ? 'ok' : 'fail'
  const errorText = ingestPayload?.error || (checksText === 'fail' ? `failed ${failedName}` : 'None')

  await logGlobalRun(adminClient, {
    runAtUtc: runAt,
    status: ingestState === 'ok' ? 'ok' : 'warn',
    stage: 'cron_wrapper',
    errorMessage: ingestState === 'ok' ? null : errorText,
    itemsFetched: 0,
    itemsSaved: inserted,
  })

  const line = `[bcnews ingest] ${ingestState} | inserted=${inserted} updates=${updates} | checks=${checksText} | error=${errorText}`
  console.log(line)
  console.log('bcnews cron ingest/update completed', JSON.stringify(result, null, 2))
} catch (error) {
  await logGlobalRun(adminClient, {
    runAtUtc: runAt,
    status: 'error',
    stage: 'cron_wrapper',
    errorMessage: error?.message || String(error),
  })
  throw error
}
