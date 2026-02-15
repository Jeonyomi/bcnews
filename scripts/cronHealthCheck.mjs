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

const normBase = BASE_URL.replace(/\/$/, '')

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

console.log('bcnews cron health check', JSON.stringify(checks, null, 2))
