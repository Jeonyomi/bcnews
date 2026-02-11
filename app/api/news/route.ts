import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Dictionary-based KO translation (automation-grade, deterministic).
const DICT: Record<string, string> = {
  'Digital Asset Basic Act': '디지털자산 기본법',
  Korea: '한국',
  Stablecoin: '스테이블코인',
  stablecoin: '스테이블코인',
  Stablecoins: '스테이블코인',
  'Financial Supervisory Service': '금융감독원',
  FSS: '금융감독원',
  USDC: 'USDC',
  USDT: 'USDT',
  '[KR]': '[한국]',
  '[Global]': '[글로벌]',
  '[Watchlist]': '[주시 항목]',
  '[One-liner]': '[한 줄 요약]'
}

function translateToKorean(englishContent: string): string {
  let text = englishContent
  for (const [en, ko] of Object.entries(DICT)) {
    const esc = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(esc, 'g'), ko)
  }
  return text
}

// - fetch rows
// - return safe empty list if DB/table isn't initialized (common on fresh Vercel deploy)
export async function GET() {
  try {
    const news = await prisma.newsItem.findMany({
      where: {
        NOT: {
          OR: [{ title: { contains: 'TEST' } }, { source: 'local-test' }]
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const items = news.map((item) => {
      const en = item.body
      return {
        ...item,
        title: item.title.replaceAll('??', ''),
        body: {
          en,
          ko: translateToKorean(en)
        }
      }
    })

    return NextResponse.json({ items })
  } catch (err: any) {
    if (err?.code === 'P2021') {
      return NextResponse.json({ items: [] })
    }

    console.error('Failed to fetch news:', err)
    return NextResponse.json({ items: [], error: 'Internal Server Error' }, { status: 500 })
  }
}
