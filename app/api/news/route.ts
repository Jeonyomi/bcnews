import { NextResponse } from 'next/server'
import { formatMarkdown } from './format'

import fs from 'node:fs'
import path from 'node:path'

// Optional: Supabase read (works on Vercel)
import { createClient } from '@supabase/supabase-js'

const SEED_PATH = path.join(process.cwd(), 'app', 'api', 'news', 'seed.md')
const BRIEFS_DIR = path.join(process.cwd(), 'data', 'briefs')

function getSupabaseReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

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
  // 1) Try Supabase (for Vercel deployments)
  const supabase = getSupabaseReadClient()
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('news_briefs')
        .select('id, created_at, title, content_md')
        .order('created_at', { ascending: false })
        .limit(30)

      if (!error && data && data.length > 0) {
        const items = data.map((r: any) => {
          const createdAt = r.created_at || new Date().toISOString()
          const body = formatMarkdown(r.content_md || '', { addBlankLineAfterLink: true })
          return {
            id: String(r.id),
            title: r.title || 'Digital Asset & Stablecoin Regulatory Brief',
            source: 'supabase',
            createdAt,
            updatedAt: createdAt,
            body
          }
        })
        return NextResponse.json({ items })
      }
    } catch {
      // ignore and fall through
    }
  }

  // 2) Local markdown files (works in dev / local runs)
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

  // 3) Fallback to seed for fresh deploys
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
