import 'dotenv/config'
import pg from 'postgres'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) throw new Error('Missing DATABASE_URL')

const sql = pg(dbUrl, { ssl: 'require' })

const strip = (value) => {
  if (!value) return value
  const text = String(value)
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&nbsp/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&#(?:x[a-fA-F0-9]{1,6}|[0-9]{1,7});/g, (match) => {
      const token = match.slice(2, -1)
      const code = token.toLowerCase().startsWith('x')
        ? Number.parseInt(token.slice(1), 16)
        : Number.parseInt(token, 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    })
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function run() {
  const issues = await sql`SELECT id, issue_summary, why_it_matters, title FROM issues`
  for (const row of issues) {
    const next = {
      issue_summary: strip(row.issue_summary),
      why_it_matters: strip(row.why_it_matters),
      title: strip(row.title),
    }

    const changed =
      next.issue_summary !== row.issue_summary ||
      next.why_it_matters !== row.why_it_matters ||
      next.title !== row.title

    if (changed) {
      await sql`UPDATE issues SET issue_summary=${next.issue_summary}, why_it_matters=${next.why_it_matters}, title=${next.title} WHERE id=${row.id}`
    }
  }

  const articles = await sql`SELECT id, title, summary_short, why_it_matters FROM articles`
  for (const row of articles) {
    const next = {
      title: strip(row.title),
      summary_short: strip(row.summary_short),
      why_it_matters: strip(row.why_it_matters),
    }

    const changed =
      next.title !== row.title ||
      next.summary_short !== row.summary_short ||
      next.why_it_matters !== row.why_it_matters

    if (changed) {
      await sql`UPDATE articles SET title=${next.title}, summary_short=${next.summary_short}, why_it_matters=${next.why_it_matters} WHERE id=${row.id}`
    }
  }

  const cleanedIssues = await sql`SELECT count(*)::int AS count FROM issues WHERE issue_summary ~ '<[^>]+>' OR issue_summary LIKE '%&#%' OR issue_summary ILIKE '%&amp;%'
`
  const cleanedArticles = await sql`SELECT count(*)::int AS count FROM articles WHERE summary_short ~ '<[^>]+>' OR summary_short LIKE '%&#%' OR summary_short ILIKE '%&amp;%'`

  console.log('cleaned issues remaining:', cleanedIssues[0]?.count)
  console.log('cleaned articles remaining:', cleanedArticles[0]?.count)

  await sql.end()
}

run().catch(async (error) => {
  console.error(error)
  await sql.end()
  process.exit(1)
})
