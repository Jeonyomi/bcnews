import crypto from 'crypto'
import { TELEGRAM_BREAKING_CHANNEL, escapeTelegramMarkdownV2, escapeTelegramUrl, insertChannelPostSafe } from '@/lib/channelPosting'
import { CHANNEL_POST_REASONS } from '@/lib/channelPostReasons'

export const OCC_APPLICANTS_LANE = 'occ_applicants'
export const OCC_APPLICANTS_SOURCE_NAME = 'OCC'
export const OCC_APPLICANTS_INDEX_URL = 'https://www.occ.treas.gov/topics/charters-and-licensing/digital-assets-licensing-applications/index-digital-assets-licensing-applications.html'
export const OCC_APPLICANTS_TARGET_CHANNEL = String(process.env.KBN_OCC_APPLICANTS_TARGET_CHANNEL || TELEGRAM_BREAKING_CHANNEL).trim() || TELEGRAM_BREAKING_CHANNEL
const OCC_STATE_MARKER_PREFIX = 'occ_applicants_state:'

export type OccApplicantRow = {
  dateReceivedRaw: string
  dateReceivedIso: string
  applicant: string
  linkUrl: string
  linkLabel: string
  dedupeKey: string
}

const hashText = (text: string) => crypto.createHash('sha256').update(text).digest('hex')

const normalizeWhitespace = (value: string) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()

const decodeHtml = (value: string) =>
  String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code) || 0))

const stripTags = (value: string) => normalizeWhitespace(decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ')))

const parseOccDateToIso = (value: string) => {
  const raw = normalizeWhitespace(value)
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return ''
  const [, mm, dd, yyyy] = match
  return `${yyyy}-${mm}-${dd}`
}

const toAbsoluteOccUrl = (value: string) => {
  const raw = normalizeWhitespace(decodeHtml(value))
  if (!raw) return ''
  try {
    return new URL(raw, OCC_APPLICANTS_INDEX_URL).toString()
  } catch {
    return ''
  }
}

export const buildOccApplicantDedupeKey = (row: Pick<OccApplicantRow, 'dateReceivedIso' | 'applicant'>) =>
  `occ_applicant:${hashText(`${row.dateReceivedIso}|${row.applicant}`.toLowerCase())}`

export const buildOccApplicantPostText = (row: Pick<OccApplicantRow, 'dateReceivedIso' | 'applicant' | 'linkUrl'>) => {
  const text = `🏦 OCC adds ${row.applicant} to digital assets licensing applications list (${row.dateReceivedIso})`
  return `[${escapeTelegramMarkdownV2(text)}](${escapeTelegramUrl(row.linkUrl)})`
}

export const extractOccApplicants = (html: string): OccApplicantRow[] => {
  const rows: OccApplicantRow[] = []
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi

  for (const rowMatch of html.matchAll(rowRegex)) {
    const rowHtml = rowMatch[1]
    const cells = Array.from(rowHtml.matchAll(cellRegex)).map((m) => m[1])
    if (cells.length < 3) continue

    const dateReceivedRaw = stripTags(cells[0])
    const dateReceivedIso = parseOccDateToIso(dateReceivedRaw)
    const applicant = stripTags(cells[1])
    const linkHrefMatch = cells[2].match(/href=["']([^"']+)["']/i)
    const linkUrl = linkHrefMatch ? toAbsoluteOccUrl(linkHrefMatch[1]) : OCC_APPLICANTS_INDEX_URL
    const linkLabel = stripTags(cells[2]) || 'N/A'

    if (!dateReceivedIso || !applicant) continue
    if (/date received/i.test(dateReceivedRaw) || /application provided/i.test(applicant)) continue

    const normalized: OccApplicantRow = {
      dateReceivedRaw,
      dateReceivedIso,
      applicant,
      linkUrl: linkUrl || OCC_APPLICANTS_INDEX_URL,
      linkLabel,
      dedupeKey: '',
    }
    normalized.dedupeKey = buildOccApplicantDedupeKey(normalized)
    rows.push(normalized)
  }

  const deduped = new Map<string, OccApplicantRow>()
  for (const row of rows) {
    if (!deduped.has(row.dedupeKey)) deduped.set(row.dedupeKey, row)
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.dateReceivedIso === b.dateReceivedIso) return a.applicant.localeCompare(b.applicant)
    return a.dateReceivedIso.localeCompare(b.dateReceivedIso)
  })
}

export const fetchOccApplicants = async () => {
  const response = await fetch(OCC_APPLICANTS_INDEX_URL, {
    method: 'GET',
    headers: {
      'user-agent': 'bcnews-occ-applicants/1.0 (+https://bcnews-agent.vercel.app)',
      accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
  })

  const html = await response.text()
  if (!response.ok) {
    throw new Error(`occ_fetch_failed:${response.status}`)
  }

  const applicants = extractOccApplicants(html)
  if (applicants.length === 0) {
    throw new Error('occ_parse_no_applicants')
  }

  return {
    applicants,
    fetchedAt: new Date().toISOString(),
    sourceUrl: OCC_APPLICANTS_INDEX_URL,
  }
}

export const getOccApplicantState = async (client: any) => {
  const marker = await client
    .from('ingest_logs')
    .select('id,error_message,run_at_utc')
    .is('source_id', null)
    .like('error_message', `${OCC_STATE_MARKER_PREFIX}%`)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (marker.error || !marker.data?.error_message) {
    return null
  }

  try {
    const parsed = JSON.parse(String(marker.data.error_message).slice(OCC_STATE_MARKER_PREFIX.length))
    const knownApplicants = Array.isArray(parsed?.knownApplicants)
      ? parsed.knownApplicants.map((row: any) => ({
          dateReceivedRaw: String(row?.dateReceivedRaw || ''),
          dateReceivedIso: String(row?.dateReceivedIso || ''),
          applicant: String(row?.applicant || ''),
          linkUrl: String(row?.linkUrl || OCC_APPLICANTS_INDEX_URL),
          linkLabel: String(row?.linkLabel || ''),
          dedupeKey: String(row?.dedupeKey || buildOccApplicantDedupeKey({
            dateReceivedIso: String(row?.dateReceivedIso || ''),
            applicant: String(row?.applicant || ''),
          })),
        })).filter((row: OccApplicantRow) => row.dateReceivedIso && row.applicant)
      : []

    return {
      runAtUtc: marker.data.run_at_utc || null,
      knownApplicants,
    }
  } catch {
    return null
  }
}

export const writeOccApplicantState = async (client: any, args: { runAtUtc: string; knownApplicants: OccApplicantRow[]; note: string }) => {
  const payload = {
    note: args.note,
    knownApplicants: args.knownApplicants.map((row) => ({
      dateReceivedRaw: row.dateReceivedRaw,
      dateReceivedIso: row.dateReceivedIso,
      applicant: row.applicant,
      linkUrl: row.linkUrl,
      linkLabel: row.linkLabel,
      dedupeKey: row.dedupeKey,
    })),
  }

  const { error } = await client.from('ingest_logs').insert({
    source_id: null,
    run_at_utc: args.runAtUtc,
    status: 'ok',
    error_message: `${OCC_STATE_MARKER_PREFIX}${JSON.stringify(payload)}`,
    items_fetched: args.knownApplicants.length,
    items_saved: 0,
  })

  if (error) throw error
}

export const queueOccApplicantPost = async (client: any, row: OccApplicantRow) => {
  const postText = buildOccApplicantPostText(row)

  const { data: existing } = await client
    .from('channel_posts')
    .select('id,status,dedupe_key')
    .eq('dedupe_key', row.dedupeKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    return {
      queued: false,
      reason: CHANNEL_POST_REASONS.SKIPPED_DUPLICATE,
      dedupeKey: row.dedupeKey,
      postText,
      existingId: Number(existing.id),
    }
  }

  await insertChannelPostSafe(client, {
    status: 'pending',
    lane: OCC_APPLICANTS_LANE,
    article_id: null,
    source_name: OCC_APPLICANTS_SOURCE_NAME,
    headline: `🏦 OCC adds ${row.applicant} to digital assets licensing applications list (${row.dateReceivedIso})`,
    headline_ko: `🏦 OCC adds ${row.applicant} to digital assets licensing applications list (${row.dateReceivedIso})`,
    article_url: row.linkUrl,
    tags: ['OCC', 'DigitalAssets', 'LicensingApplications'],
    post_text: postText,
    target_channel: OCC_APPLICANTS_TARGET_CHANNEL,
    target_admin: '@master_billybot',
    dedupe_key: row.dedupeKey,
    approved_by: 'auto',
    reason: CHANNEL_POST_REASONS.QUEUED_WORKER,
  })

  return {
    queued: true,
    reason: CHANNEL_POST_REASONS.QUEUED_WORKER,
    dedupeKey: row.dedupeKey,
    postText,
  }
}
