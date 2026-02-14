export type Region = 'KR' | 'Global'
export type Source = 'main' | 'backup'

export type Topic =
  | 'Regulation/Policy'
  | 'Stablecoin Issuers/Reserves'
  | 'Banks/Payments'
  | 'Market/Trading'
  | 'CBDC/Tokenized Cash'
  | 'Enforcement/Crime'
  | 'Infra/Tech'

export interface BriefSectionItem {
  title: string
  summary: string
  keywords: string[]
  link?: string
}

export interface BriefSection {
  heading: 'KR' | 'Global' | 'Watchlist'
  title: string
  items: BriefSectionItem[]
}

export interface NewsItem {
  id: string
  title: string
  content: string
  region: Region
  source: Source
  topics?: Topic[]
  score?: number
  created_at: string
  created_at_kst: string
  sections?: BriefSection[]
}

export type RegionCode = 'KR' | 'Global' | 'All'

export type TopicLabel =
  | 'regulation'
  | 'issuer'
  | 'payments'
  | 'market'
  | 'defi'
  | 'aml'
  | 'macro'
  | 'infra'
  | 'macro-policy'

export interface IssueRecord {
  id: number
  title: string
  topic_label: TopicLabel
  region: 'KR' | 'Global'
  first_seen_at_utc: string
  last_seen_at_utc: string
  representative_article_id: number | null
  issue_summary: string
  why_it_matters: string | null
  tags: unknown
  key_entities: unknown
  importance_score: number
  importance_label: string
  recent_updates_count?: number
}

export interface IssueUpdateRecord {
  id: number
  issue_id: number
  update_at_utc: string
  update_summary: string
  evidence_article_ids: unknown
  confidence_label: string | null
}

export interface ArticleRecord {
  id: number
  title: string
  source_id: number | null
  url: string
  canonical_url: string | null
  published_at_utc: string
  fetched_at_utc: string
  language: string | null
  region: 'KR' | 'Global'
  content_text: string | null
  content_hash: string | null
  summary_short: string
  why_it_matters: string | null
  confidence_label: string | null
  importance_score: number | null
  importance_label: string | null
  issue_id: number | null
  status: string | null
  issue?: Pick<IssueRecord, 'id' | 'title' | 'topic_label' | 'importance_label'>
  source?: { id: number; name: string; tier: string | null }
}

export interface TrendPoint {
  name: string
  score: number
  bucket: string
}

export interface SourceRecord {
  id: number
  name: string
  type: 'rss' | 'web' | 'official' | string
  tier: string | null
  url: string | null
  rss_url: string | null
  region: 'KR' | 'Global' | null
  enabled: boolean
  last_success_at: string | null
  last_error_at: string | null
}

export interface SourceHealth {
  source_id: number
  source_name: string
  status: 'ok' | 'warn' | 'down'
  last_status: string | null
  last_items: number
  last_error: string | null
  last_run_at: string | null
}
