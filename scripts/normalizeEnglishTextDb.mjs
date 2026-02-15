import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const clean = (v) => {
  if (typeof v !== 'string') return v
  let s = v
    .replace(/a�?/g, "'")
    .replace(/a�\|/g, '...')
    .replace(/\.{3}/g, '')
    .replace(/([A-Za-z])'([A-Za-z])/g, '$1a$2')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // enforce mostly-english display (remove remaining mojibake symbols)
  s = s.replace(/[^\x20-\x7E]/g, '')
  s = s.replace(/\s{2,}/g, ' ').trim()
  return s
}

async function patchTable(table, cols, limit = 5000) {
  const { data, error } = await supabase.from(table).select(['id', ...cols].join(',')).limit(limit)
  if (error) throw error
  let fixed = 0
  for (const row of data || []) {
    const next = {}
    let changed = false
    for (const c of cols) {
      const n = clean(row[c])
      next[c] = n
      if (n !== row[c]) changed = true
    }
    if (changed) {
      const { error: uErr } = await supabase.from(table).update(next).eq('id', row.id)
      if (uErr) throw uErr
      fixed += 1
    }
  }
  return fixed
}

async function main() {
  const issues = await patchTable('issues', ['title', 'issue_summary', 'why_it_matters'])
  const articles = await patchTable('articles', ['title', 'summary_short', 'why_it_matters'])
  const updates = await patchTable('issue_updates', ['update_summary'])
  console.log(JSON.stringify({ issues, articles, updates }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
