export type SourceTabKey = 'all' | 'breaking' | 'official' | 'media' | 'kr'
export type FeedFilterKey = 'all' | 'breaking' | 'analysis'

export interface SourceTabConfig {
  key: SourceTabKey
  label: string
  matcher: (sourceName: string) => boolean
}

const containsAny = (value: string, needles: string[]) => needles.some((needle) => value.includes(needle))

const OFFICIAL_SOURCES = [
  'sec', 'cftc', 'federal reserve', 'treasury', 'esma', 'fca', 'ecb', 'bank of england', 'boj', 'mas', 'hkma',
  'official', 'binance announcements', 'coinbase announcements', 'coinbase blog',
]

const MEDIA_SOURCES = [
  'coindesk', 'the block', 'blockworks', 'dl news', 'decrypt', 'reuters', 'financialjuice', 'financial juice',
]

const KR_SOURCES = ['blockmedia', 'tokenpost', 'coinness', '(kr)', 'kr']

export const SOURCE_TABS: SourceTabConfig[] = [
  { key: 'all', label: 'All', matcher: () => true },
  { key: 'breaking', label: 'Breaking', matcher: () => true },
  { key: 'official', label: 'Official', matcher: (source) => containsAny(source, OFFICIAL_SOURCES) },
  { key: 'media', label: 'Media', matcher: (source) => containsAny(source, MEDIA_SOURCES) },
  { key: 'kr', label: 'KR', matcher: (source) => containsAny(source, KR_SOURCES) },
]

export const FEED_FILTERS: { key: FeedFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'breaking', label: 'Breaking' },
  { key: 'analysis', label: 'Analysis' },
]

export const BREAKING_KEYWORDS = ['breaking', 'exploit', 'hack', 'etf', 'sec', 'lawsuit', 'approval', 'liquidation', 'outage', 'depeg']
export const ANALYSIS_KEYWORDS = ['analysis', 'opinion', 'research', 'outlook', 'weekly', 'report']
