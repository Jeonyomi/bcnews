import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient, getSupabaseServerConfig } from '@/lib/supabaseServer'
import { err } from '@/lib/dashboardApi'
import { isBreakingLane } from '@/lib/breakingClassifier'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'

export const dynamic = 'force-dynamic'

const RUN_BUDGET_MS = Number.parseInt(process.env.CRON_RUN_BUDGET_MS || '28000', 10) || 28000
const MAX_SOURCES_PER_RUN = Number.parseInt(process.env.CRON_MAX_SOURCES_PER_RUN || '12', 10) || 12
const MAX_ITEMS_PER_SOURCE = Number.parseInt(process.env.CRON_MAX_ITEMS_PER_SOURCE || '30', 10) || 30
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.CRON_FETCH_TIMEOUT_MS || '15000', 10) || 15000
const FETCH_TRIES = Number.parseInt(process.env.CRON_FETCH_TRIES || '3', 10) || 3
const TITLE_SIMILARITY_THRESHOLD = Number.parseFloat(process.env.INGEST_TITLE_SIM_THRESHOLD || '0.82') || 0.82
const TITLE_DEDUPE_WINDOW_HOURS = Number.parseInt(process.env.INGEST_TITLE_DEDUPE_WINDOW_HOURS || '36', 10) || 36

// Hard allowlist for ingest scope (KBN policy)
const INGEST_SOURCE_ALLOWLIST_IDS = [
  32, 36, 37, 38, 121, 123, 125, 126, 127, 128, 131, 132, 136,
  211, 219, 220, 455, 612, 613, 614, 715, 716, 717,
]

const CRYPTO_RELEVANCE_KEYWORDS = [
  'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'xrp', 'doge', 'bnb',
  'crypto', 'cryptocurrency', 'token', 'blockchain', 'onchain', 'wallet',
  'stablecoin', 'usdt', 'usdc', 'depeg', 'defi', 'cex', 'exchange', 'binance',
  'coinbase', 'etf', 'sec', 'cftc', 'fomc', 'rate cut', 'listing', 'liquidation',
  'hack', 'exploit', 'bridge', 'staking', 'airdrop', 'mainnet', 'l2',
]

const AUTO_POST_DEDUPE_HOURS = Number.parseInt(process.env.AUTO_POST_DEDUPE_HOURS || '12', 10) || 12
const TELEGRAM_BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || ''
const TELEGRAM_BREAKING_CHANNEL = process.env.TG_BREAKING_CHANNEL || '@Krypto_breaking'
const AUTO_POST_MODE = String(process.env.AUTO_POST_MODE || 'all_post').toLowerCase()


const BREAKING_TIER_A_ALLOWLIST = [
  'Reuters',
  'FinancialJuice',
  'Binance Announcements',
  'Coinbase Announcements',
    'SEC',
  'CFTC',
  'Federal Reserve',
  'U.S. Treasury',
  'Blockmedia',
  'Tokenpost',
  'Coinness',
]

const BREAKING_TIER_B_ALLOWLIST = [
  'CoinDesk',
  'The Block',
  'DL News',
  'Blockworks',
  'Decrypt',
]

const TAG_RULES: Array<{ tag: string; keywords: string[] }> = [
  { tag: '#BTC', keywords: ['bitcoin', 'btc'] },
  { tag: '#ETH', keywords: ['ethereum', 'eth'] },
  { tag: '#ALT', keywords: ['solana', 'xrp', 'altcoin', 'token'] },
  { tag: '#MACRO', keywords: ['war', 'oil', 'rates', 'rate cut', 'cpi', 'inflation', 'fed', 'fomc', 'treasury yield', 'geopolitics'] },
  { tag: '#REGULATION', keywords: ['sec', 'cftc', 'regulation', 'lawsuit', 'compliance', 'enforcement'] },
  { tag: '#EXCHANGE', keywords: ['binance', 'coinbase', 'exchange', 'listing', 'delisting'] },
  { tag: '#HACK', keywords: ['hack', 'exploit', 'breach'] },
  { tag: '#STABLECOIN', keywords: ['stablecoin', 'usdt', 'usdc', 'depeg'] },
  { tag: '#ETF', keywords: ['etf'] },
  { tag: '#ONCHAIN', keywords: ['onchain', 'wallet', 'validator', 'bridge', 'staking', 'gas fee', 'mempool'] },
]

const deriveBreakingTags = (text: string) => {
  const lower = String(text || '').toLowerCase()
  const tags: string[] = []
  for (const rule of TAG_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) tags.push(rule.tag)
    if (tags.length >= 3) break
  }
  return tags
}

const ALWAYS_ALLOW_SOURCES = [
  'FinancialJuice',
  'Binance Announcements',
  'Coinbase Announcements',
  'Coinbase Blog',
  'Upbit Announcements',
  'Bithumb Announcements',
  'Coinone Announcements',
]
const KR_TITLE_SAFE_SOURCES = ['Tokenpost', 'Blockmedia', 'Coinness']
const KR_EXCHANGE_NOTICE_SOURCES = ['Upbit Announcements', 'Bithumb Announcements', 'Coinone Announcements']

const NON_CRYPTO_NOISE_KEYWORDS = [
  'nba', 'nfl', 'mlb', 'celebrity', 'fashion', 'movie', 'box office', 'recipe',
  'travel', 'iphone review', 'real estate tips', 'gossip',
]

type SourceType = {
  id: number
  name: string
  type: string
  tier: string | null
  url: string
  rss_url: string | null
  region: 'KR' | 'Global' | null
}

type IngestCursorState = {
  cursor_source_id: number | null
  updated_at?: string | null
}

const INGEST_CURSOR_KEY = 'default'

const getIngestCursorState = async (client: any): Promise<IngestCursorState> => {
  // Read from ingest_logs marker first: this path is known to be available in all envs.
  const marker = await client
    .from('ingest_logs')
    .select('error_message,run_at_utc')
    .is('source_id', null)
    .like('error_message', 'cursor_state:%')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!marker.error && marker.data?.error_message) {
    try {
      const raw = String(marker.data.error_message)
      const parsed = JSON.parse(raw.slice('cursor_state:'.length))
      const cursor = Number(parsed?.cursor_source_id)
      return {
        cursor_source_id: Number.isFinite(cursor) ? cursor : null,
        updated_at: marker.data?.run_at_utc || null,
      }
    } catch {
      // continue to ingest_state fallback
    }
  }

  const { data, error } = await client
    .from('ingest_state')
    .select('cursor_source_id,updated_at')
    .eq('state_key', INGEST_CURSOR_KEY)
    .maybeSingle()

  if (!error) {
    return {
      cursor_source_id: Number.isFinite(Number(data?.cursor_source_id)) ? Number(data.cursor_source_id) : null,
      updated_at: data?.updated_at || null,
    }
  }

  console.warn('ingest_cursor_read_failed', { error: String((error as any)?.message || error) })
  return { cursor_source_id: null }
}

const setIngestCursorState = async (client: any, nextCursorSourceId: number | null, runAtUtc: string) => {
  const payload = {
    state_key: INGEST_CURSOR_KEY,
    cursor_source_id: nextCursorSourceId,
    last_run_at_utc: runAtUtc,
    updated_at: new Date().toISOString(),
  }

  const { error } = await client
    .from('ingest_state')
    .upsert(payload, { onConflict: 'state_key' })

  if (error) {
    console.warn('ingest_cursor_write_failed_primary', {
      next_cursor_source_id: nextCursorSourceId,
      error: String((error as any)?.message || error),
    })
  }

  // Always emit cursor marker to ingest_logs for portable, schema-agnostic replay.
  const markerPayload = `cursor_state:${JSON.stringify({ cursor_source_id: nextCursorSourceId })}`
  const marker = await client.from('ingest_logs').insert({
    source_id: null,
    run_at_utc: runAtUtc,
    status: 'ok',
    error_message: markerPayload,
    items_fetched: 0,
    items_saved: 0,
  })

  if (marker.error) {
    console.warn('ingest_cursor_write_marker_failed', {
      next_cursor_source_id: nextCursorSourceId,
      error: String((marker.error as any)?.message || marker.error),
    })
    return false
  }

  return true
}

const buildRoundRobinQueue = (sources: SourceType[], previousCursorSourceId: number | null) => {
  const ordered = [...sources].sort((a, b) => Number(a.id) - Number(b.id))

  const priority = ordered.filter((s) => KR_EXCHANGE_NOTICE_SOURCES.includes(String(s.name || '')))
  const regular = ordered.filter((s) => !KR_EXCHANGE_NOTICE_SOURCES.includes(String(s.name || '')))

  const remainingSlots = Math.max(0, MAX_SOURCES_PER_RUN - priority.length)
  if (remainingSlots === 0 || regular.length === 0) {
    return {
      queue: priority.slice(0, MAX_SOURCES_PER_RUN),
      cursor_before: previousCursorSourceId,
      regular_pool_size: regular.length,
      selected_regular_ids: [] as number[],
      regular_start_index: 0,
      regular_ids_order: regular.map((s) => Number(s.id)),
      priority_ids: priority.map((s) => Number(s.id)),
    }
  }

  let startIndex = 0
  if (previousCursorSourceId !== null) {
    const nextIdx = regular.findIndex((s) => Number(s.id) > Number(previousCursorSourceId))
    startIndex = nextIdx >= 0 ? nextIdx : 0
  }

  const selected: SourceType[] = []
  for (let i = 0; i < Math.min(remainingSlots, regular.length); i += 1) {
    const idx = (startIndex + i) % regular.length
    selected.push(regular[idx])
  }

  // Keep priority first, but front-load one regular source right after the first
  // priority source to prevent starvation when time budget is tight.
  const queue = [
    ...priority.slice(0, 1),
    ...selected.slice(0, 1),
    ...priority.slice(1),
    ...selected.slice(1),
  ]

  return {
    queue,
    cursor_before: previousCursorSourceId,
    regular_pool_size: regular.length,
    selected_regular_ids: selected.map((s) => Number(s.id)),
    regular_start_index: startIndex,
    regular_ids_order: regular.map((s) => Number(s.id)),
    priority_ids: priority.map((s) => Number(s.id)),
  }
}

const getSecret = () =>
  process.env.X_CRON_SECRET || process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET

const decodeHtml = (value: string) => {
  if (!value) return value

  const numericEntity = value.replace(/&#(x?[0-9a-fA-F]+);/g, (match, p1) => {
    if (p1.toLowerCase().startsWith('x')) {
      const hex = p1.slice(1)
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }

    const code = Number.parseInt(p1, 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : match
  })

  return numericEntity
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
}

const normalizeDate = (value?: string) => {
  if (!value) return new Date().toISOString()

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

const extractLinkFromEntry = (entry: string) => {
  const cdataStripped = entry.replace(/<!\[CDATA\[|\]\]>/g, '')
  // Atom feeds frequently use href with either single/double quotes and arbitrary
  // attribute order. Support both forms before falling back to <link>text</link>.
  const hrefMatch =
    cdataStripped.match(/<link[^>]*\shref\s*=\s*"([^"]+)"[^>]*>/i) ||
    cdataStripped.match(/<link[^>]*\shref\s*=\s*'([^']+)'[^>]*>/i)
  if (hrefMatch) return decodeHtml(hrefMatch[1]).trim()

  const linkMatch = cdataStripped.match(/<link>([\s\S]*?)<\/link>/i)
  return linkMatch ? linkMatch[1].trim() : ''
}

const stripHtmlTags = (value: string) =>
  decodeHtml((value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim())

const decodeHtmlEntities = (value: string) =>
  (value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code) || 0))

const sanitizeKrTitle = (value: string) =>
  decodeHtmlEntities(stripHtmlTags(value || ''))
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00B7\u2022\u2026\u2013\u2014]/g, ' ')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()

const hasDotSpam = (value: string) => {
  const s = String(value || '').trim()
  if (s.length < 12) return false
  const dots = (s.match(/\./g) || []).length
  return dots >= 4 && dots / s.length >= 0.2
}


const normalizeFeedLink = (value: string) =>
  decodeHtmlEntities(String(value || ''))
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/gi, '&')
    .trim()

const normalizeAbsoluteHttpUrl = (value: string) => {
  const raw = normalizeFeedLink(value || '')
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.toString()
  } catch {
    return ''
  }
}

const sanitizeHnText = (value: string) =>
  decodeHtmlEntities(stripHtmlTags(value || ''))
    .replace(/\bArticle URL\s*:[^\n]*/gi, ' ')
    .replace(/\bComments URL\s*:[^\n]*/gi, ' ')
    .replace(/\bnews\.ycombi[^\s]*/gi, ' ')
    .replace(/\bhttps?:\/\/[^\s]*\.\.\.[^\s]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const cleanTitle = (title: string, summary: string, sourceName = '') => {
  const source = String(sourceName || '')

  if (KR_TITLE_SAFE_SOURCES.includes(source)) {
    const krTitle = sanitizeKrTitle(title || '')
    if (krTitle) return krTitle
    const krFallback = sanitizeKrTitle(summary || '')
    if (!krFallback) return ''
    return krFallback.slice(0, 120)
  }

  const decoded = decodeHtmlEntities(stripHtmlTags(title || '')).replace(/^[\[,\s\-??:;|]+/, '').trim()
  if (decoded) return decoded

  const summaryFallback = decodeHtmlEntities(stripHtmlTags(summary || '')).replace(/^[\[,\s\-??:;|]+/, '').trim()
  if (!summaryFallback) return ''
  return summaryFallback.slice(0, 120)
}



const extractItemsFromNoticeHtml = (html: string, baseUrl: string, sourceName = '') => {
  const items: Array<{ title: string; link: string; summary: string; publishedAt: string }> = []
  const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const toAbs = (href: string) => {
    try { return new URL(href, baseUrl).toString() } catch { return href }
  }

  for (const m of html.matchAll(anchorRegex)) {
    const href = String(m[1] || '').trim()
    const text = cleanTitle(stripHtmlTags(String(m[2] || '')), '', sourceName)
    if (!href || !text || text.length < 8) continue
    if (/^javascript:/i.test(href)) continue
    const link = normalizeFeedLink(toAbs(href))
    if (!/(notice|announcement|support|service_center|customer_support|info_notice|\/n\/[0-9]+|\b공지\b)/i.test(link)) continue
    items.push({ title: text, link, summary: text, publishedAt: new Date().toISOString() })
    if (items.length >= 60) break
  }

  const uniq = new Map<string, { title: string; link: string; summary: string; publishedAt: string }>()
  for (const it of items) {
    const key = canonicalizeUrl(it.link)
    if (!uniq.has(key)) uniq.set(key, it)
  }
  return Array.from(uniq.values())
}
const extractItemsFromRss = (xml: string, sourceName = "") => {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || []
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) || []

  const parseEntry = (entry: string, isAtom = false) => {
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/i)
    const linkText = isAtom ? extractLinkFromEntry(entry) : ''
    const linkMatch = isAtom
      ? null
      : entry.match(/<link>([\s\S]*?)<\/link>/i)
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/i)
    const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i)
    const dateMatch =
      entry.match(/<published>([\s\S]*?)<\/published>/i) ||
      entry.match(/<updated>([\s\S]*?)<\/updated>/i)

    const isHn = String(sourceName || '').toLowerCase().includes('hacker news')
    const title = titleMatch
      ? stripHtmlTags(titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ''))
      : ''
    const link = normalizeAbsoluteHttpUrl(isAtom ? linkText : (linkMatch ? linkMatch[1] : ''))
    const summarySource = summaryMatch || contentMatch
    const rawSummary = summarySource
      ? stripHtmlTags(summarySource[1].replace(/<!\[CDATA\[|\]\]>/g, ''))
      : ''
    const summary = isHn ? cleanTitle(sanitizeHnText(title), '', sourceName) : rawSummary
    const dateSource = dateMatch?.[1]
    const publishedAt = normalizeDate(dateSource)

    return { title: cleanTitle(isHn ? sanitizeHnText(title) : title, summary, sourceName), link, summary, publishedAt }
  }

  return items
    .map((item) => {
      const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i)
      const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i)
      const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i)
      const pubMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)

      const isHn = String(sourceName || '').toLowerCase().includes('hacker news')
      const title = titleMatch
        ? stripHtmlTags(titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ''))
        : ''
      const link = normalizeAbsoluteHttpUrl(linkMatch ? linkMatch[1] : '')
      const rawSummary = descMatch
        ? stripHtmlTags(descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ''))
        : ''
      const summary = isHn ? cleanTitle(sanitizeHnText(title), '', sourceName) : rawSummary
      const publishedAt = normalizeDate(pubMatch?.[1])

      return { title: cleanTitle(isHn ? sanitizeHnText(title) : title, summary, sourceName), link, summary, publishedAt }
    })
    .filter((row) => row.title && row.link)
    .concat(
      entries
        .map((entry) => parseEntry(entry, true))
        .filter((row) => row.title && row.link),
    )
}

const canonicalizeUrl = (value: string) => {
  try {
    const url = new URL(value)
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
      url.searchParams.delete(key)
    }
    url.hash = ''
    return url.toString()
  } catch {
    return value
  }
}

const hashContent = (text: string) => crypto.createHash('sha256').update(text).digest('hex')


const normalizeTextForHash = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[^a-z0-9\s]/gi, '')
    .trim()

const buildLookupHash = (canonicalUrl: string, title: string, summary: string) =>
  hashContent(`${canonicalUrl}::${normalizeTextForHash(title)}::${normalizeTextForHash(summary)}`)

const fetchWithTimeout = async (url: string, timeoutMs = FETCH_TIMEOUT_MS, options?: RequestInit) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options?.headers || {}),
        'User-Agent': 'bcnews-ingest-bot/1.0 (+https://bcnews-agent.vercel.app)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

const fetchWithRetry = async (url: string, tries = FETCH_TRIES, timeoutMs = FETCH_TIMEOUT_MS) => {
  let lastError: unknown

  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, timeoutMs)
      if (response.ok) return response

      const shouldRetry =
        response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504
      if (!shouldRetry || attempt === tries) {
        throw new Error(`rss_fetch_status_${response.status}`)
      }

      await new Promise((resolve) => setTimeout(resolve, 750 * attempt))
      continue
    } catch (error) {
      lastError = error
      if (attempt === tries) break
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    }
  }

  throw new Error(`rss_fetch_status_network_${String(lastError)}`)
}

const deriveTopic = (title: string, summary: string) => {
  const text = `${title} ${summary}`.toLowerCase()
  if (text.includes('regulation') || text.includes('policy') || text.includes('regulatory')) return 'regulation'
  if (
    text.includes('issuer') ||
    text.includes('issuer reserves') ||
    text.includes('reserves') ||
    text.includes('company')
  ) {
    return 'issuer'
  }
  if (text.includes('pay') || text.includes('payment') || text.includes('bank')) return 'payments'
  if (text.includes('macro') || text.includes('fed') || text.includes('inflation')) return 'macro'
  if (text.includes('aml') || text.includes('enforcement') || text.includes('crime') || text.includes('fraud')) return 'aml'
  return 'defi'
}

const extractEntities = (text: string) => {
  const entities = new Set<string>()
  const known = ['Tether', 'USDT', 'USDC', 'Binance', 'Coinbase', 'SEC', 'FDIC', 'BIS', 'IMF']

  for (const token of known) {
    if (text.includes(token)) entities.add(token)
  }
  return Array.from(entities)
}

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const toTokenSet = (value: string) => {
  const tokens = normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => token.length >= 3)
    .map((token) => token.replace(/s$/, ''))

  return new Set(tokens)
}

const readEntityArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  return []
}

const jaccardRatio = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 && b.size === 0) return 0
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection += 1
  }

  const union = a.size + b.size - intersection
  if (union === 0) return 0
  return intersection / union
}

const issueMatchScore = (args: {
  candidate: {
    id: number
    topic_label: string
    issue_summary: string | null
    title: string | null
    key_entities: unknown
    last_seen_at_utc: string
  }
  topic: string
  titleTokens: Set<string>
  summaryTokens: Set<string>
  entities: string[]
  windowMinutes: number
}) => {
  const { candidate, topic, titleTokens, summaryTokens, entities, windowMinutes } = args

  const candidateTopic = String(candidate.topic_label || '')
  const sameTopic = candidateTopic === topic
  const topicBonus = sameTopic ? 42 : 14

  const candidateEntities = new Set(
    readEntityArray(candidate.key_entities).map((item) => item.toLowerCase()),
  )
  const incomingEntities = new Set(entities.map((item) => item.toLowerCase()))

  const entityOverlap = jaccardRatio(candidateEntities, incomingEntities)
  const entityPenalty = incomingEntities.size === 0 && candidateEntities.size === 0 ? 0 : entityOverlap

  const candidateTitle = String(candidate.title || '')
  const candidateSummary = String(candidate.issue_summary || '')
  const candidateTokens = toTokenSet(`${candidateTitle} ${candidateSummary}`)

  const titleOverlap = jaccardRatio(titleTokens, candidateTokens)
  const summaryOverlap = jaccardRatio(summaryTokens, candidateTokens)

  const topicSignal = /(defi|stablecoin|peg|chain|exchange|issuer|regulat|payment|aml|fraud|macro|fed)/.test(
    candidateTopic.toLowerCase(),
  )
  const topicSignalMatch = sameTopic || (topicSignal && topic === candidateTopic)

  const seenAtDate = new Date(candidate.last_seen_at_utc)
  const ageHours = Number.isNaN(seenAtDate.getTime())
    ? windowMinutes
    : Math.max(0, (Date.now() - seenAtDate.getTime()) / (1000 * 60 * 60))
  const recencyBoost = Math.max(0, 16 - Math.floor(ageHours / 3))

  const base =
    topicBonus +
    entityPenalty * 34 +
    titleOverlap * 30 +
    summaryOverlap * 12 +
    recencyBoost +
    (topicSignalMatch ? 8 : 0)

  return Math.round(base * 100) / 100
}

const isBestMatch = (score: number, topic: string, candidateTopic: string, windowMinutes: number) => {
  if (score >= 45) return true
  if (score >= 38 && candidateTopic === topic) return true
  return score >= 52 && windowMinutes <= 120
}

const parseTierScore = (tier: string | null) => {
  switch ((tier || '').toLowerCase()) {
    case '1':
    case 'tier1':
    case 'tier 1':
    case 'official':
      return 35
    case '2':
    case 'tier2':
    case 'tier 2':
    case 'major':
      return 22
    case '3':
    case 'tier3':
    case 'tier 3':
      return 14
    default:
      return 8
  }
}

const keywordSignals = {
  regulation: 32,
  issuer: 24,
  payments: 18,
  macro: 16,
  aml: 30,
  defi: 15,
  'macro-policy': 12,
  unknown: 10,
} as const

const clampScore = (value: number) => Math.max(0, Math.min(100, value))

const labelFromScore = (score: number) => {
  if (score >= 72) return 'HIGH'
  if (score >= 44) return 'MED'
  return 'LOW'
}

const titleSimilarity = (a: string, b: string) => {
  const aTokens = toTokenSet(a)
  const bTokens = toTokenSet(b)
  return jaccardRatio(aTokens, bTokens)
}

const isCryptoRelevant = (title: string, summary: string) => {
  const text = `${title} ${summary}`.toLowerCase()

  if (NON_CRYPTO_NOISE_KEYWORDS.some((k) => text.includes(k))) return false

  let hit = 0
  for (const keyword of CRYPTO_RELEVANCE_KEYWORDS) {
    if (text.includes(keyword)) hit += 1
  }

  const strongSignal = /(stablecoin|depeg|crypto|bitcoin|ethereum|etf|exploit|hack|binance|coinbase|defi)/.test(text)
  return strongSignal || hit >= 2
}

const topicKeywords = (title: string, summary: string) => {
  const text = `${title}
${summary}`.toLowerCase()
  const tokens: string[] = []

  if (/(regulation|regulatory|policy|compliance|governance|directive|legal)/.test(text)) tokens.push('regulation')
  if (/(issuer|reserves?|mint|reserve|company|treasury|stablecoin)/.test(text)) tokens.push('issuer')
  if (/(payment|wallet|transfer|bank|clearing|onchain|remittance)/.test(text)) tokens.push('payments')
  if (/(macro|inflation|fed|fomc|rate|monetary|central bank)/.test(text)) tokens.push('macro')
  if (/(aml|fraud|crime|enforcement|investigation|compliance|hack|security|investigation)/.test(text)) tokens.push('aml')
  if (/(defi|liquidity|peg|depeg|redeem|burn|mint|stablecoin|reserves)/.test(text)) tokens.push('defi')

  return Array.from(new Set(tokens))
}

const computeScores = (args: {
  sourceTier: string | null
  topic: string
  entities: string[]
  title: string
  summary: string
}) => {
  const { sourceTier, topic, entities, title, summary } = args

  const sourceScore = parseTierScore(sourceTier)
  const topicScore = keywordSignals[topic as keyof typeof keywordSignals] || keywordSignals.unknown
  const keywordBoost = Math.min(20, topicKeywords(title, summary).length * 6)
  const entityBoost = Math.min(24, entities.length * 4)
  const score = clampScore(sourceScore + topicScore + keywordBoost + entityBoost)
  return { score, importance_label: labelFromScore(score) }
}

const regionFromSource = (value: string | null) => {
  if (value === 'KR') return 'KR'
  return 'Global'
}



const insertChannelPostSafe = async (client: any, row: any) => {
  const { error } = await client.from('channel_posts').insert({ ...row })
  if (!error) return

  if (String(error.message || '').includes('reason')) {
    const fallback = { ...row }
    delete fallback.reason
    const { error: fallbackErr } = await client.from('channel_posts').insert(fallback)
    if (!fallbackErr) return
    throw fallbackErr
  }

  throw error
}

const sendTelegramMessage = async (text: string) => {

  if (!TELEGRAM_BOT_TOKEN) throw new Error('missing_telegram_bot_token')

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_BREAKING_CHANNEL,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    }),
  })

  const payload = await response.json().catch(() => ({} as any))
  if (!response.ok || !payload?.ok) {
    throw new Error(`telegram_send_failed: ${payload?.description || response.statusText}`)
  }

  return {
    messageId: Number(payload.result?.message_id || 0),
    chatId: String(payload.result?.chat?.id || TELEGRAM_BREAKING_CHANNEL),
  }
}


const escapeTelegramMarkdownV2 = (value: string) =>
  String(value || '').replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1')

const escapeTelegramUrl = (value: string) => encodeURI(String(value || '')).replace(/[()]/g, (m) => (m === '(' ? '%28' : '%29'))

const formatKbnPost = (payload: {
  title: string
  summary?: string
  why?: string
  sourceName: string
  canonicalUrl?: string
  fallbackUrl: string
  importanceLabel?: string
}) => {
  const clean = cleanTitle(
    String(payload.title || ''),
    String(payload.summary || payload.why || ''),
    String(payload.sourceName || ''),
  )
  const importance = String(payload.importanceLabel || '').toUpperCase()
  const hasPrefix = clean.startsWith('[속보]')
  const finalTitle = importance === 'HIGH'
    ? (hasPrefix ? clean : `[속보] ${clean}`)
    : clean

  const link = normalizeFeedLink(String(payload.canonicalUrl || payload.fallbackUrl || '').trim())
  const text = `💥[${escapeTelegramMarkdownV2(finalTitle)}](${escapeTelegramUrl(link)})`

  return { text, finalTitle, link }
}

const isValidHttpUrl = (value: string) => {
  try {
    const u = new URL(String(value || '').trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const hasBadKrNoticeTitle = (title: string) => {
  const raw = String(title || '').trim()
  const normalized = raw
    .replace(/^\[속보\]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized || normalized.length < 8) return true

  return /(업비트\s*-\s*업비트|빗썸\s*-\s*빗썸|코인원\s*-\s*코인원)/i.test(normalized)
}

const autoPostBreaking = async (client: any, payload: {
  articleId: number
  sourceName: string
  headline: string
  articleUrl: string
  canonicalUrl?: string
  contentHash?: string
  summary: string
  whyItMatters?: string
  importanceLabel: string
}) => {
  const dedupeBase = hashContent(`${payload.canonicalUrl || payload.articleUrl || ''}|${payload.contentHash || ''}|${payload.headline}`.toLowerCase())

  const skip = async (reason: string, postText: string | null) => {
    await insertChannelPostSafe(client, {
      status: 'skipped', lane: 'breaking', article_id: payload.articleId,
      source_name: payload.sourceName, headline: payload.headline, headline_ko: payload.headline,
      article_url: payload.canonicalUrl || payload.articleUrl, tags: [], post_text: postText,
      target_channel: TELEGRAM_BREAKING_CHANNEL, target_admin: '@master_billybot',
      dedupe_key: `breaking:${dedupeBase}:${Date.now()}:${reason.slice(0,24)}`,
      reason, approved_by: 'auto',
    })
    return { posted: false, reason }
  }

  if (!String(payload.headline || '').trim() || !isValidHttpUrl(payload.canonicalUrl || payload.articleUrl)) {
    return skip('skipped_invalid_payload', null)
  }

  const post = formatKbnPost({
    title: payload.headline,
    summary: payload.summary,
    why: payload.whyItMatters,
    sourceName: payload.sourceName,
    canonicalUrl: payload.canonicalUrl,
    fallbackUrl: payload.articleUrl,
    importanceLabel: payload.importanceLabel,
  })

  const isKrNoticeSource = KR_EXCHANGE_NOTICE_SOURCES.includes(String(payload.sourceName || ''))
  if (isKrNoticeSource && hasBadKrNoticeTitle(post.finalTitle)) {
    return skip(CHANNEL_POST_REASONS.SKIPPED_BAD_NOTICE_TITLE, post.text)
  }

  const { data: dup } = await client
    .from('channel_posts')
    .select('id')
    .eq('lane', 'breaking')
    .eq('status', 'posted')
    .or(`article_url.eq.${post.link},dedupe_key.like.breaking:${dedupeBase}:%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (dup?.id) return skip(CHANNEL_POST_REASONS.SKIPPED_DUPLICATE, post.text)

  try {
    const sent = await sendTelegramMessage(post.text)
    await insertChannelPostSafe(client, {
      status: 'posted', lane: 'breaking', article_id: payload.articleId,
      source_name: payload.sourceName, headline: post.finalTitle, headline_ko: post.finalTitle,
      article_url: post.link, tags: [], post_text: post.text,
      target_channel: TELEGRAM_BREAKING_CHANNEL, target_admin: '@master_billybot',
      dedupe_key: `breaking:${dedupeBase}:${Date.now()}`,
      posted_at: new Date().toISOString(), approved_by: 'auto',
      telegram_message_id: sent.messageId, telegram_chat_id: sent.chatId, reason: CHANNEL_POST_REASONS.POSTED_AUTO,
    })
    return { posted: true, reason: CHANNEL_POST_REASONS.POSTED_AUTO }
  } catch (sendErr: any) {
    const failReason = `failed_send:${String(sendErr?.message || sendErr)}`.slice(0, 180)
    await insertChannelPostSafe(client, {
      status: 'failed', lane: 'breaking', article_id: payload.articleId,
      source_name: payload.sourceName, headline: post.finalTitle, headline_ko: post.finalTitle,
      article_url: post.link, tags: [], post_text: post.text,
      target_channel: TELEGRAM_BREAKING_CHANNEL, target_admin: '@master_billybot',
      dedupe_key: `breaking:${dedupeBase}:${Date.now()}:failed`,
      approved_by: 'auto', reason: failReason,
    })
    return { posted: false, reason: CHANNEL_POST_REASONS.FAILED_SEND }
  }
}

const insertSourceRunLog = async (client: any, runLog: any) => {
  if (!client || !runLog) return false

  const row: any = {
    source_id: runLog.source_id || null,
    run_at_utc: runLog.run_at_utc || new Date().toISOString(),
    status: runLog.status || 'ok',
    error_message: runLog.error_message || null,
    items_fetched: runLog.items_fetched || 0,
    items_saved: runLog.items_saved || 0,
  }

  const { error } = await client.from('ingest_logs').insert(row)
  if (error) {
    console.error('ingest_log_insert_failed', { source_id: row.source_id, error })
    return false
  }
  return true
}

const buildDebugEnv = async (client: any) => {
  const cfg = getSupabaseServerConfig()

  let dbNow: { ok: boolean; value: any; error: any } = { ok: false, value: null, error: null }
  try {
    const r: any = await client.rpc('db_now')
    dbNow = { ok: !r?.error, value: r?.data ?? null, error: r?.error ?? null }
  } catch (e: any) {
    dbNow = { ok: false, value: null, error: String(e) }
  }

  return {
    supabase_host_hash: cfg.supabaseHostHash,
    service_role_hash_prefix: cfg.serviceRoleHashPrefix,
    db_now: dbNow.value || null,
    db_now_error: dbNow.ok ? null : (dbNow.error || 'db_now_unavailable'),
  }
}

const verifyGlobalReadback = async (client: any, runAtUtc?: string | null) => {
  if (!runAtUtc) return { found: false, row: null }
  const q = await client
    .from('ingest_logs')
    .select('id,run_at_utc,status,source_id')
    .is('source_id', null)
    .eq('run_at_utc', runAtUtc)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (q.error) return { found: false, error: q.error, row: null }
  return { found: !!q.data, row: q.data || null }
}

const writeGlobalIngestLog = async (client: any, payload: {
  runAtUtc: string
  status: string
  stage: string
  errorMessage?: string | null
  itemsFetched?: number
  itemsSaved?: number
}) => {
  if (!client) return { ok: false, error: 'missing_client' }

  const baseRow: any = {
    source_id: null,
    run_at_utc: payload.runAtUtc,
    status: payload.status,
    error_message: payload.errorMessage || null,
    items_fetched: payload.itemsFetched || 0,
    items_saved: payload.itemsSaved || 0,
  }

  const withStage = { ...baseRow, stage: payload.stage }
  const { error: stageErr } = await client.from('ingest_logs').insert(withStage)
  if (!stageErr) return { ok: true, usedStage: true, row: withStage }

  const { error: baseErr } = await client.from('ingest_logs').insert(baseRow)
  if (!baseErr) return { ok: true, usedStage: false, row: baseRow, stageError: stageErr }

  return {
    ok: false,
    error: {
      stageErr,
      baseErr,
      payload,
    },
  }
}


export async function POST(request: Request) {
  let client: any = null
  const runAt = new Date().toISOString()

  try {
    const runStart = Date.now()

    const shouldStop = () => Date.now() - runStart > RUN_BUDGET_MS - 1500

    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json(err('unauthorized'), { status: 401 })
    }

    client = createSupabaseServerClient()
    const body = await request.json().catch(() => ({} as any))
    const debugRR = body?.debug_rr === true || new URL(request.url).searchParams.get('debug_rr') === '1'
    const debugReturnMetrics = body?.debug_return_metrics === true || new URL(request.url).searchParams.get('debug_return_metrics') === '1'

    if (body?.debug_global_log === true) {
      const write = await writeGlobalIngestLog(client, {
        runAtUtc: runAt,
        status: 'ok',
        stage: 'diagnostic',
        itemsFetched: 0,
        itemsSaved: 0,
      })

      if (!write.ok) {
        return NextResponse.json({ ok: false, error: 'diagnostic_insert_failed', write }, { status: 500 })
      }

      const latest = await client
        .from('ingest_logs')
        .select('id,run_at_utc,status,source_id,error_message')
        .is('source_id', null)
        .order('run_at_utc', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latest.error) {
        return NextResponse.json({ ok: false, error: 'diagnostic_select_failed', write, latest }, { status: 500 })
      }

      const debugEnv = await buildDebugEnv(client)
      const readback = await verifyGlobalReadback(client, write?.row?.run_at_utc || runAt)
      return NextResponse.json({ ok: true, write, readback, latest: latest.data, debug_env: debugEnv })
    }

    // Deterministic global run freshness marker for every ingest call.
    const globalLogStart = await writeGlobalIngestLog(client, {
      runAtUtc: runAt,
      status: 'ok',
      stage: 'ingest_start',
      itemsFetched: 0,
      itemsSaved: 0,
    })
    const globalMarkerWritten = !!globalLogStart?.ok
    const globalLogStartReadback = await verifyGlobalReadback(client, globalLogStart?.row?.run_at_utc || runAt)

    const { data: sources, error: sourceError } = await client
      .from('sources')
      .select('id,name,type,tier,url,rss_url,region,last_success_at,last_error_at')
      .eq('enabled', true)
      .in('id', INGEST_SOURCE_ALLOWLIST_IDS)
      // PERF: process non-erroring sources first, then those with recent success.
      .order('last_error_at', { ascending: true, nullsFirst: true })
      .order('last_success_at', { ascending: false, nullsFirst: false })
    if (sourceError) throw sourceError

    if (!sources || sources.length === 0) {
      const globalLogNoSources = await writeGlobalIngestLog(client, {
        runAtUtc: runAt,
        status: 'warn',
        stage: 'preflight',
        errorMessage: 'no_enabled_sources',
      })
      const debugEnv = await buildDebugEnv(client)
      return NextResponse.json({ ok: true, inserted_articles: 0, issue_updates_created: 0, sources_processed: 0, stopped_early: false, next_cursor: null, global_log_write_start: globalLogStart, global_log_write_start_readback: globalLogStartReadback, global_log_write_preflight: globalLogNoSources, debug_env: debugEnv })
    }

    let insertedArticles = 0
    let issueUpdatesCreated = 0
    let sourcesProcessed = 0
    let stoppedEarly = false

    const autopostEval = {
      candidates: 0,
      posted: 0,
      skipped: 0,
      skippedReasons: {} as Record<string, number>,
    }

    const cursorState = await getIngestCursorState(client)
    const queuePlan = buildRoundRobinQueue(sources as SourceType[], cursorState.cursor_source_id)
    const sourceQueue = queuePlan.queue
    const regularAttemptedIds: number[] = []
    const attemptedSourceIds: number[] = []
    const completedSourceIds: number[] = []
    const runlogInsertedSourceIds: number[] = []
    const perSourceMs: Record<number, number> = {}
    let runlogInsertOkCount = 0

    let processedCount = 0

    for (const source of sourceQueue) {
      if (processedCount >= MAX_SOURCES_PER_RUN) {
        stoppedEarly = true
        break
      }

      if (shouldStop()) {
        stoppedEarly = true
        break
      }

      const runLog: any = {
        source_id: source.id,
        run_at_utc: runAt,
        status: 'ok',
        error_message: null,
        items_fetched: 0,
        items_saved: 0,
      }
      const sourceStartedAt = Date.now()
      attemptedSourceIds.push(Number(source.id))
      sourcesProcessed += 1
      processedCount += 1
      if (!KR_EXCHANGE_NOTICE_SOURCES.includes(String(source.name || ''))) {
        regularAttemptedIds.push(Number(source.id))
      }

      try {
        const primaryUrl = source.rss_url || source.url
        const isKrExchangeNotice = KR_EXCHANGE_NOTICE_SOURCES.includes(String(source.name || ''))
        const fetchTries = isKrExchangeNotice ? Math.max(FETCH_TRIES, 4) : FETCH_TRIES
        const fetchTimeoutMs = isKrExchangeNotice ? Math.max(FETCH_TIMEOUT_MS, 22000) : FETCH_TIMEOUT_MS
        let response
        try {
          response = await fetchWithRetry(primaryUrl, fetchTries, fetchTimeoutMs)
        } catch (primaryError) {
          // Fallback: many sources expose broken/removed RSS endpoints.
          // If RSS URL fails, try the source URL once before marking source error.
          if (source.rss_url && source.url && source.url !== source.rss_url) {
            try {
              response = await fetchWithRetry(source.url, fetchTries, fetchTimeoutMs)
            } catch {
              throw primaryError
            }
          } else {
            throw primaryError
          }
        }

        const xml = await response.text()
        let parsed = extractItemsFromRss(xml, String(source.name || ""))
        if (parsed.length === 0 && KR_EXCHANGE_NOTICE_SOURCES.includes(String(source.name || ''))) {
          parsed = extractItemsFromNoticeHtml(xml, String(source.url || source.rss_url || ''), String(source.name || ''))

          // Secondary fallback: if feed body has no parseable entries, fetch source.url HTML directly.
          if (parsed.length === 0 && source.url && source.url !== primaryUrl) {
            try {
              const htmlResponse = await fetchWithRetry(String(source.url), fetchTries, fetchTimeoutMs)
              if (htmlResponse.ok) {
                const html = await htmlResponse.text()
                parsed = extractItemsFromNoticeHtml(html, String(source.url), String(source.name || ''))
              }
            } catch {
              // keep warning flow with empty parsed
            }
          }
        }
        runLog.items_fetched = parsed.length
        runLog.items_skipped_url = 0
        runLog.items_skipped_hash = 0
        runLog.items_insert_errors = 0

        // If we successfully fetched but couldn't extract any RSS/Atom items, treat as a warning.
        // This prevents HTML pages (or broken feeds) from being marked as successful and starving real feeds.
        if (parsed.length === 0) {
          runLog.status = 'warn'
          runLog.error_message = 'Error: rss_parse_no_items_or_notice_links'
          const inserted = await insertSourceRunLog(client, runLog)
          if (inserted) {
            runlogInsertOkCount += 1
            runlogInsertedSourceIds.push(Number(source.id))
          }
          completedSourceIds.push(Number(source.id))
          perSourceMs[Number(source.id)] = Date.now() - sourceStartedAt
          continue
        }

        // PERF: prefetch active issues once per source to avoid per-article DB queries.
        const region = regionFromSource(source.region)
        const lookbackWindowMinutes = 72 * 60
        const activeWindowSince = new Date(Date.now() - lookbackWindowMinutes * 60 * 1000).toISOString()
        const { data: activeIssues, error: issuesErr } = await client
          .from('issues')
          .select('id,topic_label,title,issue_summary,key_entities,last_seen_at_utc,importance_score')
          .eq('region', region)
          .gte('last_seen_at_utc', activeWindowSince)
          .order('last_seen_at_utc', { ascending: false })
        if (issuesErr) throw issuesErr

        // PERF: batch URL dedupe upfront to avoid per-item queries when feeds are mostly repeats.
        const canonicalUrls = parsed.map((item) => canonicalizeUrl(item.link))
        const urlDedupeSet = new Set<string>()
        if (canonicalUrls.length > 0) {
          const { data: existingUrls } = await client
            .from('articles')
            .select('canonical_url')
            .eq('source_id', source.id)
            .in('canonical_url', canonicalUrls.slice(0, 80))

          for (const row of existingUrls || []) {
            if (row?.canonical_url) urlDedupeSet.add(String(row.canonical_url))
          }
        }

        const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000 * 14).toISOString()
        const titleWindowSince = new Date(Date.now() - TITLE_DEDUPE_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
        const { data: recentSourceRows } = await client
          .from('articles')
          .select('title,published_at_utc')
          .eq('source_id', source.id)
          .gte('published_at_utc', titleWindowSince)
          .order('published_at_utc', { ascending: false })
          .limit(200)

        for (const item of parsed.slice(0, MAX_ITEMS_PER_SOURCE)) {
          // Skip very old posts to keep dashboard fresh.
          if (item.publishedAt && item.publishedAt < recentCutoff) {
            continue
          }
          if (shouldStop()) {
            stoppedEarly = true
            break
          }

          let effectiveTitle = String(item.title || '').trim()
          let effectiveSummary = String(item.summary || '').trim()

          if (KR_TITLE_SAFE_SOURCES.includes(String(source.name || ''))) {
            effectiveTitle = sanitizeKrTitle(effectiveTitle)
            effectiveSummary = sanitizeKrTitle(effectiveSummary)

            if (hasDotSpam(effectiveTitle)) {
              effectiveTitle = effectiveSummary || effectiveTitle
            }

            if (!effectiveTitle || hasDotSpam(effectiveTitle)) {
              runLog.items_skipped_hash += 1
              continue
            }
          }

          if (!ALWAYS_ALLOW_SOURCES.includes(String(source.name || '')) && !isCryptoRelevant(effectiveTitle, effectiveSummary)) {
            runLog.items_skipped_hash += 1
            continue
          }

          const canonical_url = canonicalizeUrl(item.link)

          if (urlDedupeSet.has(canonical_url)) {
            runLog.items_skipped_url += 1
            continue
          }

          const dupeByTitle = (recentSourceRows || []).some((row: any) => {
            const existingTitle = String((row as any).title || '')
            if (!existingTitle) return false
            return titleSimilarity(existingTitle, effectiveTitle) >= TITLE_SIMILARITY_THRESHOLD
          })

          if (dupeByTitle) {
            runLog.items_skipped_hash += 1
            continue
          }

          const contentText = `${effectiveTitle}

${effectiveSummary}`.slice(0, 4000)
          const contentHash = buildLookupHash(canonical_url, effectiveTitle, effectiveSummary)
          const topic = deriveTopic(effectiveTitle, effectiveSummary)
          const entities = extractEntities(`${effectiveTitle} ${effectiveSummary}`)
          const { score: articleScore, importance_label: articleLabel } = computeScores({
            sourceTier: source.tier,
            topic,
            entities,
            title: effectiveTitle,
            summary: effectiveSummary,
          })

          // Dedupe window: only consider recent articles so old backfills don't block.
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000 * 14).toISOString()
          const { data: dupesByHash } = await client
            .from('articles')
            .select('id')
            .eq('source_id', source.id)
            .eq('content_hash', contentHash)
            .gte('published_at_utc', since)
            .limit(1)

          if (dupesByHash && dupesByHash.length > 0) {
            runLog.items_skipped_hash += 1
            continue
          }

          const { data: inserted, error: insertErr } = await client
            .from('articles')
            .insert({
              title: effectiveTitle,
              source_id: source.id,
              url: item.link,
              canonical_url,
              published_at_utc: item.publishedAt,
              language: regionFromSource(source.region) === 'KR' ? 'ko' : 'en',
              region: regionFromSource(source.region),
              content_text: contentText,
              content_hash: contentHash,
              summary_short: effectiveSummary.slice(0, 280),
              why_it_matters: effectiveSummary.slice(0, 140),
              confidence_label: 'medium',
              status: 'new',
              importance_score: articleScore,
              importance_label: articleLabel,
            })
            .select('id')
            .single()

          if (insertErr || !inserted) {
            runLog.items_insert_errors += 1
            continue
          }
          insertedArticles += 1
          runLog.items_saved += 1

          try {
            const ap = await autoPostBreaking(client, {
              articleId: inserted.id,
              sourceName: String(source.name || 'Unknown'),
              headline: effectiveTitle,
              articleUrl: item.link,
              canonicalUrl: canonical_url,
              contentHash: contentHash,
              summary: effectiveSummary,
              whyItMatters: effectiveSummary.slice(0, 140),
              importanceLabel: articleLabel,
            })
            autopostEval.candidates += 1
            if (ap.posted) autopostEval.posted += 1
            else autopostEval.skipped += 1
            if (!ap.posted) autopostEval.skippedReasons[ap.reason] = (autopostEval.skippedReasons[ap.reason] || 0) + 1
          } catch (autoPostErr: any) {
            console.error('autoPostBreaking failed', autoPostErr)
            autopostEval.candidates += 1
            autopostEval.skipped += 1
            const key = `runtime_error:${String(autoPostErr?.message || autoPostErr)}`.slice(0, 120)
            autopostEval.skippedReasons[key] = (autopostEval.skippedReasons[key] || 0) + 1
          }

          const now = new Date().toISOString()

          let issueId: number | null = null

          let bestMatch = {
            id: null as number | null,
            score: 0,
            seenAt: '',
          }

          const titleTokens = toTokenSet(item.title)
          const summaryTokens = toTokenSet(item.summary)

          for (const candidate of activeIssues || []) {
            const score = issueMatchScore({
              candidate: {
                id: candidate.id,
                topic_label: String(candidate.topic_label || ''),
                issue_summary: candidate.issue_summary || null,
                title: String(candidate.title || ''),
                key_entities: candidate.key_entities,
                last_seen_at_utc: String(candidate.last_seen_at_utc),
              },
              topic,
              titleTokens,
              summaryTokens,
              entities,
              windowMinutes: lookbackWindowMinutes,
            })

            if (score > bestMatch.score) {
              bestMatch = {
                id: candidate.id,
                score,
                seenAt: candidate.last_seen_at_utc,
              }
            }
          }

          const bestCandidateTopic =
            activeIssues?.find((row: any) => row.id === bestMatch.id)?.topic_label || ''

          if (bestMatch.id && isBestMatch(bestMatch.score, topic, String(bestCandidateTopic), lookbackWindowMinutes / 60)) {
            issueId = bestMatch.id
          }

          if (!issueId) {
            const { score: issueScore, importance_label: issueLabel } = computeScores({
              sourceTier: source.tier,
              topic,
              entities,
              title: effectiveTitle,
              summary: effectiveSummary,
            })

            const { data: createdIssue, error: createErr } = await client
              .from('issues')
              .insert({
                title: `${item.title.slice(0, 110)} (${topic})`,
                topic_label: topic,
                region,
                representative_article_id: inserted.id,
                issue_summary: item.summary.slice(0, 280),
                why_it_matters: effectiveSummary.slice(0, 140),
                tags: [topic],
                key_entities: entities,
                importance_score: issueScore,
                importance_label: issueLabel,
                first_seen_at_utc: now,
                last_seen_at_utc: now,
              })
              .select('id')
              .single()

            if (createErr) {
              console.error('issue create failed', createErr)
            } else if (createdIssue) {
              issueId = createdIssue.id
              issueUpdatesCreated += 1
            }
          } else {
            const { score: issueScore, importance_label: issueLabel } = computeScores({
              sourceTier: source.tier,
              topic,
              entities,
              title: effectiveTitle,
              summary: effectiveSummary,
            })
            await client
              .from('issues')
              .update({
                last_seen_at_utc: now,
                issue_summary: item.summary.slice(0, 280),
                importance_score: issueScore,
                importance_label: issueLabel,
              })
              .eq('id', issueId)
          }

          if (issueId) {
            await client.from('articles').update({ issue_id: issueId }).eq('id', inserted.id)

            // Avoid spamming duplicate timeline entries: skip if an update already references this article.
            const { data: existingUpdate } = await client
              .from('issue_updates')
              .select('id')
              .eq('issue_id', issueId)
              .contains('evidence_article_ids', [inserted.id])
              .limit(1)
              .maybeSingle()

            if (!existingUpdate) {
              await client.from('issue_updates').insert({
                issue_id: issueId,
                update_at_utc: now,
                update_summary: 'New article coverage update.',
                evidence_article_ids: [inserted.id],
                confidence_label: 'medium',
              })
              issueUpdatesCreated += 1
            }
          }
        }
      } catch (sourceError) {
        runLog.status = 'error'
        runLog.error_message = String(sourceError)
      }

      const inserted = await insertSourceRunLog(client, runLog)
      if (inserted) {
        runlogInsertOkCount += 1
        runlogInsertedSourceIds.push(Number(source.id))
      }

      if (runLog.status === 'ok') {
        await client.from('sources').update({ last_success_at: runAt, last_error_at: null }).eq('id', source.id)
      } else {
        await client.from('sources').update({ last_error_at: runAt }).eq('id', source.id)
      }

      completedSourceIds.push(Number(source.id))
      perSourceMs[Number(source.id)] = Date.now() - sourceStartedAt
    }

    const nextCursor = regularAttemptedIds.length > 0
      ? regularAttemptedIds[regularAttemptedIds.length - 1]
      : (queuePlan.selected_regular_ids.length > 0
          ? queuePlan.selected_regular_ids[queuePlan.selected_regular_ids.length - 1]
          : queuePlan.cursor_before)

    const cursorMarkerWritten = await setIngestCursorState(client, nextCursor, runAt)

    const globalLogEnd = await writeGlobalIngestLog(client, {
      runAtUtc: runAt,
      status: stoppedEarly ? 'warn' : 'ok',
      stage: 'ingest',
      itemsFetched: 0,
      itemsSaved: insertedArticles,
    })
    const globalLogEndReadback = await verifyGlobalReadback(client, globalLogEnd?.row?.run_at_utc || runAt)
    const debugEnv = await buildDebugEnv(client)

    return NextResponse.json({
      ok: true,
      inserted_articles: insertedArticles,
      issue_updates_created: issueUpdatesCreated,
      sources_processed: sourcesProcessed,
      stopped_early: stoppedEarly,
      next_cursor: nextCursor,
      cursor_before: queuePlan.cursor_before,
      regular_pool_size: queuePlan.regular_pool_size,
      selected_regular_ids: queuePlan.selected_regular_ids,
      attempted_source_ids: attemptedSourceIds,
      completed_source_ids: completedSourceIds,
      per_source_ms: perSourceMs,
      runlog_attempted_count: attemptedSourceIds.length,
      runlog_insert_ok_count: runlogInsertOkCount,
      inserted_runlog_source_ids: runlogInsertedSourceIds,
      debug_return_metrics: debugReturnMetrics
        ? {
            run_at: runAt,
            runlog_attempted_count: attemptedSourceIds.length,
            runlog_insert_ok_count: runlogInsertOkCount,
            inserted_runlog_source_ids: runlogInsertedSourceIds,
            global_marker_written: globalMarkerWritten,
            cursor_marker_written: cursorMarkerWritten,
          }
        : undefined,
      rr_debug: debugRR
        ? {
            cursor_state_before: cursorState.cursor_source_id,
            cursor_state_after: nextCursor,
            regular_start_index: queuePlan.regular_start_index,
            regular_ids_order_first10: (queuePlan.regular_ids_order || []).slice(0, 10),
            priority_ids: queuePlan.priority_ids || [],
            regular_ids_count: queuePlan.regular_pool_size,
          }
        : undefined,
      autopost_eval: autopostEval,
      global_log_write_start: globalLogStart,
      global_log_write_start_readback: globalLogStartReadback,
      global_log_write_end: globalLogEnd,
      global_log_write_end_readback: globalLogEndReadback,
      debug_env: debugEnv,
    })
  } catch (error) {
    console.error('POST /api/jobs/ingest failed', error)
    try {
      await writeGlobalIngestLog(client, {
        runAtUtc: runAt,
        status: 'error',
        stage: 'preflight',
        errorMessage: (error as any)?.message || String(error),
      })
    } catch (logErr) {
      console.error('failed to write global ingest preflight log', logErr)
    }
    return NextResponse.json(err(`ingest_error: ${String(error)}`), { status: 500 })
  }
}








