import type { NewsItem } from '@/types'

interface RawNewsItem {
  id: string
  title: string
  body: string
  source: string
  createdAt: Date
  updatedAt: Date
}

const DICT: Record<string, string> = {
  // Core domain translations
  'Digital Asset Basic Act': '디지털자산 기본법',
  'Korea': '한국',
  'Korean': '한국어',
  'Stablecoin': '스테이블코인',
  'stablecoin': '스테이블코인',
  'Stablecoins': '스테이블코인',
  'Financial Supervisory Service': '금융감독원',
  'FSS': '금융감독원',
  'USDC': 'USDC',
  'USDT': 'USDT'
}

function translateToKorean(englishContent: string): string {
  let text = englishContent
  Object.entries(DICT).forEach(([en, ko]) => {
    const esc = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(esc, 'g')
    text = text.replace(re, ko)
  })
  return text
}

export function transformNewsContent(raw: RawNewsItem): NewsItem {
  const en = raw.body
  const ko = translateToKorean(raw.body)
  return {
    ...raw,
    // Remove "??" from title if present
    title: raw.title.replace('??', ''),
    body: { en, ko },
    source: raw.source,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  }
}

export { translateToKorean }
