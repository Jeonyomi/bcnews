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
const SAMPLE_EN = `
[KR]

1) Korea FSS targets crypto market manipulation; sets up Digital Asset Basic Act prep team (incl. stablecoins)
- Summary: Korea’s Financial Supervisory Service (FSS) announced planned investigations into high-risk crypto market misconduct and plans to build AI-assisted detection. It also formed a prep team for the upcoming “Digital Asset Basic Act,” including disclosure standards and licensing-review manuals for digital-asset businesses and stablecoin issuers.
- Why it matters: Korea is moving from reactive enforcement to systemized supervision—important for exchange integrity and any future KRW-linked stablecoin regime.
- Link: https://www.yna.co.kr/view/AKR20260209030100002

[Global]

1) CFTC staff updates “payment stablecoin” definition to include national trust banks (margin collateral context)
- Summary: The CFTC’s Market Participants Division reissued Staff Letter 25-40 with a limited revision so that a national trust bank can qualify as a permitted issuer of a “payment stablecoin” under the staff no-action position.
- Why it matters: Broadening eligible issuer types can accelerate institutional adoption of stablecoins in regulated derivatives/clearing plumbing.
- Link: https://www.cftc.gov/PressRoom/PressReleases/9180-26

[Watchlist]
- Korea: Post-incident guidance on reconciliation frequency, custody controls, and “real asset holding” expectations.

[One-liner]
Korea is tightening exchange oversight, while globally stablecoins keep expanding into real payroll/payment rails as regulators refine definitions.
`.trim()

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

    // If DB is empty (common on fresh Vercel deploy with SQLite), return a demo seed item
    // so the UI isn't blank.
    const baseItems = news.length
      ? news
      : [
          {
            id: 'seed-brief-2026-02-11',
            title: 'Stablecoin / Crypto News Brief (EN) — 2026-02-11 (seed)',
            body: SAMPLE_EN,
            source: 'seed',
            createdAt: new Date('2026-02-11T00:00:00.000Z'),
            updatedAt: new Date('2026-02-11T00:00:00.000Z')
          }
        ]

    const items = baseItems.map((item: any) => {
      const en = item.body
      return {
        ...item,
        title: String(item.title || '').replaceAll('??', ''),
        body: {
          en,
          ko: translateToKorean(en)
        }
      }
    })

    return NextResponse.json({ items })
  } catch (err: any) {
    // Prisma error P2021: table does not exist
    if (err?.code === 'P2021') {
      const en = SAMPLE_EN
      return NextResponse.json({
        items: [
          {
            id: 'seed-brief-2026-02-11',
            title: 'Stablecoin / Crypto News Brief (EN) — 2026-02-11 (seed)',
            source: 'seed',
            createdAt: new Date('2026-02-11T00:00:00.000Z'),
            updatedAt: new Date('2026-02-11T00:00:00.000Z'),
            body: { en, ko: translateToKorean(en) }
          }
        ]
      })
    }

    console.error('Failed to fetch news:', err)
    return NextResponse.json({ items: [], error: 'Internal Server Error' }, { status: 500 })
  }
}
