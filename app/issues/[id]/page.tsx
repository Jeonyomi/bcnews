'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const REFRESH_REQUEST_EVENT = 'bcnews:refresh-request'
const REFRESH_DONE_EVENT = 'bcnews:refresh-done'

interface Issue {
  id: number
  title: string
  region: string
  first_seen_at_utc: string
  last_seen_at_utc: string
  issue_summary: string
  why_it_matters: string | null
  topic_label: string
  importance_label: string
  importance_score: number
  representative_article?: { id: number; title: string; url: string }
}

export default function IssueDetailPage() {
  const [issue, setIssue] = useState<Issue | null>(null)
  const [updates, setUpdates] = useState<any[]>([])
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const params = useParams<{ id: string }>()
  const id = params?.id

  const run = useCallback(async () => {
    if (!id) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/issues/${id}`)
      const payload = await res.json()
      if (payload.ok) {
        setIssue(payload.data.issue)
        setUpdates(payload.data.issue_updates || [])
        setArticles(payload.data.related_articles || [])

        const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        window.dispatchEvent(
          new CustomEvent(REFRESH_DONE_EVENT, {
            detail: {
              pathname: window.location.pathname,
              lastUpdatedAt: now,
            },
          }),
        )
      } else {
        throw new Error(payload?.error || 'Issue not found')
      }
    } catch (e) {
      console.error('load issue detail failed', e)
      setError(e instanceof Error ? e.message : 'Failed to load issue')
      setIssue(null)
      setUpdates([])
      setArticles([])
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ pathname?: string }>
      if (custom.detail?.pathname === window.location.pathname) {
        void run()
      }
    }

    window.addEventListener(REFRESH_REQUEST_EVENT, handler)
    return () => window.removeEventListener(REFRESH_REQUEST_EVENT, handler)
  }, [run])

  useEffect(() => {
    void run()
  }, [run])

  if (loading) return <div className="text-sm text-gray-500">Loading issue...</div>
  if (!issue) return <div className="text-sm text-gray-500">Issue not found.</div>

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">{issue.title}</h1>

      <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-gray-100 px-2 py-1 dark:bg-gray-800">{issue.region}</span>
          <span className="rounded bg-gray-100 px-2 py-1 dark:bg-gray-800">{issue.topic_label}</span>
          <span className="rounded bg-gray-100 px-2 py-1 dark:bg-gray-800">{issue.importance_label}</span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">{issue.issue_summary}</p>
        {issue.why_it_matters ? <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{issue.why_it_matters}</p> : null}
        <div className="mt-2 text-xs text-gray-500">
          first seen {new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }).format(new Date(issue.first_seen_at_utc))}
          {' · '}
          last seen {new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }).format(new Date(issue.last_seen_at_utc))}
        </div>
        {issue.representative_article ? (
          <a href={issue.representative_article.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
            Representative source article
          </a>
        ) : null}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Update Timeline</h2>
        <div className="space-y-3">
          {updates.length === 0 ? <div className="text-sm text-gray-500">No timeline entries.</div> : null}
          {updates.map((update) => (
            <div key={update.id} className="rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-sm font-medium">{update.update_summary}</div>
              <div className="text-xs text-gray-500">
                {new Intl.DateTimeFormat('ko-KR', {
                  timeZone: 'Asia/Seoul',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(update.update_at_utc))}
                {' · '}
                confidence: {update.confidence_label || 'medium'}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Related Articles</h2>
        <div className="space-y-2">
          {articles.length === 0 ? <div className="text-sm text-gray-500">No related articles.</div> : null}
          {articles.map((article) => (
            <div key={article.id} className="rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
              <a href={article.url} target="_blank" rel="noreferrer" className="font-medium text-sm hover:underline">
                {article.title}
              </a>
              <p className="text-xs text-gray-600 dark:text-gray-300">{article.summary_short}</p>
              <div className="mt-1 text-xs text-gray-500">
                <Link href={`/articles?search=${encodeURIComponent(article.title)}`}>Open in Articles</Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
