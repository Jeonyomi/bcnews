import type { NewsItem } from '@scod/shared'

interface RawNewsItem {
  id: string
  title: string
  body: string
  source: string
  createdAt: Date
  updatedAt: Date
}

const SECTION_HEADERS = {
  en: {
    kr: '[KR]',
    global: '[Global]',
    watchlist: '[Watchlist]',
    oneliner: '[One-liner]'
  },
  ko: {
    kr: '[한국]',
    global: '[글로벌]',
    watchlist: '[주시 항목]',
    oneliner: '[한 줄 요약]'
  }
}

export function transformNewsContent(raw: RawNewsItem): NewsItem {
  return {
    ...raw,
    body: {
      en: raw.body,
      ko: translateToKorean(raw.body)
    }
  }
}

function translateToKorean(englishContent: string): string {
  // Replace section headers
  let koreanContent = englishContent
    .replace(SECTION_HEADERS.en.kr, SECTION_HEADERS.ko.kr)
    .replace(SECTION_HEADERS.en.global, SECTION_HEADERS.ko.global)
    .replace(SECTION_HEADERS.en.watchlist, SECTION_HEADERS.ko.watchlist)
    .replace(SECTION_HEADERS.en.oneliner, SECTION_HEADERS.ko.oneliner)

  // Later: Implement proper translation with external service
  // For now, just mark untranslated text
  // koreanContent += '\n\n[Translation not available yet]'

  return koreanContent
}