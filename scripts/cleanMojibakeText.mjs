import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const fix = (v) =>
  typeof v === 'string'
    ? v.replace(/a�?/g, "'").replace(/a�\|/g, '...').replace(/�/g, '').trim()
    : v

async function run() {
  let issuesFixed = 0
  const { data: issues, error: issueErr } = await supabase
    .from('issues')
    .select('id,title,issue_summary,why_it_matters')

  if (issueErr) throw issueErr

  for (const row of issues || []) {
    const next = {
      title: fix(row.title),
      issue_summary: fix(row.issue_summary),
      why_it_matters: fix(row.why_it_matters),
    }

    if (
      next.title !== row.title ||
      next.issue_summary !== row.issue_summary ||
      next.why_it_matters !== row.why_it_matters
    ) {
      const { error } = await supabase.from('issues').update(next).eq('id', row.id)
      if (error) throw error
      issuesFixed += 1
    }
  }

  let articlesFixed = 0
  const { data: articles, error: articleErr } = await supabase
    .from('articles')
    .select('id,title,summary_short,why_it_matters')
    .limit(5000)

  if (articleErr) throw articleErr

  for (const row of articles || []) {
    const next = {
      title: fix(row.title),
      summary_short: fix(row.summary_short),
      why_it_matters: fix(row.why_it_matters),
    }

    if (
      next.title !== row.title ||
      next.summary_short !== row.summary_short ||
      next.why_it_matters !== row.why_it_matters
    ) {
      const { error } = await supabase.from('articles').update(next).eq('id', row.id)
      if (error) throw error
      articlesFixed += 1
    }
  }

  console.log(JSON.stringify({ issuesFixed, articlesFixed }, null, 2))
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
