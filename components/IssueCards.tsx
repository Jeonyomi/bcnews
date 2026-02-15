import Link from 'next/link'
import { formatSeoulDateTime } from '@/lib/datetime'

export function IssueSummaryCard({ issue }: { issue: any }) {
  const trim = (text: string, max: number) => (text && text.length > max ? `${text.slice(0, max)}...` : text)

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold">
          <Link href={`/issues/${issue.id}`} className="hover:underline">
            {issue.title}
          </Link>
        </h3>
        <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-200">
          {issue.importance_label || 'watch'}
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {trim(issue.issue_summary || issue.why_it_matters || '', 132)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="rounded bg-gray-100 px-2 py-1 dark:bg-gray-800">{issue.region}</span>
        <span className="rounded bg-gray-100 px-2 py-1 dark:bg-gray-800">{issue.topic_label}</span>
        <span className="rounded bg-gray-100 px-2 py-1 dark:bg-gray-800">updates: {issue.recent_updates_count || 0}</span>
        {issue.confidence_label ? (
          <span className="rounded bg-gray-100 px-2 py-1 dark:bg-gray-800">{issue.confidence_label}</span>
        ) : null}
      </div>
      <div className="mt-2 text-xs text-gray-500">
        {issue.last_seen_at_utc ? formatSeoulDateTime(issue.last_seen_at_utc) : ''}
      </div>
    </article>
  )
}

export function ArticleTableRow({ article }: { article: any }) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
      <td className="px-3 py-2 align-top text-sm leading-5">
        <a href={article.url} className="font-medium hover:underline" target="_blank" rel="noreferrer">
          {article.title}
        </a>
        <div className="mt-1 text-xs leading-5 text-gray-500">
          {article.summary_short ? <span>{article.summary_short}</span> : null}
        </div>
      </td>
      <td className="px-3 py-2 align-top text-xs text-gray-500">{article.region}</td>
      <td className="px-3 py-2 align-top text-xs">
        {article.issue_id ? (
          <a
            href={`/issues/${article.issue_id}`}
            className="inline-block rounded bg-emerald-100 px-2 py-1 leading-none text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
          >
            ISSUE #{article.issue_id}
          </a>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top text-xs text-gray-500">
        {article.importance_label || 'watch'}
      </td>
      <td className="px-3 py-2 align-top text-xs text-gray-500">
        {article.confidence_label || '-'}
      </td>
      <td className="px-3 py-2 align-top text-xs text-gray-500">
        {article.published_at_utc ? formatSeoulDateTime(article.published_at_utc) : '-'}
      </td>
    </tr>
  )
}


