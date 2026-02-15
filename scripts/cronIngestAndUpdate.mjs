import 'dotenv/config'

const BASE_URL =
  process.env.BCNEWS_APP_URL ||
  process.env.BCNEWS_APP_ORIGIN ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_URL ||
  process.env.VERCEL_URL

const CRON_SECRET = process.env.BCNEWS_CRON_SECRET || process.env.X_CRON_SECRET || process.env.CRON_SECRET

if (!BASE_URL) {
  throw new Error('BCNEWS_APP_URL (or BCNEWS_APP_ORIGIN) is required')
}

if (!CRON_SECRET) {
  throw new Error('CRON secret is required (BCNEWS_CRON_SECRET/X_CRON_SECRET/CRON_SECRET)')
}

const normBase = BASE_URL.replace(/\/$/, '')

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

const result = {
  startedAt: new Date().toISOString(),
  ingest: null,
  checks: [],
}

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

console.log('bcnews cron ingest/update completed', JSON.stringify(result, null, 2))
