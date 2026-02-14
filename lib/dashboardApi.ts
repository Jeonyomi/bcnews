import type { ArticleRecord, IssueRecord, SourceRecord, TrendPoint, IssueUpdateRecord } from '@/types'

export type TimeWindow = '6h' | '12h' | '24h' | '7d' | 'all'
export type SortMode = 'hybrid' | 'latest' | 'importance'
export type TopicFilter = 'all' | string

export const parseTimeWindow = (value: string | null): TimeWindow => {
  if (value === '6h' || value === '12h' || value === '24h' || value === '7d' || value === 'all') {
    return value
  }
  return '24h'
}

export const parseSort = (value: string | null): SortMode => {
  if (value === 'latest' || value === 'importance' || value === 'hybrid') return value
  return 'hybrid'
}

export const buildTopIssueCard = (issue: IssueRecord, recentUpdates: number) => ({
  ...issue,
  recent_updates_count: recentUpdates,
  has_new_updates: recentUpdates > 0,
})

export interface SearchResult {
  type: 'issue' | 'article'
  id: number
  title: string
  subtitle?: string
  snippet?: string
  score?: number
  region?: string
}

export interface APIEnvelope<T> {
  ok: true
  data: T
  ts: string
}

export interface APIError {
  ok: false
  error: string
}

export const ok = <T>(data: T): APIEnvelope<T> => ({
  ok: true,
  data,
  ts: new Date().toISOString(),
})

export const err = (error: string): APIError => ({ ok: false, error })

export type IssueListResponse = APIEnvelope<{
  issues: Array<IssueRecord & { recent_updates_count: number }>
  count: number
  window: TimeWindow
}>

export type ArticleListResponse = APIEnvelope<{
  articles: ArticleRecord[]
  count: number
  window: TimeWindow
}>

export type SearchResponse = APIEnvelope<{
  issues: SearchResult[]
  articles: SearchResult[]
  query: string
}>

export type TrendsResponse = APIEnvelope<{
  topics: TrendPoint[]
  entities: TrendPoint[]
  window: TimeWindow
}>

export interface SourcesResponseData {
  sources: SourceRecord[]
  health: Array<{
    source_id: number
    source_name: string
    status: 'ok' | 'warn' | 'down'
    last_status: string
    last_items: number
    last_error: string | null
    last_run_at: string | null
  }>
}

export type SourcesResponse = APIEnvelope<SourcesResponseData>

export type IssueDetailResponse = APIEnvelope<{
  issue: IssueRecord
  issue_updates: IssueUpdateRecord[]
  related_articles: ArticleRecord[]
  representative_article: ArticleRecord | null
}>
