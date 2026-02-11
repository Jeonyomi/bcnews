export type Locale = 'en' | 'ko'
export type LocalizedContent = {
  en: string
  ko: string
}

export interface NewsItem {
  id: string
  title: string
  body: LocalizedContent  // Now supports both EN/KR
  source: string
  createdAt: Date
  updatedAt: Date
}