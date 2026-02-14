import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import 'dotenv/config'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const sourceMap = [
  { date: '2026-02-13', file: path.resolve('data/briefs/main-2026-02-13-110500.md') },
  { date: '2026-02-12', file: path.resolve('data/briefs/main-2026-02-12-103200.md') }
]

const stripBrandLine = (s = '') =>
  s
    .replace(/^#\s*Digital Asset & Stablecoin Regulatory Brief\b:?\s*/i, '')
    .replace(/^#\s*Digital Asset & Stablecoin Daily News Brief\b:?\s*/i, '')
    .trim()

const parseBody = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8')
  let body = raw
  if (raw.startsWith('---')) {
    const endFrontMatter = raw.indexOf('---', 3)
    if (endFrontMatter !== -1) {
      body = raw.slice(endFrontMatter + 3)
    }
  }

  const lines = body.replace(/^\n+/, '').split(/\r?\n/)
  const out = [...lines]
  let i = 0
  while (i < out.length && out[i].trim() === '') i += 1

  if (i < out.length) {
    const first = out[i].trim()
    const cleaned = stripBrandLine(first)
    if (cleaned) out[i] = `# ${cleaned}`
  }

  while (i < out.length && out[i].startsWith('##')) {
    i += 1
  }

  return out.join('\n').trim()
}

for (const { date, file } of sourceMap) {
  const start = `${date}T00:00:00+00:00`
  const endDate = new Date(`${date}T00:00:00+00:00`)
  endDate.setUTCDate(endDate.getUTCDate() + 1)
  const end = endDate.toISOString()

  const { data: rows, error } = await supabase
    .from('news_briefs')
    .select('id, created_at_kst')
    .gte('created_at_kst', start)
    .lt('created_at_kst', end)
    .order('created_at_kst', { ascending: false })
    .limit(1)

  if (error) {
    console.error('lookup fail', date, error)
    continue
  }

  if (!rows || rows.length === 0) {
    console.log('No DB row for date', date)
    continue
  }

  const row = rows[0]
  const content = parseBody(file)

  const { error: updateError } = await supabase
    .from('news_briefs')
    .update({ content })
    .eq('id', row.id)

  if (updateError) {
    console.error('update fail', date, row.id, updateError)
  } else {
    console.log('updated', date, row.id)
  }
}

// 2/11 exists? not found, skip intentionally
