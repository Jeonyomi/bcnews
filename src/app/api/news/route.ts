import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import type { NewsItem } from '@/types'

const prisma = new PrismaClient()

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

function transformContent(content: string, locale: 'en' | 'ko' = 'en'): string {
  if (locale === 'en') return content

  // Replace section headers for Korean
  return content
    .replace(SECTION_HEADERS.en.kr, SECTION_HEADERS.ko.kr)
    .replace(SECTION_HEADERS.en.global, SECTION_HEADERS.ko.global)
    .replace(SECTION_HEADERS.en.watchlist, SECTION_HEADERS.ko.watchlist)
    .replace(SECTION_HEADERS.en.oneliner, SECTION_HEADERS.ko.oneliner)
}

export async function GET() {
  try {
    const news = await prisma.newsItem.findMany({
      where: {
        // Exclude test items
        NOT: {
          OR: [
            { title: { contains: 'TEST' } },
            { source: 'local-test' }
          ]
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Transform items
    const items = news.map(item => ({
      ...item,
      // Remove "??" from title
      title: item.title.replace('??', ''),
      // Support both languages
      body: {
        en: item.body,
        ko: transformContent(item.body, 'ko')
      }
    }))

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Failed to fetch news:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}