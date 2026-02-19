import 'dotenv/config'

const BASE_URL =
  process.env.BCNEWS_APP_URL ||
  process.env.BCNEWS_APP_ORIGIN ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_URL ||
  process.env.VERCEL_URL

if (!BASE_URL) {
  throw new Error('BCNEWS_APP_URL (or BCNEWS_APP_ORIGIN) is required')
}

const normalizeBaseUrl = (value) => {
  const trimmed = String(value || '').trim().replace(/\/$/, '')
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const normBase = normalizeBaseUrl(BASE_URL)

async function jsonOrThrow(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  const text = await res.text()
  const payload = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} :: ${JSON.stringify(payload)}`)
  }
  return payload
}

const checks = {
  checkedAt: new Date().toISOString(),
  sources: await jsonOrThrow(`${normBase}/api/sources`),
  issues: await jsonOrThrow(`${normBase}/api/issues?time_window=24h&limit=20`),
  articles: await jsonOrThrow(`${normBase}/api/articles?time_window=24h&limit=20`),
}

const sourceCount = checks.sources?.data?.health?.length || 0
const issueCount = checks.issues?.data?.count || checks.issues?.data?.issues?.length || 0
const articleCount = checks.articles?.data?.count || checks.articles?.data?.articles?.length || 0
const downCount = checks.sources?.data?.health
  ? checks.sources.data.health.filter((row) => row.status === 'down').length
  : 0
const failSource = checks.sources?.data?.health
  ? checks.sources.data.health.find((row) => (row.status === 'down' || row.status === 'restricted') && row.status !== 'disabled')?.source_name || 'none'
  : 'none'
const state = downCount > 0 || failSource !== 'none' ? 'fail' : 'ok'
const errorText = failSource !== 'none' ? `source_degraded:${failSource}` : 'None'

const line = `[bcnews health] ${state} | sources=${sourceCount} issues=${issueCount} articles=${articleCount} | failed_endpoint=${failSource || 'none'} | error=${errorText}`
console.log(line)

console.log('bcnews cron health check', JSON.stringify(checks, null, 2))
