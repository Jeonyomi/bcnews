export type SourceTabKey = 'all' | 'reuters' | 'financialjuice' | 'official' | 'research'
export type FeedFilterKey = 'all' | 'breaking' | 'analysis'

export interface SourceTabConfig {
  key: SourceTabKey
  label: string
  matcher: (sourceName: string) => boolean
}

const containsAny = (value: string, needles: string[]) =>
  needles.some((needle) => value.includes(needle))

export const SOURCE_TABS: SourceTabConfig[] = [
  {
    key: 'all',
    label: 'All',
    matcher: () => true,
  },
  {
    key: 'reuters',
    label: 'Reuters',
    matcher: (source) => source.includes('reuters'),
  },
  {
    key: 'financialjuice',
    label: 'FinancialJuice',
    matcher: (source) => containsAny(source, ['financialjuice', 'financial juice']),
  },
  {
    key: 'official',
    label: 'Official',
    matcher: (source) =>
      containsAny(source, [
        'sec',
        'cftc',
        'federal reserve',
        'treasury',
        'esma',
        'fca',
        'ecb',
        'bank of england',
        'boj',
        'mas',
        'hkma',
        'official',
      ]),
  },
  {
    key: 'research',
    label: 'Research',
    matcher: (source) => containsAny(source, ['messari', 'kaiko', 'nansen', 'delphi', 'research', 'report']),
  },
]

export const FEED_FILTERS: { key: FeedFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'breaking', label: 'Breaking' },
  { key: 'analysis', label: 'Analysis' },
]

export const BREAKING_KEYWORDS = [
  'breaking',
  'exploit',
  'hack',
  'etf',
  'sec',
  'lawsuit',
  'approval',
  'liquidation',
  'outage',
  'depeg',
]

export const ANALYSIS_KEYWORDS = ['analysis', 'opinion', 'research', 'outlook', 'weekly', 'report']
