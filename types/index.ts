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
  heading: 'KR' | 'Global'
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
