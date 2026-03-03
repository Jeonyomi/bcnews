export type SourcePolicyType = 'official' | 'media' | 'blog' | 'exchange' | 'other'
export type SourcePolicyTier = 'A' | 'B' | 'C'
export type SourcePolicyRegion = 'KR' | 'GLOBAL'

const OFFICIAL_NAMES = new Set([
  'SEC', 'CFTC', 'Federal Reserve', 'U.S. Treasury', 'Financial Services Commission (KR)',
  'Binance Announcements', 'Coinbase Announcements', 'Upbit Announcements', 'Bithumb Announcements', 'Coinone Announcements',
])

const EXCHANGE_NAMES = new Set([
  'Binance Announcements', 'Coinbase Announcements', 'Upbit Announcements', 'Bithumb Announcements', 'Coinone Announcements',
])

const BLOG_NAMES = new Set(['Coinbase Blog'])

export const normalizeSourcePolicyType = (name: string, rawType: string | null | undefined): SourcePolicyType => {
  const t = String(rawType || '').toLowerCase().trim()
  if (EXCHANGE_NAMES.has(name)) return 'exchange'
  if (OFFICIAL_NAMES.has(name)) return 'official'
  if (BLOG_NAMES.has(name)) return 'blog'
  if (t === 'official') return 'official'
  if (t === 'media' || t === 'rss') return 'media'
  if (t === 'blog') return 'blog'
  if (t === 'exchange') return 'exchange'
  return 'other'
}

export const normalizeSourcePolicyTier = (rawTier: string | number | null | undefined): SourcePolicyTier => {
  const v = String(rawTier ?? '').toUpperCase().trim()
  if (v === '1' || v === 'A' || v === 'TIER1') return 'A'
  if (v === '2' || v === 'B' || v === 'TIER2') return 'B'
  return 'C'
}

export const normalizeSourcePolicyRegion = (rawRegion: string | null | undefined): SourcePolicyRegion => {
  const v = String(rawRegion || '').toUpperCase().trim()
  if (v === 'KR' || v === 'KOREA') return 'KR'
  return 'GLOBAL'
}

export const inferDisabledReason = (enabled: boolean, status: string): string | null => {
  if (enabled) return null
  if (status === 'disabled') return 'manual_disabled'
  return 'disabled_unknown'
}
