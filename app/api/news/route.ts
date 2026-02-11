import { NextResponse } from 'next/server'
import { formatMarkdown } from './format'

// NOTE: We do NOT translate or use a DB at runtime.
// We serve a seed markdown body (KR then EN) from app/api/news/seed.md.

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
  const body = formatMarkdown(SAMPLE_BODY, { addBlankLineAfterLink: true })
  const now = new Date().toISOString()

  return NextResponse.json({
    items: [
      {
        id: 'seed-brief',
        title: 'Digital Asset & Stablecoin Regulatory Brief',
        source: 'seed',
        createdAt: now,
        updatedAt: now,
        body
      }
    ]
  })
}
