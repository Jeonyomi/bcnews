export type Locale = 'en' | 'ko'

export type LocalizedContent = {
  en: string
  ko: string
}

export interface NewsItem {
  id: string
  title: string
  body: LocalizedContent
  source: string
  createdAt: Date
  updatedAt: Date
}