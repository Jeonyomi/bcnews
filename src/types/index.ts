export type Locale = 'en' | 'ko'

export interface NewsItem {
  id: string
  title: string
  body: {
    en: string
    ko: string
  }
  source: string
  createdAt: Date
  updatedAt: Date
}