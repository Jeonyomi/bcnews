import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error('Missing env SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing env SUPABASE_SERVICE_ROLE_KEY')

const BRIEFS_DIR = path.join(process.cwd(), 'data', 'briefs')

function listBriefFiles() {
  if (!fs.existsSync(BRIEFS_DIR)) return []
  return fs
    .readdirSync(BRIEFS_DIR)
    .filter((n) => n.toLowerCase().endsWith('.md'))
    .sort()
    .map((n) => path.join(BRIEFS_DIR, n))
}

function parseMetaFromFilename(filename) {
  const name = filename.replace(/\.md$/i, '')
  const [prefix] = name.split('-', 1)
  const ts = name.slice(prefix.length + 1)
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})$/)
  if (m) {
    const [, Y, Mo, D, h, mi, s] = m
    // Asia/Seoul local time stamp encoded in filename
    const createdAt = `${Y}-${Mo}-${D}T${h}:${mi}:${s}.000+09:00`
    return { source: prefix || 'brief', createdAt }
  }
  return { source: prefix || 'brief', createdAt: new Date().toISOString() }
}

const files = listBriefFiles()
if (files.length === 0) {
  console.log('No brief files found under', BRIEFS_DIR)
  process.exit(0)
}

const fullPath = files[files.length - 1]
const filename = path.basename(fullPath)
const content_md = fs.readFileSync(fullPath, 'utf8').trim()

const { createdAt } = parseMetaFromFilename(filename)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const title = 'Digital Asset & Stablecoin Regulatory Brief'

const { data, error } = await supabase
  .from('news_briefs')
  .insert([
    {
      title,
      content_md,
      created_at: createdAt
    }
  ])
  .select('id, created_at')
  .single()

if (error) {
  console.error('Supabase insert failed:', error)
  process.exit(1)
}

console.log('OK inserted:', data)
