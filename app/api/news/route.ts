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
import fs from 'node:fs'
import path from 'node:path'

function getSeedBody(): string {
  try {
    const p = path.join(process.cwd(), 'app', 'api', 'news', 'seed.md')
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8')
  } catch {}
  return ''
}

const SAMPLE_BODY = getSeedBody() || `
📰 Digital Asset & Stablecoin Regulatory Brief

## 🇰🇷 한국어 버전

[KR]
(Seed not set yet)

====================================================================

## 🌍 English Version

[KR]
(Seed not set yet)
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
