import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { formatMarkdown } from './format'

const prisma = new PrismaClient()

// NOTE: We do NOT translate on the server at runtime.
// We store the brief as a single markdown body that already contains:
// 1) Korean version (fully translated)
// 2) Separator line
// 3) English version
// This avoids requiring Vercel env keys and keeps output deterministic.

// - fetch rows
// - return safe empty list if DB/table isn't initialized (common on fresh Vercel deploy)
const SAMPLE_BODY = `
📰 Digital Asset & Stablecoin Regulatory Brief

🇰🇷 한국어 버전

[KR]
금융감독원, 가상자산 시장조작 집중 점검… ‘디지털자산 기본법’ 준비팀 출범 (스테이블코인 포함)

요약
한국 금융감독원은 고위험 가상자산 시장 불공정 행위에 대한 조사 계획을 발표하고, AI 기반 이상거래 탐지 시스템을 구축할 예정이라고 밝혔습니다. 또한 향후 제정 예정인 「디지털자산 기본법」에 대비해 준비 전담팀을 구성했으며, 공시 기준 및 인허가 심사 매뉴얼 정비, 스테이블코인 발행자 관련 감독 체계 준비를 포함합니다.

시사점 (Why it matters)
한국은 사후적 제재 중심의 대응에서 벗어나, 체계적·상시적 감독 체계로 전환하고 있습니다. 이는 거래소 시장 신뢰도 제고는 물론, 향후 KRW 연동 스테이블코인 제도 설계에도 중요한 기반이 될 수 있습니다.

Link:
https://www.yna.co.kr/view/AKR20260209030100002

[Global]
CFTC, ‘결제용 스테이블코인(payment stablecoin)’ 정의에 National Trust Bank 포함

요약
미국 상품선물거래위원회(CFTC) 시장참여자부는 Staff Letter 25-40을 재발행하며 제한적 개정을 실시했습니다. 이번 개정으로 National Trust Bank도 Staff no-action 입장 하에서 “결제용 스테이블코인(payment stablecoin)”의 허용 발행자로 인정될 수 있도록 정의가 확대되었습니다. (마진 담보 관련 맥락)

시사점 (Why it matters)
적격 발행자 범위 확대는 규제된 파생상품·청산 인프라 내에서 스테이블코인의 제도권 활용을 가속화할 수 있습니다.

Link:
https://www.cftc.gov/PressRoom/PressReleases/9180-26

====================================================================

🌍 English Version

[KR]
Korea FSS targets crypto market manipulation; sets up Digital Asset Basic Act prep team (incl. stablecoins)

Summary
Korea’s Financial Supervisory Service (FSS) announced planned investigations into high-risk crypto market misconduct and the development of AI-assisted detection systems. It also formed a dedicated preparation team for the upcoming “Digital Asset Basic Act,” including disclosure standards, licensing review manuals, and supervisory framework preparation for stablecoin issuers.

Why it matters
Korea is shifting from reactive enforcement to systemized, ongoing supervision. This is significant for exchange integrity and for the potential design of a future KRW-linked stablecoin regime.

Link:
https://www.yna.co.kr/view/AKR20260209030100002

[Global]
CFTC updates “payment stablecoin” definition to include national trust banks (margin collateral context)

Summary
The CFTC’s Market Participants Division reissued Staff Letter 25-40 with a limited revision. A national trust bank can now qualify as a permitted issuer of a “payment stablecoin” for margin collateral purposes.

Why it matters
Expanding the range of eligible issuers may accelerate institutional adoption of stablecoins within regulated derivatives and clearing infrastructure.

Link:
https://www.cftc.gov/PressRoom/PressReleases/9180-26
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
            title: 'Stablecoin / Crypto News Brief — 2026-02-11 (seed)',
            body: SAMPLE_BODY,
            source: 'seed',
            createdAt: new Date('2026-02-11T00:00:00.000Z'),
            updatedAt: new Date('2026-02-11T00:00:00.000Z')
          }
        ]

    const items = await Promise.all(
      baseItems.map(async (item: any) => {
        const raw = String(item.body || '')
        const body = formatMarkdown(raw, { addBlankLineAfterLink: true })

        return {
          ...item,
          title: String(item.title || '').replaceAll('??', ''),
          body
        }
      })
    )

    return NextResponse.json({ items })
  } catch (err: any) {
    // Prisma error P2021: table does not exist
    if (err?.code === 'P2021') {
      const body = formatMarkdown(SAMPLE_BODY, { addBlankLineAfterLink: true })

      return NextResponse.json({
        items: [
          {
            id: 'seed-brief-2026-02-11',
            title: 'Stablecoin / Crypto News Brief — 2026-02-11 (seed)',
            source: 'seed',
            createdAt: new Date('2026-02-11T00:00:00.000Z'),
            updatedAt: new Date('2026-02-11T00:00:00.000Z'),
            body
          }
        ]
      })
    }

    console.error('Failed to fetch news:', err)
    return NextResponse.json({ items: [], error: 'Internal Server Error' }, { status: 500 })
  }
}
