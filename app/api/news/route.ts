import { NextResponse } from 'next/server'
import { formatMarkdown } from './format'

// NOTE: We do NOT translate or use a DB at runtime.
// We serve a seed markdown body (KR then EN) from app/api/news/seed.md.

// - fetch rows
// - return safe empty list if DB/table isn't initialized (common on fresh Vercel deploy)
import fs from 'node:fs'
import path from 'node:path'

const SEED_PATH = path.join(process.cwd(), 'app', 'api', 'news', 'seed.md')
const BRIEFS_DIR = path.join(process.cwd(), 'data', 'briefs')

function safeRead(p: string): string {
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8')
  } catch {}
  return ''
}

function getSeedBody(): string {
  return safeRead(SEED_PATH)
}

function parseBriefMetaFromFilename(name: string): { source: string; createdAt: string } {
  // Expected forms:
  // - main-YYYY-MM-DD-HHmmss.md
  // - backup-YYYY-MM-DD-HHmmss.md
  // - manual-YYYY-MM-DD-HHmmss.md
  const base = name.replace(/\.md$/i, '')
  const [prefix, rest] = base.split('-', 2)
  const ts = base.slice(prefix.length + 1) // after "prefix-"

  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})$/)
  if (m) {
    const [, Y, Mo, D, h, mi, s] = m
    // ISO (no TZ) -> treat as local in UI by Date parsing; good enough for grouping
    const createdAt = `${Y}-${Mo}-${D}T${h}:${mi}:${s}.000+09:00`
    return { source: prefix || 'brief', createdAt }
  }

  return { source: prefix || 'brief', createdAt: new Date().toISOString() }
}

function listBriefFiles(): string[] {
  try {
    if (!fs.existsSync(BRIEFS_DIR)) return []
    const names = fs
      .readdirSync(BRIEFS_DIR)
      .filter((n) => n.toLowerCase().endsWith('.md'))
      .sort() // ascending
    return names.map((n) => path.join(BRIEFS_DIR, n))
  } catch {
    return []
  }
}

const FALLBACK_BODY = `
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
  const files = listBriefFiles()
  const items = files
    .slice(-30)
    .reverse()
    .map((fullPath) => {
      const filename = path.basename(fullPath)
      const raw = safeRead(fullPath)
      const body = formatMarkdown(raw, { addBlankLineAfterLink: true })
      const { source, createdAt } = parseBriefMetaFromFilename(filename)

      return {
        id: filename,
        title: 'Digital Asset & Stablecoin Regulatory Brief',
        source,
        createdAt,
        updatedAt: createdAt,
        body
      }
    })

  if (items.length > 0) {
    return NextResponse.json({ items })
  }

  // Fallback to seed for fresh deploys
  const seed = getSeedBody() || FALLBACK_BODY
  const body = formatMarkdown(seed, { addBlankLineAfterLink: true })
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
